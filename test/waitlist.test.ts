import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createPendingBooking, confirmCardBooking } from '@/lib/booking';
import { placesLeft } from '@/lib/sessions';
import { joinWaitlist, offerFreedPlaces } from '@/lib/waitlist';
import { booker, course } from './fixtures';

describe('waitlist', () => {
  it('offers a freed place to the first person, holds it for them, and passes it on when the offer expires', async () => {
    const { course: c, session } = await course({ capacity: 1 });
    const s = session!;
    const b = await createPendingBooking({ courseId: c.id, sessionId: s.id, places: 1, booker: booker(), bookerAttends: true, others: null });
    await confirmCardBooking(b.id, `pi_${b.id}`);
    const [p1, p2] = await Promise.all([db.person.create({ data: { email: `w1${Date.now()}@example.com`, firstName: 'First', lastName: 'Waiting' } }), db.person.create({ data: { email: `w2${Date.now()}@example.com`, firstName: 'Second', lastName: 'Waiting' } })]);
    const e1 = await joinWaitlist(s.id, p1.id, 1);
    const e2 = await joinWaitlist(s.id, p2.id, 1);
    expect(await offerFreedPlaces(s.id)).toBe(0); // still full

    await db.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED' } });
    expect(await offerFreedPlaces(s.id)).toBe(1);
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: e1.id } })).offerToken).toBeTruthy();
    expect((await placesLeft([s])).get(s.id)).toBe(0); // held for the first person

    await expect(createPendingBooking({ courseId: c.id, sessionId: s.id, places: 1, booker: booker(), bookerAttends: true, others: null })).rejects.toThrow();
    const claim = await createPendingBooking({ courseId: c.id, sessionId: s.id, places: 1, booker: { firstName: 'First', lastName: 'Waiting', email: p1.email, marketingOptIn: false }, bookerAttends: true, others: null, waitlistEntryId: e1.id });
    expect(claim.status).toBe('PAYMENT_PENDING');

    // If the first person lets it expire instead, the second person gets it.
    await db.booking.delete({ where: { id: claim.id } }).catch(async () => { await db.attendee.deleteMany({ where: { bookingId: claim.id } }); await db.booking.delete({ where: { id: claim.id } }); });
    await db.waitlistEntry.update({ where: { id: e1.id }, data: { offerExpiresAt: new Date(Date.now() - 1000) } });
    expect(await offerFreedPlaces(s.id)).toBe(1);
    expect(await db.waitlistEntry.findUnique({ where: { id: e1.id } })).toBeNull();
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: e2.id } })).offerToken).toBeTruthy();
  });
});
