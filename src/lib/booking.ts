import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { placesTakenWhere } from '@/lib/sessions';
import { placesOnOffer } from '@/lib/waitlist';

export const HOLD_MINUTES = 15;
export const MAX_PLACES = 20;

export function pricing(pricePence: number, vatRatePercent: number, places: number) {
  const subtotalPence = pricePence * places;
  const vatPence = Math.round((subtotalPence * vatRatePercent) / 100);
  return { subtotalPence, vatPence, totalPence: subtotalPence + vatPence };
}

const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newReference(): string {
  const b = randomBytes(6);
  return 'ECI-' + Array.from(b, (x) => REF_CHARS[x % REF_CHARS.length]).join('');
}

/** Find a person by email, or create them from the details given. Existing records are never overwritten by a public form. */
export async function findOrCreatePerson(tx: Prisma.TransactionClient, p: { email: string; firstName: string; lastName: string; mobile?: string; marketingOptIn?: boolean }) {
  const email = p.email.trim().toLowerCase();
  const existing = await tx.person.findUnique({ where: { email } });
  if (existing) return existing;
  const created = await tx.person.create({ data: { email, firstName: p.firstName.trim(), lastName: p.lastName.trim(), mobile: p.mobile?.trim() || null, marketingOptIn: !!p.marketingOptIn } });
  await tx.auditLog.create({ data: { action: 'PERSON_CREATED_AT_CHECKOUT', recordType: 'Person', recordId: created.id, after: { email } } });
  return created;
}

export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') || '-' };
}

export type CheckoutInput = {
  courseId: string;
  sessionId: string | null;
  places: number;
  booker: { firstName: string; lastName: string; email: string; mobile?: string; marketingOptIn: boolean };
  bookerAttends: boolean;
  others: { name: string; email: string }[] | null; // null = add later
  waitlistEntryId?: string; // claiming a waitlist offer: that entry's held places count as free
};

export class CheckoutError extends Error {}

/**
 * Creates a payment-pending booking that holds its places for 15 minutes.
 * The capacity check and the insert run under a per-session lock, so two people cannot take the last place.
 */
export async function createPendingBooking(input: CheckoutInput) {
  return db.$transaction(async (tx) => {
    const course = await tx.course.findUniqueOrThrow({ where: { id: input.courseId } });
    if (course.status !== 'PUBLISHED') throw new CheckoutError('This course is not open for booking.');
    if (!course.pricePence) throw new CheckoutError('This course has no online price yet. Contact us to book.');

    if (input.sessionId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.sessionId}))`;
      const session = await tx.session.findUniqueOrThrow({ where: { id: input.sessionId } });
      if (session.courseId !== course.id || session.status !== 'PUBLISHED' || session.startsAt <= new Date()) throw new CheckoutError('This date is no longer available.');
      const taken = await tx.booking.aggregate({ where: { sessionId: session.id, ...placesTakenWhere() }, _sum: { places: true } });
      const left = session.capacity - (taken._sum.places ?? 0) - (await placesOnOffer(tx, session.id, input.waitlistEntryId));
      if (input.places > left) throw new CheckoutError(left > 0 ? `Only ${left} ${left === 1 ? 'place is' : 'places are'} left on this date.` : 'This date is now full.');
    }

    const booker = await findOrCreatePerson(tx, input.booker);
    // Stops anyone holding places they have no intention of paying for: two open checkouts at a time.
    const open = await tx.booking.count({ where: { bookerId: booker.id, status: 'PAYMENT_PENDING', holdExpiresAt: { gt: new Date() } } });
    if (open >= 2) throw new CheckoutError('You already have two checkouts open. Finish paying for one, or wait a few minutes and try again.');
    const money = pricing(course.pricePence, course.vatRatePercent, input.places);
    const booking = await tx.booking.create({
      data: {
        reference: newReference(),
        bookerId: booker.id,
        courseId: course.id,
        sessionId: input.sessionId,
        places: input.places,
        method: 'CARD',
        ...money,
        status: 'PAYMENT_PENDING',
        holdExpiresAt: new Date(Date.now() + HOLD_MINUTES * 60000),
      },
    });

    // One attendee row per place: the booker (if attending), named people, then unnamed places.
    const people: (string | null)[] = [];
    if (input.bookerAttends) people.push(booker.id);
    for (const o of input.others ?? []) {
      const n = splitName(o.name);
      people.push((await findOrCreatePerson(tx, { email: o.email, ...n })).id);
    }
    while (people.length < input.places) people.push(null);
    await tx.attendee.createMany({
      data: people.slice(0, input.places).map((personId) => ({ bookingId: booking.id, personId, status: personId ? 'INVITED' : 'DETAILS_MISSING' })),
    });
    await tx.auditLog.create({ data: { actorId: booker.id, action: 'BOOKING_STARTED', recordType: 'Booking', recordId: booking.id, after: { reference: booking.reference, places: input.places, totalPence: money.totalPence } } });
    return booking;
  });
}

/** Marks a held booking as paid. Idempotent: confirming twice does nothing the second time. */
export async function confirmCardBooking(bookingId: string, paymentRef: string) {
  return db.$transaction(async (tx) => {
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (b.status === 'CONFIRMED') return { booking: b, already: true };
    if (b.status !== 'PAYMENT_PENDING') throw new CheckoutError('This booking can no longer be paid.');
    await tx.payment.upsert({
      where: { stripeIntentId: paymentRef },
      update: { status: 'succeeded' },
      create: { bookingId: b.id, stripeIntentId: paymentRef, amountPence: b.totalPence, status: 'succeeded' },
    });
    const booking = await tx.booking.update({ where: { id: b.id }, data: { status: 'CONFIRMED', holdExpiresAt: null } });
    // A claimed waitlist offer is used up once paid.
    if (b.sessionId) await tx.waitlistEntry.deleteMany({ where: { sessionId: b.sessionId, personId: b.bookerId } });
    await tx.auditLog.create({ data: { actorId: b.bookerId, action: 'BOOKING_CONFIRMED', recordType: 'Booking', recordId: b.id, before: { status: b.status }, after: { status: 'CONFIRMED', paymentRef } } });
    return { booking, already: false };
  });
}

export const holdLive = (b: { status: string; holdExpiresAt: Date | null }) =>
  b.status === 'PAYMENT_PENDING' && !!b.holdExpiresAt && b.holdExpiresAt > new Date();
