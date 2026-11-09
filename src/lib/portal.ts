import 'server-only';
import type { Attendee, Course, Enrolment, Registration, Session, Subject } from '@prisma/client';
import { db } from '@/lib/db';

export type Tone = 'soft' | 'warn' | 'grey' | 'bad';

/** What an attendee still needs, in plain words, for the status chip. */
export function attendeeState(
  a: Attendee & { registration: Registration | null; enrolment: Enrolment | null },
  course: Course & { subject: Subject },
): { label: string; tone: Tone; needsRegistration: boolean } {
  if (a.status === 'CANCELLED') return { label: 'Cancelled', tone: 'grey', needsRegistration: false };
  if (!a.personId) return { label: 'Details needed', tone: 'warn', needsRegistration: false };
  if (a.status === 'CERTIFIED') return { label: 'Certified', tone: 'soft', needsRegistration: false };
  if (a.status === 'ATTENDED') return { label: 'Attended', tone: 'soft', needsRegistration: false };
  if (a.status === 'NO_SHOW') return { label: 'Did not attend', tone: 'bad', needsRegistration: false };
  if (!a.registration) return { label: 'Registration needed', tone: 'warn', needsRegistration: true };
  if (a.registration.approval === 'PENDING') return { label: 'Awaiting approval', tone: 'grey', needsRegistration: false };
  if (a.registration.approval === 'RETURNED') return { label: 'Registration returned', tone: 'bad', needsRegistration: true };
  if (course.deliveryType === 'ELEARNING') {
    if (a.enrolment?.completedAt) return { label: 'Completed', tone: 'soft', needsRegistration: false };
    if (a.enrolment?.enrolledAt) return { label: 'Enrolled', tone: 'soft', needsRegistration: false };
    return { label: 'Enrolment in progress', tone: 'grey', needsRegistration: false };
  }
  return { label: 'Ready', tone: 'soft', needsRegistration: false };
}

/** Change and cancel are allowed until the subject's cut-off before the start. eLearning: until enrolled. */
export function withinCutoff(session: Session | null, subject: Subject, enrolled = false): boolean {
  if (!session) return !enrolled;
  return session.startsAt.getTime() - Date.now() > subject.changeCutoffHours * 3600000;
}

export function cutoffWords(hours: number): string {
  return hours % 24 === 0 ? `${hours / 24} ${hours === 24 ? 'day' : 'days'}` : `${hours} hours`;
}

const upcomingSession = () => ({ OR: [{ sessionId: null }, { session: { endsAt: { gt: new Date() } } }] });

/** Places I am attending, soonest first (eLearning last). */
export async function myPlaces(personId: string) {
  const rows = await db.attendee.findMany({
    where: { personId, status: { not: 'CANCELLED' }, booking: { status: 'CONFIRMED', ...upcomingSession() } },
    include: { registration: true, enrolment: true, booking: { include: { course: { include: { subject: true } }, session: { include: { venue: true } } } } },
  });
  return rows
    .filter((r) => !(r.booking.course.deliveryType === 'ELEARNING' && r.enrolment?.completedAt))
    .sort((x, y) => (x.booking.session?.startsAt.getTime() ?? Infinity) - (y.booking.session?.startsAt.getTime() ?? Infinity));
}

/** Bookings I made that include other people, with what each still needs. */
export async function bookingsIMade(personId: string) {
  return db.booking.findMany({
    where: { bookerId: personId, status: 'CONFIRMED', ...upcomingSession(), attendees: { some: { OR: [{ personId: null }, { personId: { not: personId } }] } } },
    include: { course: { include: { subject: true } }, session: true, attendees: { where: { status: { not: 'CANCELLED' } }, include: { person: true, registration: true, enrolment: true } } },
    orderBy: { createdAt: 'desc' },
  });
}
