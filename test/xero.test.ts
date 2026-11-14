import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type Call = { method: string; path: string; body: any; key?: string; raw?: number; contentType?: string };

describe('Xero sync (against a simulated Xero)', async () => {
  process.env.XERO_CLIENT_ID = 'test-client'; process.env.XERO_CLIENT_SECRET = 'test-secret';
  const { db } = await import('@/lib/db');
  const { seal } = await import('@/lib/integrations/xero');
  const { processXeroJobs, syncXeroStatements, retryFailedXeroJobs } = await import('@/lib/xero-sync');
  const { createPendingBooking, confirmCardBooking } = await import('@/lib/booking');
  const { decideCancellation, cancelConfirmedBooking } = await import('@/lib/booking-cancel');
  const { submitApplication, approveAccount } = await import('@/lib/accounts');
  const { createAccountBooking, availableCredit, statementMonth } = await import('@/lib/credit');
  const { closeStatements } = await import('@/lib/billing');
  const { course, booker } = await import('./fixtures');

  const calls: Call[] = [];
  const paid = new Set<string>();
  let n = 0;
  let failWith: { status: number; message: string } | null = null;
  const fake = async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    const method = init?.method ?? 'GET';
    const path = u.pathname.replace('/api.xro/2.0', '') + u.search;
    const isRaw = init?.body instanceof Uint8Array;
    const body = init?.body && !isRaw ? JSON.parse(String(init.body)) : undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ method, path, body, key: headers['Idempotency-Key'], ...(isRaw ? { raw: (init!.body as Uint8Array).length, contentType: headers['Content-Type'] } : {}) } as Call);
    const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
    if (failWith && method !== 'GET') return new Response(JSON.stringify({ Message: failWith.message }), { status: failWith.status });
    if (path.startsWith('/Contacts?where')) return ok({ Contacts: [] });
    if (path === '/Contacts' && body?.Contacts?.[0]?.Name === 'Twin Co') return new Response(JSON.stringify({ Message: 'A validation exception occurred', Elements: [{ ValidationErrors: [{ Message: 'The contact name Twin Co is already assigned to another contact. The contact name must be unique.' }] }] }), { status: 400 });
    if (path === '/Contacts') return ok({ Contacts: [{ ContactID: `c-${++n}` }] });
    if (path.startsWith('/Contacts/')) return ok({ Contacts: [{ ContactID: path.split('/')[2] }] });
    if (path === '/Invoices') return ok({ Invoices: [{ InvoiceID: `inv-${++n}`, InvoiceNumber: body.Invoices[0].Status === 'DRAFT' ? undefined : `INV-${n}`, Status: body.Invoices[0].Status }] });
    if (/^\/Invoices\/[^/]+\/Attachments\//.test(path)) return ok({ Attachments: [{ AttachmentID: `att-${++n}` }] });
    if (path.startsWith('/Accounts?where=')) { const code = decodeURIComponent(path.split('where=')[1]).match(/Code=="(.*)"/)?.[1]; const all = [{ AccountID: 'acc-090', Code: '090' }, { AccountID: 'acc-091', Code: '091' }]; return ok({ Accounts: all.filter((a) => a.Code === code) }); }
    if (path === '/Accounts') return ok({ Accounts: [{ Code: '200', Name: 'Sales', Type: 'REVENUE', Status: 'ACTIVE' }, { Code: '090', Name: 'Stripe clearing', Type: 'CURRENT', Status: 'ACTIVE', EnablePaymentsToAccount: true }, { Code: '091', Name: 'No payments here', Type: 'CURRENT', Status: 'ACTIVE', EnablePaymentsToAccount: false }] });
    if (path === '/TaxRates') return ok({ TaxRates: [{ TaxType: 'OUTPUT2', Name: '20% (VAT on Income)', Status: 'ACTIVE' }] });
    if (path === '/Payments' && body?.Payments?.[0]?.Account?.AccountID === 'acc-999') return new Response(JSON.stringify({ Message: 'A validation exception occurred', Elements: [{ ValidationErrors: [{ Message: 'Account could not be found' }] }] }), { status: 400 });
    if (path === '/Payments') return ok({ Payments: [{ PaymentID: `pay-${++n}` }] });
    if (path === '/CreditNotes') return ok({ CreditNotes: [{ CreditNoteID: `cn-${++n}` }] });
    if (path.startsWith('/Invoices?IDs=')) return ok({ Invoices: path.split('IDs=')[1].split(',').map((id) => ({ InvoiceID: id, InvoiceNumber: 'INV-900', Status: paid.has(id) ? 'PAID' : 'DRAFT' })) });
    return new Response('{}', { status: 404 });
  };
  const sent = (p: string, m = 'PUT') => calls.filter((c) => c.path === p && c.method === m);
  const settle = async () => {
    for (let i = 0; i < 60; i++) {
      await processXeroJobs(1000);
      const leased = await db.xeroJob.count({ where: { status: 'PENDING', lastError: null, nextAttemptAt: { gt: new Date(Date.now() + 4 * 60000) } } }); // a background run is mid-flight
      if (!leased) return;
      await new Promise((x) => setTimeout(x, 80));
    }
  };

  beforeAll(async () => {
    vi.stubGlobal('fetch', fake);
    await db.setting.upsert({ where: { key: 'xero_connection' }, create: { key: 'xero_connection', value: { tenantId: 't1', tenantName: 'Demo Company (UK)', refresh: seal('r'), access: seal('a'), expiresAt: Date.now() + 3600000, connectedAt: new Date().toISOString() } }, update: { value: { tenantId: 't1', tenantName: 'Demo Company (UK)', refresh: seal('r'), access: seal('a'), expiresAt: Date.now() + 3600000, connectedAt: new Date().toISOString() } } });
    await db.setting.upsert({ where: { key: 'xero' }, create: { key: 'xero', value: { accountCode: '200', taxType: '20% (VAT on Income)', invoicePrefix: 'ECI-', taxCode: 'OUTPUT2', stripeClearingCode: '' } }, update: { value: { accountCode: '200', taxType: '20% (VAT on Income)', invoicePrefix: 'ECI-', taxCode: 'OUTPUT2', stripeClearingCode: '' } } });
    await db.xeroJob.deleteMany({});
    await db.statement.updateMany({ where: { xeroInvoiceId: { not: null } }, data: { xeroInvoiceId: null } }); // statements left by earlier runs share the fake's invoice ids
  });
  afterAll(async () => { vi.unstubAllGlobals(); await db.setting.deleteMany({ where: { key: 'xero_connection' } }); });

  async function cardBooking() {
    const { course: c, session } = await course({ capacity: 5 });
    await db.session.update({ where: { id: session!.id }, data: { startsAt: new Date(Date.now() + 40 * 86400000), endsAt: new Date(Date.now() + 40 * 86400000 + 3 * 3600000) } });
    const b = await createPendingBooking({ courseId: c.id, sessionId: session!.id, places: 2, booker: booker(), bookerAttends: true, others: null });
    await confirmCardBooking(b.id, `pi_${b.id}`);
    return b;
  }
  const setClearing = (code: string) => db.setting.update({ where: { key: 'xero' }, data: { value: { accountCode: '200', taxType: '20% (VAT on Income)', invoicePrefix: 'ECI-', taxCode: 'OUTPUT2', stripeClearingCode: code } } });

  it('waits, without losing anything, until the Stripe clearing account is set', async () => {
    const b = await cardBooking();
    await settle();
    const job = await db.xeroJob.findUniqueOrThrow({ where: { key: `CARD_INVOICE:${b.id}` } });
    expect([job.status, job.lastError]).toEqual(['PENDING', expect.stringContaining('Stripe clearing')]);
    expect(sent('/Invoices').filter((c) => c.body.Invoices[0].Reference === b.reference)).toHaveLength(0);
  });

  it('a paid card booking becomes an authorised invoice and a payment into the Stripe clearing account, once', async () => {
    await setClearing('090');
    await db.xeroJob.updateMany({ data: { nextAttemptAt: new Date() } });
    const b = await cardBooking();
    await settle();
    const inv = sent('/Invoices').find((c) => c.body.Invoices[0].Reference === b.reference)!.body.Invoices[0];
    expect(inv).toMatchObject({ Type: 'ACCREC', Status: 'AUTHORISED', LineAmountTypes: 'Exclusive', CurrencyCode: 'GBP' });
    expect(inv.LineItems[0]).toMatchObject({ Quantity: 2, UnitAmount: 185, AccountCode: '200', TaxType: 'OUTPUT2' });
    const row = await db.booking.findUniqueOrThrow({ where: { id: b.id }, include: { payments: true } });
    expect(row.xeroInvoiceId).toMatch(/^inv-/);
    const pay = sent('/Payments').find((c) => c.body.Payments[0].Invoice.InvoiceID === row.xeroInvoiceId)!.body.Payments[0];
    expect(pay).toMatchObject({ Account: { AccountID: 'acc-090' }, Amount: b.totalPence / 100, Reference: `pi_${b.id}` });
    expect(row.payments[0].xeroPaymentId).toMatch(/^pay-/);
    const before = calls.length;
    await settle();
    expect(calls.length).toBe(before); // nothing is sent twice
  });

  it('a refund becomes a credit note, paid out from the clearing account; a full charge sends nothing', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const b = await cardBooking(); await settle();
    await cancelConfirmedBooking(b.id, b.bookerId, { refund: false, review: true });
    await decideCancellation(b.id, 'admin', { kind: 'PARTIAL', percent: 50 });
    await settle();
    const ref = (await db.booking.findUniqueOrThrow({ where: { id: b.id } })).reference;
    const cn = sent('/CreditNotes').find((c) => c.body.CreditNotes[0].Reference === `Refund ${ref}`)!.body.CreditNotes[0];
    expect(cn).toMatchObject({ Type: 'ACCRECCREDIT', Status: 'AUTHORISED', LineAmountTypes: 'Inclusive' });
    expect(cn.LineItems[0].UnitAmount).toBe((b.totalPence - Math.round(b.totalPence / 2)) / 100);
    expect(sent('/Payments').some((c) => c.body.Payments[0].CreditNote && c.body.Payments[0].Account.AccountID === 'acc-090')).toBe(true);
    const c2 = await cardBooking(); await settle();
    await cancelConfirmedBooking(c2.id, c2.bookerId, { refund: false, review: true });
    await decideCancellation(c2.id, 'admin', { kind: 'CHARGE' });
    expect(await db.xeroJob.count({ where: { kind: 'CREDIT_NOTE', recordId: c2.id } })).toBe(0);
  });

  const apply = async () => {
    const id = Math.random().toString(36).slice(2, 8);
    const acc = await submitApplication({
      company: `Severn ${id} Ltd`, companyNumber: `5${id.replace(/\D/g, '').padEnd(7, '3').slice(0, 7)}`, vatNumber: 'GB123456789', website: 'https://severn.example', industry: 'Contractor',
      registered: { line1: '12 Quay Street', town: 'Gloucester', county: 'Gloucestershire', postcode: 'GL1 2AA' }, invoice: { line1: 'PO Box 9', town: 'Bristol', postcode: 'BS1 1AA' }, accountsPhone: '01452 555123',
      main: { firstName: 'Priya', lastName: 'Shah', email: `priya.${id}@example.com`, phone: '01234 567890', jobTitle: 'Training manager' }, others: [{ name: 'Tom Brown', email: `tom.${id}@example.com` }],
      accountsName: 'Anna Accounts', accountsEmail: `accounts.${id}@example.com`, creditRequestedPence: 500000, poRule: 'PER_BOOKING',
    });
    await approveAccount(acc.id, { id: 'admin', roles: ['SUPER_ADMIN'] }, { creditLimitPence: 500000, paymentTermsDays: 30, poRule: 'PER_BOOKING' });
    return acc;
  };

  it('approving an account sends the whole company to Xero as a contact', async () => {
    const acc = await apply(); await settle();
    const full = await db.account.findUniqueOrThrow({ where: { id: acc.id } });
    const c = sent('/Contacts').map((x) => x.body.Contacts[0]).find((x) => x.Name === acc.company)!;
    expect(c).toMatchObject({ AccountNumber: `ECI-${acc.companyNumber}`, TaxNumber: 'GB123456789', CompanyNumber: acc.companyNumber, Website: 'https://severn.example', FirstName: 'Anna', LastName: 'Accounts', IsCustomer: true, DefaultCurrency: 'GBP' });
    expect(c.Addresses).toEqual([expect.objectContaining({ AddressType: 'STREET', AddressLine1: '12 Quay Street', City: 'Gloucester', PostalCode: 'GL1 2AA' }), expect.objectContaining({ AddressType: 'POBOX', AddressLine1: 'PO Box 9', City: 'Bristol' })]);
    expect(c.Phones).toEqual([{ PhoneType: 'DEFAULT', PhoneNumber: '01452 555123' }]);
    expect(c.PaymentTerms).toEqual({ Sales: { Day: 30, Type: 'DAYSAFTERBILLDATE' } });
    expect(c.ContactPersons[0]).toMatchObject({ EmailAddress: expect.stringContaining('accounts.'), IncludeInEmails: true });
    expect(c.ContactPersons.length).toBe(3); // accounts contact, main booker, other booker
    expect(full.xeroContactId).toMatch(/^c-/);
  });

  it('a company whose name Xero already has is created with its company number added, not failed', async () => {
    const acc = await apply();
    await settle(); // let approval's own contact job finish first, so it cannot race this one
    await db.account.update({ where: { id: acc.id }, data: { company: 'Twin Co', xeroContactId: null } });
    await db.xeroJob.deleteMany({ where: { recordId: acc.id } });
    await db.xeroJob.create({ data: { key: `CONTACT:${acc.id}:twin`, kind: 'CONTACT', recordType: 'Account', recordId: acc.id, payload: {}, nextAttemptAt: new Date() } });
    await settle();
    const names = sent('/Contacts').map((c) => c.body.Contacts[0].Name).filter((x: string) => x.startsWith('Twin Co'));
    expect(names).toEqual(['Twin Co', `Twin Co (${acc.companyNumber})`]);
    expect((await db.xeroJob.findFirstOrThrow({ where: { key: `CONTACT:${acc.id}:twin` } })).status).toBe('DONE');
  });

  it('month end sends one DRAFT invoice per account with a line per booking, and a payment in Xero restores the credit', async () => {
    const acc = await apply(); await settle();
    const member = await db.accountMember.findFirstOrThrow({ where: { accountId: acc.id, role: 'MAIN_BOOKER' } });
    const mk = async (po: string) => { const { course: c, session } = await course({ capacity: 5 }); return createAccountBooking({ personId: member.personId, courseId: c.id, sessionId: session!.id, places: 1, bookerAttends: true, others: null, poNumber: po }); };
    const b1 = await mk('PO-1'); const b2 = await mk('PO-2');
    const { attachPoFiles } = await import('@/lib/purchase-orders');
    const pdf = (name: string) => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x0a])], name, { type: 'application/pdf' });
    await attachPoFiles(acc.id, 'PO-1', [pdf('quote.pdf'), pdf('quote.pdf')], member.personId); // same name twice
    await attachPoFiles(acc.id, 'PO-2', [pdf('po-2.pdf')], member.personId);
    await db.statement.updateMany({ where: { accountId: acc.id }, data: { month: '1999-03' } }); // as if March had ended
    await closeStatements(); await settle();
    const inv = sent('/Invoices').map((x) => x.body.Invoices[0]).find((x) => x.Reference === 'Training March 1999')!;
    expect(inv).toMatchObject({ Type: 'ACCREC', Status: 'DRAFT', Date: '1999-03-31', DueDate: '1999-04-30' });
    expect(inv.LineItems).toHaveLength(2);
    expect(inv.LineItems.map((l: any) => l.Description).join(' ')).toContain('PO-1');
    const st = await db.statement.findFirstOrThrow({ where: { accountId: acc.id } });
    expect(st.xeroInvoiceId).toMatch(/^inv-/);
    const live = () => db.account.findUniqueOrThrow({ where: { id: acc.id } });
    const attached = sent(`/Invoices/${st.xeroInvoiceId}/Attachments/`, 'POST');
    void attached;
    const posts = calls.filter((c) => c.method === 'POST' && c.path.startsWith(`/Invoices/${st.xeroInvoiceId}/Attachments/`));
    expect(posts.map((c) => decodeURIComponent(c.path.split('/Attachments/')[1])).sort()).toEqual(['2-quote.pdf', 'po-2.pdf', 'quote.pdf']);
    expect(posts.every((c) => c.contentType === 'application/pdf' && (c.raw ?? 0) > 0)).toBe(true);
    const fileRows = await db.poFile.findMany({ where: { purchaseOrder: { accountId: acc.id } } });
    expect(fileRows.every((f) => f.xeroAttachedTo.includes(st.xeroInvoiceId!))).toBe(true);
    const sentBefore = calls.length;
    await db.xeroJob.updateMany({ where: { kind: 'ACCOUNT_DRAFT', recordId: st.id }, data: { status: 'PENDING', nextAttemptAt: new Date() } });
    await settle();
    expect(calls.slice(sentBefore).filter((c) => c.method === 'POST' && c.path.includes('/Attachments/'))).toHaveLength(0); // nothing is attached twice
    // a PO file added after the invoice reached Xero is picked up on the next run
    const { attachLatePoFiles } = await import('@/lib/xero-sync');
    await attachPoFiles(acc.id, 'PO-2', [pdf('late-addition.pdf')], member.personId);
    expect(await attachLatePoFiles()).toBe(1);
    expect(calls.filter((c) => c.method === 'POST' && c.path.includes('/Attachments/late-addition.pdf'))).toHaveLength(1);
    expect(await attachLatePoFiles()).toBe(0);
    expect(await availableCredit(db, await live())).toBe(500000 - b1.totalPence - b2.totalPence);
    paid.add(st.xeroInvoiceId!);
    expect((await syncXeroStatements()).paid).toBeGreaterThanOrEqual(1);
    const done = await db.statement.findUniqueOrThrow({ where: { id: st.id } });
    expect([done.status, done.xeroInvoiceNo]).toEqual(['PAID', 'INV-900']);
    expect(await availableCredit(db, await live())).toBe(500000);
    void statementMonth;
  });

  it('checks the codes in Settings against Xero, and says what is wrong', async () => {
    const { xeroSetupCheck } = await import('@/lib/xero-sync');
    await setClearing('090');
    expect((await xeroSetupCheck()).every((c) => c.ok)).toBe(true);
    await setClearing('999');
    expect((await xeroSetupCheck()).find((c) => !c.ok)!.text).toMatch(/999 was not found/);
    await setClearing('091');
    expect((await xeroSetupCheck()).find((c) => !c.ok)!.text).toMatch(/Enable payments to this account/);
    await setClearing('090');
  });

  it('a clearing account Xero cannot pay into fails with a message that says what to check', async () => {
    await setClearing('999');
    const b = await cardBooking();
    await settle();
    const job = await db.xeroJob.findUniqueOrThrow({ where: { key: `CARD_INVOICE:${b.id}` } });
    expect([job.status, job.lastError]).toEqual(['FAILED', expect.stringContaining('no account with code 999')]);
    await setClearing('090');
    await retryFailedXeroJobs();
    await settle();
    expect((await db.xeroJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('DONE'); // the invoice already in Xero is reused, only the payment is sent
  });

  it('a refused document is marked failed with a task, and Retry puts it back on the queue', async () => {
    const b = await cardBooking();
    failWith = { status: 400, message: 'Account code 090 is not a valid code' };
    await settle();
    failWith = null;
    const job = await db.xeroJob.findUniqueOrThrow({ where: { key: `CARD_INVOICE:${b.id}` } });
    expect([job.status, job.lastError]).toEqual(['FAILED', expect.anything()]);
    expect(await db.task.count({ where: { type: 'INTEGRATION_FAILURE', recordId: job.id } })).toBe(1);
    expect(await retryFailedXeroJobs()).toBeGreaterThanOrEqual(1);
    await settle();
    expect((await db.xeroJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('DONE');
    expect((await db.task.findFirstOrThrow({ where: { type: 'INTEGRATION_FAILURE', recordId: job.id } })).status).toBe('DONE'); // the retry that worked closed its task
  });

  it('does nothing, and loses nothing, while Xero is not connected', async () => {
    const saved = await db.setting.findUniqueOrThrow({ where: { key: 'xero_connection' } });
    await db.setting.delete({ where: { key: 'xero_connection' } });
    const b = await cardBooking();
    expect(await processXeroJobs()).toMatchObject({ skipped: 1 });
    await new Promise((x) => setTimeout(x, 300));
    expect((await db.xeroJob.findUniqueOrThrow({ where: { key: `CARD_INVOICE:${b.id}` } })).status).toBe('PENDING');
    await db.setting.create({ data: { key: 'xero_connection', value: saved.value as never } });
  });
});
