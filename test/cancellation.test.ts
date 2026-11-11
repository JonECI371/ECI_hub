import { describe, expect, it } from 'vitest';

describe('cancellation policy and review', async () => {
  const { db } = await import('@/lib/db');
  const { DEFAULT_POLICY, steer, policyLines, policyProblem, policyShort } = await import('@/lib/cancellation-policy');
  const { cancelConfirmedBooking, decideCancellation, moveCancelledBooking, CancellationError } = await import('@/lib/booking-cancel');
  const { createPendingBooking, confirmCardBooking, addToBookingId } = await import('@/lib/booking');
  const { createAccountBooking, availableCredit } = await import('@/lib/credit');
  const { course, booker } = await import('./fixtures');
  const day = 86400000;
  const inDays = (n: number) => new Date(Date.now() + n * day);

  it('the steer follows the policy: free, part charge, full charge, and late cancellation', () => {
    expect(steer(DEFAULT_POLICY, inDays(40), 22200).suggested).toBe('REFUND');
    const part = steer(DEFAULT_POLICY, inDays(10), 22200);
    expect([part.suggested, part.chargePercent, part.chargePence]).toEqual(['PART_CHARGED', 50, 11100]);
    expect(steer(DEFAULT_POLICY, inDays(3), 22200).suggested).toBe('CHARGED');
    const late = steer(DEFAULT_POLICY, new Date(Date.now() + 5 * 3600000), 22200);
    expect([late.late, late.suggested, late.text]).toEqual([true, 'CHARGED', expect.stringContaining('Late cancellation')]);
    expect(policyLines(DEFAULT_POLICY)[0]).toBe('28 or more days before the start: full refund.');
    expect(policyShort(DEFAULT_POLICY)).toContain('up to 28 days');
    expect(policyProblem({ ...DEFAULT_POLICY, tiers: [{ daysBefore: 7, chargePercent: 0 }] })).toMatch(/0 days/);
  });

  async function cardBooking(daysAway = 40) {
    const { course: c, session } = await course({ capacity: 5 });
    await db.session.update({ where: { id: session!.id }, data: { startsAt: inDays(daysAway), endsAt: new Date(inDays(daysAway).getTime() + 3 * 3600000) } });
    const b = await createPendingBooking({ courseId: c.id, sessionId: session!.id, places: 2, booker: booker(), bookerAttends: true, others: null });
    await confirmCardBooking(b.id, `pi_${b.id}`);
    return { b, c, session: session! };
  }

  it('a customer cancellation frees the places at once and waits for an Admin, who then refunds, part charges or charges', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { b, session } = await cardBooking(10);
    expect(await cancelConfirmedBooking(b.id, b.bookerId, { reason: 'Date no longer suits', refund: false, review: true })).toBe(true);
    const after = await db.booking.findUniqueOrThrow({ where: { id: b.id }, include: { payments: true } });
    expect([after.status, after.cancellationDecision, after.payments[0].refundedPence]).toEqual(['CANCELLED', 'PENDING', 0]);
    const task = await db.task.findFirstOrThrow({ where: { type: 'CANCELLATION_REVIEW', recordId: b.id } });
    expect(task.detail).toContain('50%');
    await expect(decideCancellation(b.id, 'admin', { kind: 'PARTIAL', percent: 0 })).rejects.toBeInstanceOf(CancellationError);
    const r = await decideCancellation(b.id, 'admin', { kind: 'PARTIAL', percent: 50 });
    expect(r).toMatchObject({ decision: 'PART_CHARGED', chargePence: Math.round(b.totalPence / 2) });
    const paid = await db.payment.findFirstOrThrow({ where: { bookingId: b.id } });
    expect(paid.refundedPence).toBe(b.totalPence - Math.round(b.totalPence / 2));
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('DONE');
    await expect(decideCancellation(b.id, 'admin', { kind: 'REFUND' })).rejects.toThrow(/already been dealt/);
    expect(await db.booking.count({ where: { sessionId: session.id, status: 'CONFIRMED' } })).toBe(0); // places are free
  });

  it('waiving needs a reason; a full charge keeps the money', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const w = await cardBooking(2);
    await cancelConfirmedBooking(w.b.id, w.b.bookerId, { refund: false, review: true });
    await expect(decideCancellation(w.b.id, 'admin', { kind: 'WAIVE' })).rejects.toThrow(/extenuating/);
    await decideCancellation(w.b.id, 'admin', { kind: 'WAIVE', note: 'Family bereavement' });
    expect((await db.payment.findFirstOrThrow({ where: { bookingId: w.b.id } })).refundedPence).toBe(w.b.totalPence);
    const c = await cardBooking(2);
    await cancelConfirmedBooking(c.b.id, c.b.bookerId, { refund: false, review: true });
    await decideCancellation(c.b.id, 'admin', { kind: 'CHARGE' });
    expect((await db.payment.findFirstOrThrow({ where: { bookingId: c.b.id } })).refundedPence).toBe(0);
  });

  it('an on-account cancellation keeps its statement line until decided, then removes or reduces it', async () => {
    const id = Math.random().toString(36).slice(2, 10);
    const person = await db.person.create({ data: { email: `bk.${id}@example.com`, firstName: 'Priya', lastName: 'Shah', roles: ['BOOKER'] } });
    const acc = await db.account.create({ data: { company: `Acme ${id}`, companyNumber: `C${id}`, registeredAddress: 'x', accountsName: 'x', accountsEmail: 'x@example.com', creditLimitPence: 100000, status: 'ACTIVE', members: { create: { personId: person.id, role: 'MAIN_BOOKER', status: 'ACTIVE' } } } });
    const mk = async () => { const { course: c, session } = await course({ capacity: 5 }); return createAccountBooking({ personId: person.id, courseId: c.id, sessionId: session!.id, places: 1, bookerAttends: true, others: null }); };
    const a = await mk();
    await cancelConfirmedBooking(a.id, person.id, { refund: false, review: true });
    expect(await availableCredit(db, acc)).toBe(100000 - a.totalPence); // still reserved
    await decideCancellation(a.id, 'admin', { kind: 'REFUND' });
    expect(await availableCredit(db, acc)).toBe(100000);
    const c = await mk();
    await cancelConfirmedBooking(c.id, person.id, { refund: false, review: true });
    await decideCancellation(c.id, 'admin', { kind: 'PARTIAL', percent: 50 });
    expect(await availableCredit(db, acc)).toBe(100000 - Math.round(c.totalPence / 2));
  });

  it('a cancelled booking can be moved to another date with room, and cannot be moved to a full one', async () => {
    const { b, c } = await cardBooking(30);
    await cancelConfirmedBooking(b.id, b.bookerId, { refund: false, review: true });
    const other = await db.session.create({ data: { courseId: c.id, startsAt: inDays(60), endsAt: new Date(inDays(60).getTime() + 3 * 3600000), capacity: 1, status: 'PUBLISHED' } });
    await expect(moveCancelledBooking(b.id, 'admin', other.id)).rejects.toThrow(/places left/); // 2 places, 1 free
    await db.session.update({ where: { id: other.id }, data: { capacity: 4 } });
    await moveCancelledBooking(b.id, 'admin', other.id, 'Customer asked for a later date');
    const moved = await db.booking.findUniqueOrThrow({ where: { id: b.id }, include: { attendees: true } });
    expect([moved.status, moved.sessionId, moved.cancellationDecision]).toEqual(['CONFIRMED', other.id, 'MOVED']);
    expect(moved.attendees.every((a) => a.status !== 'CANCELLED')).toBe(true);
  });

  it('extra places are a linked booking, only for someone who manages the original', async () => {
    const { b, session } = await cardBooking(20);
    const ref = (await db.booking.findUniqueOrThrow({ where: { id: b.id } })).reference;
    expect(await addToBookingId(b.bookerId, ref, session.id)).toBe(b.id);
    const stranger = await db.person.create({ data: { email: `s.${Date.now()}@example.com`, firstName: 'S', lastName: 'T' } });
    expect(await addToBookingId(stranger.id, ref, session.id)).toBeNull();
    expect(await addToBookingId(b.bookerId, ref, 'some-other-session')).toBeNull();
    const extra = await createPendingBooking({ courseId: b.courseId, sessionId: session.id, places: 1, booker: { firstName: 'T', lastName: 'B', email: (await db.person.findUniqueOrThrow({ where: { id: b.bookerId } })).email, marketingOptIn: false }, bookerAttends: false, others: null, addedToId: b.id });
    expect(extra.addedToId).toBe(b.id);
  });
});
