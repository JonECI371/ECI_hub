import { describe, expect, it } from 'vitest';

describe('booking on account', async () => {
  const { db } = await import('@/lib/db');
  const { createAccountBooking, availableCredit, applyOverdueHolds, statementMonth } = await import('@/lib/credit');
  const { cancelConfirmedBooking } = await import('@/lib/booking-cancel');
  const { CheckoutError } = await import('@/lib/booking');
  const { course } = await import('./fixtures');

  /** An active account with one booker. Course price £185 + 20% VAT = £222 a place. */
  async function setup(opts: { limit?: number; poRule?: string; status?: 'ACTIVE' | 'ON_HOLD' } = {}) {
    const id = Math.random().toString(36).slice(2, 10);
    const person = await db.person.create({ data: { email: `booker.${id}@example.com`, firstName: 'Priya', lastName: 'Shah', roles: ['DELEGATE', 'BOOKER'] } });
    const account = await db.account.create({
      data: { company: `Acme ${id}`, companyNumber: `X${id}`, registeredAddress: 'x', accountsName: 'x', accountsEmail: 'x@example.com', creditLimitPence: opts.limit ?? 100000, poRule: opts.poRule ?? 'NONE', status: opts.status ?? 'ACTIVE',
        members: { create: { personId: person.id, role: 'MAIN_BOOKER', status: 'ACTIVE' } } },
    });
    const { course: c, session } = await course({ capacity: 10 });
    return { person, account, c, session: session! };
  }
  const book = (s: Awaited<ReturnType<typeof setup>>, places = 1, poNumber?: string) =>
    createAccountBooking({ personId: s.person.id, courseId: s.c.id, sessionId: s.session.id, places, bookerAttends: true, others: null, poNumber });

  it('confirms at once, adds a statement line and reduces available credit', async () => {
    const s = await setup({ limit: 100000 });
    const b = await book(s, 2, 'PO-1');
    expect(b.status).toBe('CONFIRMED');
    expect(b.method).toBe('ACCOUNT');
    const st = await db.statement.findUniqueOrThrow({ where: { accountId_month: { accountId: s.account.id, month: statementMonth() } }, include: { lines: true } });
    expect(st.lines).toHaveLength(1);
    expect(st.lines[0].netPence + st.lines[0].vatPence).toBe(b.totalPence);
    expect(await availableCredit(db, s.account)).toBe(100000 - b.totalPence);
  });

  it('refuses a booking over the available credit', async () => {
    const s = await setup({ limit: 30000 }); // £300: one place (£222) fits, two do not
    await expect(book(s, 2)).rejects.toThrow(/available credit is £300/);
    await book(s, 1);
    await expect(book(s, 1)).rejects.toBeInstanceOf(CheckoutError);
  });

  it('two bookers at once cannot overspend', async () => {
    const s = await setup({ limit: 50000 }); // room for two £222 bookings, not three
    const results = await Promise.allSettled([book(s), book(s), book(s)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(await availableCredit(db, s.account)).toBeGreaterThanOrEqual(0);
  });

  it('needs a PO number when the account says so', async () => {
    const s = await setup({ poRule: 'PER_BOOKING' });
    await expect(book(s, 1)).rejects.toThrow(/PO number/);
    expect((await book(s, 1, 'PO 4500-221')).poNumber).toBe('PO 4500-221');
  });

  it('an account on hold cannot book on account', async () => {
    const s = await setup({ status: 'ON_HOLD' });
    await expect(book(s)).rejects.toThrow(/on hold/);
  });

  it('cancelling removes the open line; once issued, it adds a credit line instead', async () => {
    const s = await setup({ limit: 100000 });
    const a = await book(s);
    await cancelConfirmedBooking(a.id, s.person.id, { refund: true });
    expect(await db.statementLine.count({ where: { bookingId: a.id } })).toBe(0);
    expect(await availableCredit(db, s.account)).toBe(100000);

    const b = await book(s);
    await db.statement.updateMany({ where: { accountId: s.account.id }, data: { status: 'ISSUED', issuedAt: new Date() } });
    // A new month's open statement takes the credit; simulate by moving the issued one to last month.
    await db.statement.updateMany({ where: { accountId: s.account.id }, data: { month: '2000-01' } });
    await cancelConfirmedBooking(b.id, s.person.id, { refund: true });
    const lines = await db.statementLine.findMany({ where: { bookingId: b.id } });
    expect(lines.map((l) => l.netPence + l.vatPence).sort((x, y) => x - y)).toEqual([-b.totalPence, b.totalPence]);
    expect(await availableCredit(db, s.account)).toBe(100000);
  });

  it('an invoice 14 days overdue puts the account on hold; paying it lifts the hold', async () => {
    const s = await setup();
    const st = await db.statement.create({ data: { accountId: s.account.id, month: '2000-02', status: 'ISSUED', issuedAt: new Date(Date.now() - 60 * 86400000), dueAt: new Date(Date.now() - 15 * 86400000) } });
    await applyOverdueHolds();
    expect((await db.account.findUniqueOrThrow({ where: { id: s.account.id } })).status).toBe('ON_HOLD');
    await db.statement.update({ where: { id: st.id }, data: { status: 'PAID', paidAt: new Date() } });
    await applyOverdueHolds();
    expect((await db.account.findUniqueOrThrow({ where: { id: s.account.id } })).status).toBe('ACTIVE');
  });
});
