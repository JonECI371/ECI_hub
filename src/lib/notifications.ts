import 'server-only';
import { db } from '@/lib/db';
import { SITE_URL, fmtSessionDates, fmtTime, gbp } from '@/lib/format';
import { sendEmail } from '@/lib/integrations/email';
import { registrationLink } from '@/lib/registration-link';

/** Booking confirmed: one email to the booker, and joining details to each named attendee. */
export async function sendBookingConfirmation(bookingId: string) {
  const b = await db.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { booker: true, course: { include: { subject: true } }, session: { include: { venue: true } }, attendees: { include: { person: true } } },
  });
  const when = b.session
    ? `${fmtSessionDates(b.session.startsAt, b.session.endsAt)}, ${fmtTime(b.session.startsAt)} to ${fmtTime(b.session.endsAt)} UK time`
    : 'Start any time (eLearning)';
  const where =
    b.course.deliveryType === 'IN_PERSON'
      ? b.course.subject.approvalRequired
        ? 'The venue address is sent once registration is approved.'
        : b.session?.venue ? `${b.session.venue.name}, ${b.session.venue.address}, ${b.session.venue.postcode}` : 'Venue to be confirmed'
      : b.course.deliveryType === 'VIRTUAL_CLASSROOM'
        ? `Online. Your ${b.course.meetingPlatform === 'ZOOM' ? 'Zoom' : 'Microsoft Teams'} invite follows separately.`
        : 'Online. Access details follow once you are enrolled.';
  const missing = b.attendees.filter((a) => !a.personId).length;
  const own = b.attendees.find((a) => a.personId === b.bookerId);
  await sendEmail({
    to: b.booker.email,
    personId: b.bookerId,
    trigger: 'BOOKING_CONFIRMED',
    subject: `Booking confirmed: ${b.course.title} (${b.reference})`,
    text: [
      `Hello ${b.booker.firstName},`,
      '',
      `Your booking ${b.reference} is confirmed.`,
      `${b.course.title}`,
      when,
      where,
      `Places: ${b.places}`,
      `Total paid: ${gbp(b.totalPence)} (including VAT ${gbp(b.vatPence)})`,
      own ? `\nComplete your registration (about 2 minutes): ${SITE_URL}${registrationLink(own.id)}` : '',
      missing ? `\n${missing} ${missing === 1 ? 'place still needs' : 'places still need'} attendee details. Add them from your account: ${SITE_URL}/account` : '',
      '',
      `Manage your booking: ${SITE_URL}/account`,
    ].join('\n'),
  });
  for (const a of b.attendees) {
    if (!a.person || a.personId === b.bookerId) continue;
    await sendEmail({
      to: a.person.email,
      personId: a.personId!,
      trigger: 'ATTENDEE_ADDED',
      subject: `You're booked on ${b.course.title}`,
      text: `Hello ${a.person.firstName},\n\n${b.booker.firstName} ${b.booker.lastName} has booked you on ${b.course.title}.\n${when}\n${where}\n\nComplete your registration (about 2 minutes): ${SITE_URL}${registrationLink(a.id)}\n\nSee your joining details any time: ${SITE_URL}/account`,
    });
  }
}
