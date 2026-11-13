import 'server-only';
import { db } from '@/lib/db';
import { monthEnd, monthLabel, markStatementPaid, xeroSettings } from '@/lib/billing';
import { XeroError, xero, xeroStatus } from '@/lib/integrations/xero';
import { readStoredFile } from '@/lib/integrations/files';
import { poKey } from '@/lib/purchase-orders';

/** Everything that goes to Xero, built from our records. The queue (XeroJob) calls these; see enqueueXero for what queues them. */
class Wait extends Error {} // not ready yet (a setting is missing, or a document it depends on is not in Xero yet)

const pounds = (p: number) => Math.round(p) / 100;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const ukDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const MAX_ATTEMPTS = 6;

type Addr = { line1?: string; line2?: string; town?: string; county?: string; postcode?: string };
const xeroAddress = (type: 'STREET' | 'POBOX', a: Addr | undefined) => (a && (a.line1 || a.postcode) ? { AddressType: type, AddressLine1: a.line1 ?? '', AddressLine2: a.line2 ?? '', City: a.town ?? '', Region: a.county ?? '', PostalCode: a.postcode ?? '', Country: 'United Kingdom' } : null);
const splitName = (full: string) => { const p = full.trim().split(/\s+/); return { first: p[0] ?? '', last: p.slice(1).join(' ') }; };

/** A line of free text in the registered address field, for accounts created before addresses were structured. */
function legacyAddress(text: string): Addr {
  const parts = text.split(/\n|,\s*/).map((x) => x.trim()).filter(Boolean);
  const pc = parts.length && /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(parts[parts.length - 1]) ? parts.pop()! : '';
  return { line1: parts[0], line2: parts[1], town: parts[2], county: parts.slice(3).join(', '), postcode: pc };
}

type ContactResult = { Contacts: { ContactID: string }[] };

async function createContact(body: Record<string, unknown>, idem: string): Promise<string> {
  try {
    return (await xero<ContactResult>('PUT', '/Contacts', { Contacts: [body] }, idem)).Contacts[0].ContactID;
  } catch (e) {
    // Names are unique in Xero. If another contact has this name, add something to tell them apart.
    if (e instanceof XeroError && /already assigned|already exists|unique/i.test(e.message)) {
      const alt = `${body.Name} (${body.CompanyNumber ?? body.EmailAddress ?? body.AccountNumber ?? 'ECI-Hub'})`;
      return (await xero<ContactResult>('PUT', '/Contacts', { Contacts: [{ ...body, Name: alt }] }, `${idem}:alt`)).Contacts[0].ContactID;
    }
    throw e;
  }
}

export async function ensurePersonContact(personId: string): Promise<string> {
  const p = await db.person.findUniqueOrThrow({ where: { id: personId } });
  if (p.xeroContactId) return p.xeroContactId;
  const email = p.email.replace(/"/g, '');
  const found = await xero<ContactResult>('GET', `/Contacts?where=${encodeURIComponent(`EmailAddress=="${email}"`)}`);
  const id = found.Contacts?.[0]?.ContactID ?? (await createContact({ Name: `${p.firstName} ${p.lastName === '-' ? '' : p.lastName}`.trim(), FirstName: p.firstName, LastName: p.lastName === '-' ? '' : p.lastName, EmailAddress: p.email, IsCustomer: true, DefaultCurrency: 'GBP', ...(p.mobile ? { Phones: [{ PhoneType: 'MOBILE', PhoneNumber: p.mobile }] } : {}) }, `contact:person:${p.id}`));
  await db.person.update({ where: { id: p.id }, data: { xeroContactId: id } });
  return id;
}

/** The full company contact: every field the application form collects, mapped onto the Xero contact. */
export async function ensureAccountContact(accountId: string): Promise<string> {
  const a = await db.account.findUniqueOrThrow({ where: { id: accountId }, include: { members: { where: { status: { not: 'REMOVED' } }, include: { person: true }, orderBy: { role: 'asc' } } } });
  const adr = (a.addresses ?? {}) as { registered?: Addr; invoice?: Addr };
  const registered = adr.registered ?? legacyAddress(a.registeredAddress);
  const invoice = adr.invoice && (adr.invoice.line1 || adr.invoice.postcode) ? adr.invoice : a.invoiceAddress ? legacyAddress(a.invoiceAddress) : registered;
  const acct = splitName(a.accountsName);
  const persons = [
    { FirstName: acct.first, LastName: acct.last, EmailAddress: a.accountsEmail, IncludeInEmails: true },
    ...a.members.filter((m) => m.person.email.toLowerCase() !== a.accountsEmail.toLowerCase()).map((m) => ({ FirstName: m.person.firstName, LastName: m.person.lastName === '-' ? '' : m.person.lastName, EmailAddress: m.person.email, IncludeInEmails: false })),
  ].slice(0, 5); // Xero allows five contact persons
  const body: Record<string, unknown> = {
    Name: a.company, AccountNumber: `ECI-${a.companyNumber}`.slice(0, 50), FirstName: acct.first, LastName: acct.last, EmailAddress: a.accountsEmail,
    TaxNumber: a.vatNumber ?? undefined, CompanyNumber: a.companyNumber, Website: a.website ?? undefined, IsCustomer: true, DefaultCurrency: 'GBP', ContactStatus: 'ACTIVE',
    Addresses: [xeroAddress('STREET', registered), xeroAddress('POBOX', invoice)].filter(Boolean),
    Phones: a.accountsPhone ? [{ PhoneType: 'DEFAULT', PhoneNumber: a.accountsPhone }] : [],
    ContactPersons: persons,
    PaymentTerms: { Sales: { Day: a.paymentTermsDays, Type: 'DAYSAFTERBILLDATE' } },
  };
  let id = a.xeroContactId;
  if (!id) {
    const found = await xero<ContactResult>('GET', `/Contacts?where=${encodeURIComponent(`AccountNumber=="${body.AccountNumber}"`)}`);
    id = found.Contacts?.[0]?.ContactID ?? null;
  }
  if (id) await xero('POST', `/Contacts/${id}`, { Contacts: [{ ...body, ContactID: id }] }, `contact:account:${a.id}:${Date.now()}`);
  else id = await createContact(body, `contact:account:${a.id}`);
  if (id !== a.xeroContactId) await db.account.update({ where: { id: a.id }, data: { xeroContactId: id } });
  return id;
}

async function needClearing(): Promise<{ accountCode: string; taxCode: string; clearing: string }> {
  const x = await xeroSettings();
  if (!x.stripeClearingCode) throw new Wait('Set the Stripe clearing account code in Settings, Credit accounts and Xero.');
  return { accountCode: x.accountCode, taxCode: x.taxCode, clearing: x.stripeClearingCode };
}

type InvoiceResult = { Invoices: { InvoiceID: string; InvoiceNumber?: string; Status: string }[] };
type CreditNoteResult = { CreditNotes: { CreditNoteID: string }[] };

/** A card booking: the invoice (authorised) and the Stripe payment against the clearing account, so it reconciles. */
async function cardInvoice(bookingId: string): Promise<string> {
  const { accountCode, taxCode, clearing } = await needClearing();
  const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { course: true, session: true, booker: true, payments: true } });
  let invoiceId = b.xeroInvoiceId;
  if (!invoiceId) {
    const contact = await ensurePersonContact(b.bookerId);
    const day = ukDay(b.createdAt);
    const when = b.session ? `, ${ukDay(b.session.startsAt)}` : '';
    const r = await xero<InvoiceResult>('PUT', '/Invoices', { Invoices: [{ Type: 'ACCREC', Contact: { ContactID: contact }, Date: day, DueDate: day, Reference: b.reference, Status: 'AUTHORISED', LineAmountTypes: 'Exclusive', CurrencyCode: 'GBP', LineItems: [{ Description: `${b.course.title}${when} (${b.reference})`, Quantity: b.places, UnitAmount: pounds(b.subtotalPence / b.places), AccountCode: accountCode, TaxType: taxCode }] }] }, `inv:${b.id}`);
    invoiceId = r.Invoices[0].InvoiceID;
    await db.booking.update({ where: { id: b.id }, data: { xeroInvoiceId: invoiceId, xeroInvoiceNo: r.Invoices[0].InvoiceNumber ?? null } });
  }
  const pay = b.payments.find((p) => p.status !== 'failed');
  if (pay && !pay.xeroPaymentId) {
    const r = await xero<{ Payments: { PaymentID: string }[] }>('PUT', '/Payments', { Payments: [{ Invoice: { InvoiceID: invoiceId }, Account: { Code: clearing }, Date: ukDay(b.createdAt), Amount: pounds(pay.amountPence), Reference: pay.stripeIntentId.slice(0, 255) }] }, `pay:${pay.id}`);
    await db.payment.update({ where: { id: pay.id }, data: { xeroPaymentId: r.Payments[0].PaymentID } });
  }
  return invoiceId;
}

/** A refund on a paid card booking: a credit note for the amount, paid out from the Stripe clearing account. */
async function creditNote(jobId: string, bookingId: string, amountPence: number, payload: { creditNoteId?: string }): Promise<string> {
  const { accountCode, taxCode, clearing } = await needClearing();
  const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { course: true } });
  if (!b.xeroInvoiceId) throw new Wait('Waiting for the invoice for this booking to reach Xero first.');
  let id = payload.creditNoteId;
  if (!id) {
    const contact = await ensurePersonContact(b.bookerId);
    const day = ukDay(new Date());
    const r = await xero<CreditNoteResult>('PUT', '/CreditNotes', { CreditNotes: [{ Type: 'ACCRECCREDIT', Contact: { ContactID: contact }, Date: day, Reference: `Refund ${b.reference}`, Status: 'AUTHORISED', LineAmountTypes: 'Inclusive', CurrencyCode: 'GBP', LineItems: [{ Description: `Refund: ${b.course.title} (${b.reference})`, Quantity: 1, UnitAmount: pounds(amountPence), AccountCode: accountCode, TaxType: taxCode }] }] }, `cn:${jobId}`);
    id = r.CreditNotes[0].CreditNoteID;
    await db.xeroJob.update({ where: { id: jobId }, data: { payload: { ...payload, amountPence, creditNoteId: id } } }); // so a retry does not create it twice
  }
  await xero('PUT', '/Payments', { Payments: [{ CreditNote: { CreditNoteID: id }, Account: { Code: clearing }, Date: ukDay(new Date()), Amount: pounds(amountPence), Reference: `Stripe refund ${b.reference}` }] }, `cnpay:${jobId}`);
  return id;
}

const MAX_XERO_ATTACHMENTS = 10; // Xero allows about ten attachments on an invoice

/** The PO files for the POs on this statement go onto its Xero invoice. Safe to repeat: a file already attached is skipped. */
async function attachPoFilesToInvoice(statementId: string, invoiceId: string) {
  const st = await db.statement.findUniqueOrThrow({ where: { id: statementId }, include: { lines: { include: { booking: { select: { poNumber: true } } } } } });
  const keys = [...new Set(st.lines.map((l) => poKey(l.booking.poNumber ?? '')).filter(Boolean))];
  if (!keys.length) return;
  const files = await db.poFile.findMany({ where: { purchaseOrder: { accountId: st.accountId, key: { in: keys } } }, orderBy: { createdAt: 'asc' } });
  const todo = files.filter((f) => !f.xeroAttachedTo.includes(invoiceId));
  const room = Math.max(0, MAX_XERO_ATTACHMENTS - (files.length - todo.length));
  const used = new Set<string>();
  for (const f of todo.slice(0, room)) {
    const stored = await readStoredFile(f.fileKey);
    if (!stored) continue;
    let name = f.fileName.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) || 'purchase-order';
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${i}-${f.fileName.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 110)}`;
    used.add(name.toLowerCase());
    await xero('POST', `/Invoices/${invoiceId}/Attachments/${encodeURIComponent(name)}`, undefined, undefined, { data: stored.body, contentType: stored.type });
    await db.poFile.update({ where: { id: f.id }, data: { xeroAttachedTo: { push: invoiceId } } });
  }
  if (todo.length > room) {
    const title = `Too many PO files for the Xero invoice (${st.month})`;
    const open = await db.task.findFirst({ where: { type: 'INTEGRATION_FAILURE', recordType: 'Statement', recordId: st.id, status: 'OPEN' } });
    if (!open) await db.task.create({ data: { type: 'INTEGRATION_FAILURE', title, detail: `Xero takes up to ${MAX_XERO_ATTACHMENTS} attachments on an invoice. ${todo.length - room} PO file(s) were not sent. Download them from the account page and add them in Xero by hand.`, recordType: 'Statement', recordId: st.id } });
  }
}

/** One month's account statement as a single DRAFT invoice: a line per booking, for Kirsty to review and approve in Xero. */
async function accountDraft(statementId: string): Promise<string> {
  const x = await xeroSettings();
  const st = await db.statement.findUniqueOrThrow({ where: { id: statementId }, include: { account: true, lines: { include: { booking: true }, orderBy: { id: 'asc' } } } });
  if (st.xeroInvoiceId) { await attachPoFilesToInvoice(st.id, st.xeroInvoiceId); return st.xeroInvoiceId; }
  if (!st.lines.length || st.lines.every((l) => l.netPence <= 0)) return 'nothing-to-send';
  const contact = await ensureAccountContact(st.accountId);
  const date = monthEnd(st.month);
  const due = new Date(date.getTime() + st.account.paymentTermsDays * 86400000);
  const pos = [...new Set(st.lines.map((l) => l.booking.poNumber).filter(Boolean))];
  const r = await xero<InvoiceResult>('PUT', '/Invoices', { Invoices: [{ Type: 'ACCREC', Contact: { ContactID: contact }, Date: ymd(date), DueDate: ymd(due), Reference: `Training ${monthLabel(st.month)}${st.account.poRule === 'PER_ACCOUNT' && pos.length === 1 ? `, ${pos[0]}` : ''}`.slice(0, 255), Status: 'DRAFT', LineAmountTypes: 'Exclusive', CurrencyCode: 'GBP', LineItems: st.lines.map((l) => ({ Description: l.description.slice(0, 4000), Quantity: 1, UnitAmount: pounds(l.netPence), AccountCode: x.accountCode, TaxType: x.taxCode })) }] }, `stmt:${st.id}`);
  const inv = r.Invoices[0];
  await db.statement.update({ where: { id: st.id }, data: { xeroInvoiceId: inv.InvoiceID, ...(inv.InvoiceNumber ? { xeroInvoiceNo: inv.InvoiceNumber } : {}) } });
  await attachPoFilesToInvoice(st.id, inv.InvoiceID);
  return inv.InvoiceID;
}

/** Works through the queue. Safe to call often: it does nothing unless Xero is connected, and only one runner works at a time. */
export async function processXeroJobs(limit = 20): Promise<{ done: number; failed: number; waiting: number; skipped?: number }> {
  const out = { done: 0, failed: 0, waiting: 0 };
  if (!(await xeroStatus()).connected) return { ...out, skipped: 1 };
  // Lease the jobs instead of holding a lock: each runner claims a batch for 5 minutes, so two runners never take the same job
  // and a crashed runner's jobs come back on their own.
  const jobs = await db.$queryRaw<{ id: string; kind: string; recordId: string; payload: unknown; attempts: number }[]>`
    UPDATE "XeroJob" SET "nextAttemptAt" = now() + interval '5 minutes'
    WHERE id IN (SELECT id FROM "XeroJob" WHERE status = 'PENDING' AND "nextAttemptAt" <= now() ORDER BY "createdAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    RETURNING id, kind, "recordId", payload, attempts`;
  {
    for (const j of jobs) {
      try {
        const payload = (j.payload ?? {}) as { amountPence?: number; creditNoteId?: string };
        const id = j.kind === 'CARD_INVOICE' ? await cardInvoice(j.recordId)
          : j.kind === 'CREDIT_NOTE' ? await creditNote(j.id, j.recordId, Number(payload.amountPence), payload)
          : j.kind === 'ACCOUNT_DRAFT' ? await accountDraft(j.recordId)
          : await ensureAccountContact(j.recordId);
        await db.xeroJob.update({ where: { id: j.id }, data: { status: 'DONE', xeroId: id, doneAt: new Date(), lastError: null } });
        out.done++;
      } catch (e) {
        const msg = ((e as Error).message ?? 'Unknown error').slice(0, 400);
        if (e instanceof Wait) {
          await db.xeroJob.update({ where: { id: j.id }, data: { lastError: msg, nextAttemptAt: new Date(Date.now() + 10 * 60000) } });
          out.waiting++;
          continue;
        }
        const attempts = j.attempts + 1;
        const giveUp = attempts >= MAX_ATTEMPTS || (e instanceof XeroError && !e.retryable && e.status >= 400 && e.status < 500 && e.status !== 429);
        await db.xeroJob.update({ where: { id: j.id }, data: { attempts, lastError: msg, status: giveUp ? 'FAILED' : 'PENDING', nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60000) } });
        if (giveUp) {
          out.failed++;
          await db.task.create({ data: { type: 'INTEGRATION_FAILURE', title: `Xero did not accept: ${j.kind.toLowerCase().replace('_', ' ')}`, detail: `${msg} In Settings, Credit accounts and Xero, fix the cause and press Retry failed.`, recordType: 'XeroJob', recordId: j.id } });
        }
      }
    }
  }
  return out;
}

/** Fire and forget: try to send what was just queued without making the customer wait. */
export function kickXero() {
  void processXeroJobs(10).catch((e) => console.error('[xero]', e));
}

export async function retryFailedXeroJobs() {
  const r = await db.xeroJob.updateMany({ where: { status: 'FAILED' }, data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date() } });
  return r.count;
}

export async function xeroQueueCounts() {
  const g = await db.xeroJob.groupBy({ by: ['status'], _count: true });
  const n = (s: string) => g.find((x) => x.status === s)?._count ?? 0;
  const last = await db.xeroJob.findFirst({ where: { status: 'DONE' }, orderBy: { doneAt: 'desc' } });
  const error = await db.xeroJob.findFirst({ where: { status: { in: ['PENDING', 'FAILED'] }, lastError: { not: null } }, orderBy: { createdAt: 'desc' } });
  return { pending: n('PENDING'), failed: n('FAILED'), done: n('DONE'), lastDone: last?.doneAt ?? null, lastError: error?.lastError ?? null };
}

/**
 * Looks at the account invoices we sent as drafts: records the invoice number once Kirsty approves them in Xero,
 * and marks the statement paid (restoring the company's credit) when Xero shows the invoice paid.
 */
export async function syncXeroStatements(): Promise<{ paid: number; checked: number }> {
  if (!(await xeroStatus()).connected) return { paid: 0, checked: 0 };
  const sts = await db.statement.findMany({ where: { xeroInvoiceId: { not: null }, status: { in: ['ISSUED', 'OVERDUE'] } }, take: 100 });
  let paid = 0;
  for (let i = 0; i < sts.length; i += 40) {
    const chunk = sts.slice(i, i + 40);
    const r = await xero<{ Invoices: { InvoiceID: string; InvoiceNumber?: string; Status: string }[] }>('GET', `/Invoices?IDs=${chunk.map((s) => s.xeroInvoiceId).join(',')}`);
    for (const inv of r.Invoices ?? []) {
      const st = chunk.find((s) => s.xeroInvoiceId === inv.InvoiceID);
      if (!st) continue;
      if (inv.InvoiceNumber && inv.InvoiceNumber !== st.xeroInvoiceNo) await db.statement.update({ where: { id: st.id }, data: { xeroInvoiceNo: inv.InvoiceNumber } });
      if (inv.Status === 'PAID') { await markStatementPaid(st.id, 'xero', inv.InvoiceNumber); paid++; }
      else if ((inv.Status === 'VOIDED' || inv.Status === 'DELETED') && !(await db.task.findFirst({ where: { type: 'INTEGRATION_FAILURE', recordId: st.id, status: 'OPEN' } }))) {
        await db.task.create({ data: { type: 'INTEGRATION_FAILURE', title: `A Xero invoice was ${inv.Status.toLowerCase()}: statement ${st.month}`, detail: 'The statement in the platform is still open. Check Xero and the account.', recordType: 'Statement', recordId: st.id } });
      }
    }
  }
  return { paid, checked: sts.length };
}
