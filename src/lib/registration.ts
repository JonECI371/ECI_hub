import 'server-only';
import { db } from '@/lib/db';
import { currentPerson } from '@/lib/auth';
import { registrationTokenOk } from '@/lib/registration-link';

/** Loads an attendee for registration if this request may see it: the signed email link, the attendee, or their booker. */
export async function loadForRegistration(attendeeId: string, token: string | undefined) {
  const a = await db.attendee.findUnique({
    where: { id: attendeeId },
    include: {
      person: true,
      registration: true,
      booking: { include: { booker: true, account: true, course: { include: { subject: true } }, session: { include: { venue: true } } } },
    },
  });
  if (!a || a.status === 'CANCELLED' || a.booking.status === 'CANCELLED') return null;
  if (registrationTokenOk(a.id, token)) return a;
  const me = await currentPerson();
  if (me && (me.id === a.personId || me.id === a.booking.bookerId)) return a;
  return null;
}
