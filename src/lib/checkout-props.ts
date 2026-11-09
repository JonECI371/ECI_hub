import 'server-only';
import type { Course, Person, Session, Subject, Venue } from '@prisma/client';
import { fmtSessionDates, fmtTime } from '@/lib/format';
import { MAX_PLACES } from '@/lib/booking';
import type { CheckoutProps } from '@/components/checkout-form';

export function checkoutProps(
  course: Course & { subject: Subject },
  session: (Session & { venue: Venue | null }) | null,
  left: number | null,
  me: Person | null,
): CheckoutProps {
  const when = session
    ? [
        fmtSessionDates(session.startsAt, session.endsAt),
        `${fmtTime(session.startsAt)} to ${fmtTime(session.endsAt)} UK time · ${course.deliveryType === 'IN_PERSON' ? session.venue?.name ?? 'Venue to be confirmed' : course.meetingPlatform === 'ZOOM' ? 'Zoom' : 'Microsoft Teams'}`,
      ]
    : [`eLearning · start any time${course.daysToComplete ? ` · ${course.daysToComplete} days to complete` : ''}`];
  const hours = course.subject.changeCutoffHours;
  const cutoff = hours % 24 === 0 ? `${hours / 24} ${hours === 24 ? 'day' : 'days'}` : `${hours} hours`;
  return {
    courseId: course.id,
    sessionId: session?.id ?? null,
    title: course.title,
    deliveryType: course.deliveryType,
    subjectName: course.subject.name,
    when,
    pricePence: course.pricePence,
    vatRate: course.vatRatePercent,
    maxPlaces: Math.max(1, Math.min(MAX_PLACES, left ?? MAX_PLACES)),
    needsWaiver: !!session && session.startsAt.getTime() - Date.now() < 14 * 86400000,
    cutoffText: session ? `Free cancellation up to ${cutoff} before the start.` : 'Free cancellation until you are enrolled on the course.',
    prefill: me ? { firstName: me.firstName, lastName: me.lastName, email: me.email, mobile: me.mobile ?? '' } : null,
    backHref: `/courses/${course.slug}`,
  };
}
