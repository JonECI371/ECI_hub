import { describe, expect, it } from 'vitest';

describe('cancelling a booking', async () => {
  const { db } = await import('@/lib/db');
  const { createPendingBooking, confirmCardBooking } = await import('@/lib/booking');
  const { cancelConfirmedBooking } = await import('@/lib/booking-cancel');
  const { joinWaitlist } = await import('@/lib/waitlist');
  const { course, booker } = await import('./fixtures');

  it('frees the places, records the refund, offers them to the waitlist and is safe to repeat', async () => {
    delete process.env.STRIPE_SECRET_KEY; // test mode: refund recorded only
    const { course: c, session } = await course({ capacity: 2 });
    const b = await createPendingBooking({ courseId: c.id, sessionId: session!.id, places: 2, booker: booker(), bookerAttends: true, others: null });
    await confirmCardBooking(b.id, `pi_${b.id}`);
    const waiter = await db.person.create({ data: { email: `w${b.id}@example.com`, firstName: 'Wait', lastName: 'Er' } });
    await joinWaitlist(session!.id, waiter.id, 1);

    expect(await cancelConfirmedBooking(b.id, waiter.id, { reason: 'Trainer ill', refund: true, byAdmin: true })).toBe(true);
    expect(await cancelConfirmedBooking(b.id, waiter.id, { reason: 'again', refund: true, byAdmin: true })).toBe(false);

    const after = await db.booking.findUniqueOrThrow({ where: { id: b.id }, include: { attendees: true, payments: true } });
    expect(after.status).toBe('CANCELLED');
    expect(after.attendees.every((a) => a.status === 'CANCELLED')).toBe(true);
    expect(after.payments[0].refundedPence).toBe(b.totalPence);
    expect((await db.waitlistEntry.findFirstOrThrow({ where: { sessionId: session!.id } })).offerToken).not.toBeNull();
    expect(await db.auditLog.count({ where: { recordId: b.id, action: 'BOOKING_CANCELLED' } })).toBe(1);
  });

  it('can cancel without a refund', async () => {
    const { course: c, session } = await course();
    const b = await createPendingBooking({ courseId: c.id, sessionId: session!.id, places: 1, booker: booker(), bookerAttends: true, others: null });
    await confirmCardBooking(b.id, `pi_${b.id}`);
    await cancelConfirmedBooking(b.id, b.bookerId, { reason: 'No refund', refund: false, byAdmin: true });
    expect((await db.payment.findFirstOrThrow({ where: { bookingId: b.id } })).refundedPence).toBe(0);
  });
});
