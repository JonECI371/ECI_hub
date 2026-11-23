import 'server-only';
import { db } from '@/lib/db';
import { currentPerson } from '@/lib/auth';
import { managesBooking } from '@/lib/booker';
import { checkoutBookingId } from '@/app/(site)/book/actions';

export type DelegateState = { key: 'COMPLETE' | 'ENTERED' | 'LINK_SENT' | 'NEEDED'; label: string; tone: 'soft' | 'grey' | 'warn'; done: boolean };

type A = { personId: string | null; status: string; registration: { enteredById: string | null } | null };

/** Where one delegate is on the Delegate details page: done, entered by the booker, link emailed, or details still needed. */
export function delegateState(a: A, bookerId: string): DelegateState {
  if (a.registration) {
    return a.registration.enteredById
      ? { key: 'ENTERED', label: 'Entered by you', tone: 'soft', done: true }
      : { key: 'COMPLETE', label: 'Complete', tone: 'soft', done: true };
  }
  if (a.personId && a.personId !== bookerId && a.status === 'INVITED') return { key: 'LINK_SENT', label: 'Link sent', tone: 'grey', done: false };
  return { key: 'NEEDED', label: 'Details needed', tone: 'warn', done: false };
}

/** A confirmed booking, if this visitor may manage it: the browser that just booked it, the booker, or someone on the booker's account. */
export async function bookingForDelegates(reference: string) {
  const b = await db.booking.findUnique({
    where: { reference },
    include: {
      booker: true,
      course: { include: { subject: true } },
      session: true,
      attendees: { include: { person: true, registration: true }, orderBy: { id: 'asc' } },
    },
  });
  if (!b || b.status !== 'CONFIRMED') return null;
  const me = await currentPerson();
  const ok = b.id === (await checkoutBookingId()) || (me && (await managesBooking(me.id, b)));
  return ok ? b : null;
}

/** True when the booker (not the delegate) is filling in a delegate's registration. Only they see the authority tick. */
export async function enteringForOther(a: { personId: string | null; bookingId: string; booking: { bookerId: string } }) {
  if (a.personId === a.booking.bookerId) return false;
  const me = await currentPerson();
  if (me?.id === a.personId) return false;
  return me?.id === a.booking.bookerId || a.bookingId === (await checkoutBookingId());
}

export const delegatesPath = (reference: string) => `/book/delegates?ref=${encodeURIComponent(reference)}`;
