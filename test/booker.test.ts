import { describe, expect, it } from 'vitest';

describe('booker portal', async () => {
  const { db } = await import('@/lib/db');
  const { inviteBooker, removeBooker, decideBooker, AccountRuleError } = await import('@/lib/accounts');
  const { managesBooking, accountSummary } = await import('@/lib/booker');
  const { createAccountBooking } = await import('@/lib/credit');
  const { course } = await import('./fixtures');

  async function account() {
    const id = Math.random().toString(36).slice(2, 10);
    const main = await db.person.create({ data: { email: `main.${id}@acme.example`, firstName: 'Priya', lastName: 'Shah', roles: ['BOOKER'] } });
    const other = await db.person.create({ data: { email: `marcus.${id}@acme.example`, firstName: 'Marcus', lastName: 'Hill', roles: ['BOOKER'] } });
    const acc = await db.account.create({ data: { company: `Acme ${id}`, companyNumber: `Y${id}`, registeredAddress: 'x', accountsName: 'x', accountsEmail: 'x@example.com', creditLimitPence: 500000, status: 'ACTIVE',
      members: { create: [{ personId: main.id, role: 'MAIN_BOOKER', status: 'ACTIVE' }, { personId: other.id, role: 'BOOKER', status: 'ACTIVE' }] } } });
    return { id, main, other, acc };
  }

  it('only the main booker invites; a new booker waits for ECI approval, then can book', async () => {
    const { id, main, other, acc } = await account();
    await expect(inviteBooker(acc.id, other.id, { name: 'Ella Grant', email: `ella.${id}@acme.example` })).rejects.toBeInstanceOf(AccountRuleError);
    const m = await inviteBooker(acc.id, main.id, { name: 'Ella Grant', email: `ella.${id}@acme.example` });
    expect(m.status).toBe('PENDING_APPROVAL');
    expect(await db.task.count({ where: { type: 'BOOKER_APPROVAL', recordId: m.id, status: 'OPEN' } })).toBe(1);
    await expect(inviteBooker(acc.id, main.id, { name: 'Ella Grant', email: `ella.${id}@acme.example` })).rejects.toThrow(/waiting for approval/);
    const { course: c, session } = await course();
    await expect(createAccountBooking({ personId: m.personId, courseId: c.id, sessionId: session!.id, places: 1, bookerAttends: true, others: null })).rejects.toThrow(/not a booker/);
    await decideBooker(m.id, 'admin', true);
    const b = await createAccountBooking({ personId: m.personId, courseId: c.id, sessionId: session!.id, places: 1, bookerAttends: true, others: null });
    expect(b.accountId).toBe(acc.id);
    // Everyone booking on the account can see and manage it; an outsider cannot.
    expect(await managesBooking(main.id, b)).toBe(true);
    const outsider = await db.person.create({ data: { email: `out.${id}@example.com`, firstName: 'O', lastName: 'Ut' } });
    expect(await managesBooking(outsider.id, b)).toBe(false);
    const s = await accountSummary(acc);
    expect(s.available).toBe(500000 - b.totalPence);
    expect(s.upcomingPlaces).toBe(1);
  });

  it('the main booker can remove a booker but not themselves', async () => {
    const { main, other, acc } = await account();
    const mainMember = await db.accountMember.findFirstOrThrow({ where: { accountId: acc.id, personId: main.id } });
    await expect(removeBooker(acc.id, main.id, mainMember.id)).rejects.toBeInstanceOf(AccountRuleError);
    const otherMember = await db.accountMember.findFirstOrThrow({ where: { accountId: acc.id, personId: other.id } });
    await removeBooker(acc.id, main.id, otherMember.id);
    expect((await db.accountMember.findUniqueOrThrow({ where: { id: otherMember.id } })).status).toBe('REMOVED');
  });
});
