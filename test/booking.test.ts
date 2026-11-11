import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { CheckoutError, confirmCardBooking, createPendingBooking, pricing } from '@/lib/booking';
import { placesLeft } from '@/lib/sessions';
import { booker, course } from './fixtures';

describe('pricing', () => {
  it('adds VAT per booking and rounds to the penny', () => {
    expect(pricing(18500, 20, 2)).toEqual({ subtotalPence: 37000, vatPence: 7400, totalPence: 44400 });
    expect(pricing(999, 20, 1)).toEqual({ subtotalPence: 999, vatPence: 200, totalPence: 1199 });
  });
});

describe('checkout and capacity', () => {
  it('holds places, creates the booker silently and one attendee row per place', async () => {
    const { course: c, session } = await course({ capacity: 5 });
    const b = await createPendingBooking({ courseId: c.id, sessionId: session!.id, places: 3, booker: booker(), bookerAttends: true, others: null });
    expect(b.status).toBe('PAYMENT_PENDING');
    expect(b.holdExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 4 * 60000); // held for 5 minutes
    expect(b.holdExpiresAt!.getTime()).toBeLessThan(Date.now() + 6 * 60000);
    expect(await db.attendee.count({ where: { bookingId: b.id } })).toBe(3);
    expect((await placesLeft([session!])).get(session!.id)).toBe(2);
  });

  it('refuses more places than are left', async () => {
    const { course: c, session } = await course({ capacity: 2 });
    await expect(createPendingBooking({ courseId: c.id, sessionId: session!.id, places: 3, booker: booker(), bookerAttends: true, others: null })).rejects.toBeInstanceOf(CheckoutError);
  });

  it('never sells the last place twice when people book at the same moment', async () => {
    const { course: c, session } = await course({ capacity: 3 });
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => createPendingBooking({ courseId: c.id, sessionId: session!.id, places: 1, booker: booker(), bookerAttends: true, others: null })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect((await placesLeft([session!])).get(session!.id)).toBe(0);
  });

  it('releases places when the 15-minute hold runs out', async () => {
    const { course: c, session } = await course({ capacity: 1 });
    const b = await createPendingBooking({ courseId: c.id, sessionId: session!.id, places: 1, booker: booker(), bookerAttends: true, others: null });
    await db.booking.update({ where: { id: b.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    expect((await placesLeft([session!])).get(session!.id)).toBe(1);
  });

  it('will not sell a course with no online price', async () => {
    const { course: c, session } = await course({ price: 0 });
    await expect(createPendingBooking({ courseId: c.id, sessionId: session!.id, places: 1, booker: booker(), bookerAttends: true, others: null })).rejects.toThrow(/no online price/);
  });

  it('never overwrites an existing person from a public form', async () => {
    const { course: c, session } = await course();
    const email = `keep${Date.now()}@example.com`;
    await db.person.create({ data: { email, firstName: 'Real', lastName: 'Name' } });
    await createPendingBooking({ courseId: c.id, sessionId: session!.id, places: 1, booker: { ...booker(email), firstName: 'Imposter' }, bookerAttends: true, others: null });
    expect((await db.person.findUniqueOrThrow({ where: { email } })).firstName).toBe('Real');
  });
});

describe('payment confirmation', () => {
  it('confirms once, even if the payment is reported twice', async () => {
    const { course: c, session } = await course();
    const b = await createPendingBooking({ courseId: c.id, sessionId: session!.id, places: 1, booker: booker(), bookerAttends: true, others: null });
    const first = await confirmCardBooking(b.id, `pi_test_${b.id}`);
    const second = await confirmCardBooking(b.id, `pi_test_${b.id}`);
    expect(first.already).toBe(false);
    expect(second.already).toBe(true);
    expect(await db.payment.count({ where: { bookingId: b.id } })).toBe(1);
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('CONFIRMED');
  });
});
