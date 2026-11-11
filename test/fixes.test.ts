import { describe, expect, it } from 'vitest';

describe('round 1 fixes', async () => {
  const { db } = await import('@/lib/db');
  const { composeDuration, parseDuration, durationDays } = await import('@/lib/duration');
  const { createPendingBooking, CheckoutError } = await import('@/lib/booking');
  const { bookingWhere } = await import('@/lib/admin-bookings');
  const { course, booker } = await import('./fixtures');

  it('duration is a number and a unit, and a new date fills in its last day from it', () => {
    expect(composeDuration('1', 'days')).toBe('1 day');
    expect(composeDuration('2', 'days')).toBe('2 days');
    expect(composeDuration('3', 'hours')).toBe('3 hours');
    expect(composeDuration('', 'half')).toBe('Half day');
    expect(composeDuration('', 'days')).toBeNull();
    expect(composeDuration('0', 'days')).toBeNull();
    expect(parseDuration('2 days')).toEqual({ value: '2', unit: 'days' });
    expect(parseDuration('Self-paced').unit).toBe('self');
    expect(durationDays('2 days')).toBe(2);
    expect(durationDays('Half day')).toBe(1);
    expect(durationDays('1 week')).toBe(5);
  });

  it('nobody can hold more than two places at once without paying', async () => {
    const { course: c, session } = await course({ capacity: 10 });
    const who = booker();
    const input = { courseId: c.id, sessionId: session!.id, places: 1, booker: who, bookerAttends: true, others: null };
    await createPendingBooking(input);
    await createPendingBooking(input);
    await expect(createPendingBooking(input)).rejects.toBeInstanceOf(CheckoutError);
    expect(await db.booking.count({ where: { booker: { email: who.email.toLowerCase() }, status: 'PAYMENT_PENDING' } })).toBe(2);
  });

  it('expired checkouts are hidden from Bookings unless asked for', async () => {
    const { course: c, session } = await course();
    const b = await createPendingBooking({ courseId: c.id, sessionId: session!.id, places: 1, booker: booker(), bookerAttends: true, others: null });
    await db.booking.update({ where: { id: b.id }, data: { holdExpiresAt: new Date(Date.now() - 60000) } });
    const ids = async (status?: string) => (await db.booking.findMany({ where: { id: b.id, ...bookingWhere(undefined, status) } })).length;
    expect(await ids()).toBe(0);
    expect(await ids('PAYMENT_PENDING')).toBe(0);
    expect(await ids('EXPIRED')).toBe(1);
  });
});
