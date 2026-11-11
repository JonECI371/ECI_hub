import { describe, expect, it } from 'vitest';

describe('month-end statements and Xero', async () => {
  const { db } = await import('@/lib/db');
  const { closeStatements, monthEnd, xeroCsv, markStatementPaid, XERO_COLUMNS } = await import('@/lib/billing');
  const { availableCredit, createAccountBooking } = await import('@/lib/credit');
  const { course } = await import('./fixtures');

  // Each run uses its own past month so earlier runs do not interfere.
  const month = `19${String(10 + Math.floor(Math.random() * 89)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}`;

  async function accountWithBooking(company: string) {
    const id = Math.random().toString(36).slice(2, 10);
    const person = await db.person.create({ data: { email: `b.${id}@example.com`, firstName: 'Priya', lastName: 'Shah', roles: ['BOOKER'] } });
    const account = await db.account.create({
      data: { company: `${company} ${id}`, companyNumber: `Z${id}`, registeredAddress: '12 Quay Street, Gloucester, GL1 2AA', accountsName: 'Accounts', accountsEmail: `accounts.${id}@example.com`, creditLimitPence: 100000, paymentTermsDays: 30, poRule: 'PER_BOOKING', status: 'ACTIVE',
        members: { create: { personId: person.id, role: 'MAIN_BOOKER', status: 'ACTIVE' } } },
    });
    const { course: c, session } = await course();
    const b = await createAccountBooking({ personId: person.id, courseId: c.id, sessionId: session!.id, places: 1, bookerAttends: true, others: null, poNumber: '4500-221' });
    // Move this month's statement into the test's past month, as if the month had ended.
    await db.statement.updateMany({ where: { accountId: account.id }, data: { month } });
    return { account, b };
  }

  it('closes last month, raises one billing task, exports a Xero file and restores credit when paid', async () => {
    const one = await accountWithBooking('Acme, "Pipes" Ltd');
    const two = await accountWithBooking('Severn');
    await closeStatements();
    await closeStatements(); // safe to run again
    const sts = await db.statement.findMany({ where: { accountId: { in: [one.account.id, two.account.id] } } });
    expect(sts.every((s) => s.status === 'ISSUED' && s.dueAt && s.dueAt.getTime() === monthEnd(s.month).getTime() + 30 * 86400000)).toBe(true);
    expect(await db.task.count({ where: { type: 'MONTH_END_BILLING', recordId: month } })).toBe(1);
    expect(await availableCredit(db, one.account)).toBe(100000 - one.b.totalPence); // still owed until paid

    const { csv, invoices, lines } = await xeroCsv(month);
    expect(invoices).toBeGreaterThanOrEqual(2);
    const rows = csv.trim().split('\r\n');
    expect(rows[0]).toBe(XERO_COLUMNS.join(','));
    const row = rows.find((r) => r.includes(one.account.companyNumber))!;
    expect(row).toContain('"Acme, ""Pipes"" Ltd'); // quoted safely
    expect(row).toContain(',1,185.00,,200,20% (VAT on Income),'); // quantity, net amount, no discount, account code, tax rate
    expect(row).toContain('PO 4500-221');
    expect(row).toContain(',Gloucester,,,,,GL1 2AA,United Kingdom,');
    expect(lines).toBe(rows.length - 1);

    const st = sts.find((s) => s.accountId === one.account.id)!;
    await markStatementPaid(st.id, 'admin', 'INV-0042');
    expect(await availableCredit(db, one.account)).toBe(100000);
    expect((await db.statement.findUniqueOrThrow({ where: { id: st.id } })).xeroInvoiceNo).toBe('INV-0042');
  });
});
