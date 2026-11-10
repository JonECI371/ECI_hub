import 'server-only';
import { db } from '@/lib/db';
import { statementMonth, applyOverdueHolds } from '@/lib/credit';

export type XeroSettings = { accountCode: string; taxType: string; invoicePrefix: string };
const XERO_DEFAULTS: XeroSettings = { accountCode: '200', taxType: '20% (VAT on Income)', invoicePrefix: 'ECI-' };

/** Xero import settings from Settings (key "xero"). Defaults are Xero's standard Sales account and UK VAT rate. */
export async function xeroSettings(): Promise<XeroSettings> {
  const s = await db.setting.findUnique({ where: { key: 'xero' } });
  return { ...XERO_DEFAULTS, ...((s?.value ?? {}) as Partial<XeroSettings>) };
}

export const monthLabel = (ym: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-15T12:00:00Z`));

/**
 * Month end: every open statement for a month before this one is issued (due after the account's
 * payment terms), and one Month-end billing task is raised per month. Safe to run repeatedly.
 * A statement with nothing on it is closed as paid, since nothing is owed.
 */
export async function closeStatements(now = new Date()) {
  const current = statementMonth(now);
  const open = await db.statement.findMany({ where: { status: 'OPEN', month: { lt: current } }, include: { account: true, lines: true } });
  const months = new Set<string>();
  for (const st of open) {
    const total = st.lines.reduce((n, l) => n + l.netPence + l.vatPence, 0);
    if (!st.lines.length || total === 0) {
      await db.statement.update({ where: { id: st.id }, data: { status: 'PAID', issuedAt: now, paidAt: now } });
      continue;
    }
    await db.statement.update({ where: { id: st.id }, data: { status: 'ISSUED', issuedAt: now, dueAt: new Date(now.getTime() + st.account.paymentTermsDays * 86400000) } });
    await db.auditLog.create({ data: { action: 'STATEMENT_ISSUED', recordType: 'Statement', recordId: st.id, after: { month: st.month, accountId: st.accountId, totalPence: total } } });
    months.add(st.month);
  }
  for (const month of months) {
    const exists = await db.task.findFirst({ where: { type: 'MONTH_END_BILLING', recordType: 'Month', recordId: month } });
    if (!exists) await db.task.create({ data: { type: 'MONTH_END_BILLING', title: `Month-end billing: ${monthLabel(month)}`, detail: 'Download the Xero import file, import it into Xero, then mark this done.', recordType: 'Month', recordId: month } });
  }
  return months.size;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  // Quote everything with commas, quotes or newlines; neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const dmy = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/London' });

/** Xero sales invoice import columns (Business, Invoices, Import). Starred columns are required by Xero. */
export const XERO_COLUMNS = ['*ContactName', 'EmailAddress', 'POAddressLine1', 'POAddressLine2', 'POAddressLine3', 'POAddressLine4', 'POCity', 'PORegion', 'POPostalCode', 'POCountry', '*InvoiceNumber', 'Reference', '*InvoiceDate', '*DueDate', 'InventoryItemCode', '*Description', '*Quantity', '*UnitAmount', 'Discount', '*AccountCode', '*TaxType', 'TrackingName1', 'TrackingOption1', 'TrackingName2', 'TrackingOption2', 'Currency', 'BrandingTheme'];

/** One Xero invoice per account statement for the month, one invoice line per statement line. Amounts exclude VAT. */
export async function xeroCsv(month: string): Promise<{ csv: string; invoices: number; lines: number }> {
  const x = await xeroSettings();
  const statements = await db.statement.findMany({ where: { month, status: { in: ['ISSUED', 'OVERDUE', 'PAID'] }, lines: { some: {} } }, include: { account: true, lines: { include: { booking: true }, orderBy: { id: 'asc' } } }, orderBy: { account: { company: 'asc' } } });
  const rows: (string | number)[][] = [XERO_COLUMNS];
  let lines = 0;
  for (const st of statements) {
    const a = st.account;
    const addr = (a.invoiceAddress || a.registeredAddress).split(/\n|,\s*/).map((s) => s.trim()).filter(Boolean);
    // UK postcode at the end of the last line ("Gloucester GL1 2AA" or a line of its own) goes in its own column.
    const pc = addr.length ? /^(.*?)[\s,]*([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})$/i.exec(addr[addr.length - 1]) : null;
    const postcode = pc ? pc[2].toUpperCase() : '';
    if (pc) { if (pc[1]) addr[addr.length - 1] = pc[1]; else addr.pop(); }
    const number = st.xeroInvoiceNo ?? `${x.invoicePrefix}${month.replace('-', '')}-${a.companyNumber}`;
    const pos = [...new Set(st.lines.map((l) => l.booking.poNumber).filter(Boolean))];
    const reference = `Training ${monthLabel(month)}${a.poRule === 'PER_ACCOUNT' && pos.length === 1 ? `, ${pos[0]}` : ''}`;
    for (const l of st.lines) {
      rows.push([a.company, a.accountsEmail, addr[0] ?? '', addr[1] ?? '', addr[2] ?? '', addr.slice(3).join(', '), '', '', postcode, 'United Kingdom', number, reference, dmy(st.issuedAt ?? new Date()), dmy(st.dueAt ?? new Date()), '', l.description, 1, (l.netPence / 100).toFixed(2), '', x.accountCode, x.taxType, '', '', '', '', 'GBP', '']);
      lines++;
    }
  }
  return { csv: rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n', invoices: statements.length, lines };
}

/** Record a statement as paid (from Xero): restores credit, and lifts a hold once nothing is overdue. */
export async function markStatementPaid(statementId: string, actorId: string, invoiceNo?: string) {
  const st = await db.statement.findUniqueOrThrow({ where: { id: statementId } });
  if (st.status === 'PAID') return st;
  const updated = await db.statement.update({ where: { id: st.id }, data: { status: 'PAID', paidAt: new Date(), xeroInvoiceNo: invoiceNo || st.xeroInvoiceNo } });
  await db.auditLog.create({ data: { actorId, action: 'STATEMENT_PAID', recordType: 'Statement', recordId: st.id, before: { status: st.status }, after: { status: 'PAID', invoiceNo: invoiceNo || st.xeroInvoiceNo } } });
  await applyOverdueHolds();
  return updated;
}
