import 'server-only';
import type { Course, Person, Session, Subject, Venue } from '@prisma/client';
import { fmtSessionDates, fmtTime } from '@/lib/format';
import { MAX_PLACES } from '@/lib/booking';
import type { CheckoutProps } from '@/components/checkout-form';
import { statementText } from '@/lib/credit';
import { DEFAULT_POLICY, policyShort, type Policy } from '@/lib/cancellation-policy';

export type AccountInfo = { account: { company: string; status: string; poRule: string }; role: string; available: number; lastPo: string | null } | null;

export function checkoutProps(
  course: Course & { subject: Subject },
  session: (Session & { venue: Venue | null }) | null,
  left: number | null,
  me: Person | null,
  acc: AccountInfo = null,
  policy: Policy = DEFAULT_POLICY,
  addTo: string | null = null,
): CheckoutProps {
  const when = session
    ? [
        fmtSessionDates(session.startsAt, session.endsAt),
        `${fmtTime(session.startsAt)} to ${fmtTime(session.endsAt)} UK time · ${course.deliveryType === 'IN_PERSON' ? session.venue?.name ?? 'Venue to be confirmed' : course.meetingPlatform === 'ZOOM' ? 'Zoom' : 'Microsoft Teams'}`,
      ]
    : [`eLearning · start any time${course.daysToComplete ? ` · ${course.daysToComplete} days to complete` : ''}`];
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
    cutoffText: session ? policyShort(policy) : 'Free cancellation until you are enrolled on the course.',
    prefill: me ? { firstName: me.firstName, lastName: me.lastName, email: me.email, mobile: me.mobile ?? '' } : null,
    backHref: addTo ? `/account/bookings/${addTo}` : `/courses/${course.slug}`,
    addTo,
    account: acc && me ? {
      company: acc.account.company, role: acc.role === 'MAIN_BOOKER' ? 'Main booker' : 'Booker', available: acc.available, onHold: acc.account.status === 'ON_HOLD',
      poRequired: acc.account.poRule !== 'NONE', lastPo: acc.lastPo ?? '', statementText: statementText(), bookerName: `${me.firstName} ${me.lastName}`, bookerEmail: me.email,
    } : null,
  };
}
