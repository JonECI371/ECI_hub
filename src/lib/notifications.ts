import 'server-only';
import type { Course, Session, Subject, Venue } from '@prisma/client';
import { db } from '@/lib/db';
import { fmtSessionDates, fmtTime, gbp } from '@/lib/format';
import type { Block } from '@/lib/email-layout';
import { sendEmail } from '@/lib/integrations/email';
import { registrationLink } from '@/lib/registration-link';

type C = Course & { subject: Subject };
type S = (Session & { venue: Venue | null }) | null;

export function whenText(s: S) {
  return s ? `${fmtSessionDates(s.startsAt, s.endsAt)}, ${fmtTime(s.startsAt)} to ${fmtTime(s.endsAt)} UK time` : 'Start any time (eLearning)';
}

/** Where, respecting the venue release rule (address only after approval where the subject requires it). */
export function whereText(c: C, s: S, approved = false) {
  if (c.deliveryType === 'ELEARNING') return `Online, on ${c.provider ?? 'the learning platform'}`;
  if (c.deliveryType === 'VIRTUAL_CLASSROOM') return `${c.meetingPlatform === 'ZOOM' ? 'Zoom' : 'Microsoft Teams'} (link in your calendar invite)`;
  if (!s?.venue) return 'Venue to be confirmed';
  if ((c.subject.approvalRequired || c.venueRelease === 'AFTER_APPROVAL') && !approved) return `${s.venue.name} (full address once your registration is approved)`;
  return `${s.venue.name}, ${s.venue.address}, ${s.venue.postcode}`;
}

/** Booking confirmed: one email to the booker, and joining details to each named attendee. */
export async function sendBookingConfirmation(bookingId: string) {
  const b = await db.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { booker: true, course: { include: { subject: true } }, session: { include: { venue: true } }, attendees: { include: { person: true } } },
  });
  const missing = b.attendees.filter((a) => !a.personId).length;
  const own = b.attendees.find((a) => a.personId === b.bookerId);
  const blocks: Block[] = [
    { type: 'heading', text: b.places > 1 ? `${b.places} places booked, ${b.booker.firstName}` : `You're booked, ${b.booker.firstName}` },
    { type: 'text', text: 'Thanks for booking with ECI-Hub. Here are your details.' },
    { type: 'summary', rows: [['Course', b.course.title], ['Date', whenText(b.session)], ['Where', whereText(b.course, b.session)], ['Places', String(b.places)], ['Reference', b.reference], ['Paid', b.method === 'CARD' ? `${gbp(b.totalPence)} by card (VAT ${gbp(b.vatPence)})` : `${gbp(b.totalPence)} on account`]] },
  ];
  if (own) blocks.push({ type: 'text', text: 'One more thing: complete your registration. It takes about 2 minutes.' }, { type: 'button', label: 'Complete my registration', href: registrationLink(own.id) });
  if (missing) blocks.push({ type: 'note', text: `${missing} ${missing === 1 ? 'place still needs' : 'places still need'} attendee details. Add them from your account; we remind you 5 days before.` });
  blocks.push({ type: 'button', label: 'View my booking', href: `/account/bookings/${b.reference}` });
  await sendEmail({ to: b.booker.email, personId: b.bookerId, trigger: 'BOOKING_CONFIRMED', subject: `Booking confirmed: ${b.course.title} (${b.reference})`, blocks });

  for (const a of b.attendees) {
    if (!a.person || a.personId === b.bookerId) continue;
    await sendJoiningDetails(a.id);
  }
}

/** Joining details and registration link for one attendee. */
export async function sendJoiningDetails(attendeeId: string) {
  const a = await db.attendee.findUniqueOrThrow({ where: { id: attendeeId }, include: { person: true, booking: { include: { booker: true, course: { include: { subject: true } }, session: { include: { venue: true } } } } } });
  if (!a.person) return;
  const b = a.booking;
  await sendEmail({
    to: a.person.email, personId: a.person.id, trigger: 'ATTENDEE_ADDED', subject: `You're booked on ${b.course.title}`,
    blocks: [
      { type: 'heading', text: `You're booked, ${a.person.firstName}` },
      { type: 'text', text: `${b.booker.firstName} ${b.booker.lastName} has booked you on ${b.course.title}.` },
      { type: 'summary', rows: [['Course', b.course.title], ['Date', whenText(b.session)], ['Where', whereText(b.course, b.session)], ['Reference', b.reference]] },
      { type: 'text', text: 'Please complete your registration. It takes about 2 minutes.' },
      { type: 'button', label: 'Complete my registration', href: registrationLink(a.id) },
    ],
  });
}

/** Reminder the day before or an hour before a session, to everyone attending. */
export async function sendSessionReminder(sessionId: string, kind: 'DAY' | 'HOUR') {
  const s = await db.session.findUniqueOrThrow({ where: { id: sessionId }, include: { venue: true, course: { include: { subject: true } }, bookings: { where: { status: 'CONFIRMED' }, include: { attendees: { where: { status: { not: 'CANCELLED' } }, include: { person: true, registration: true } } } } } });
  const trigger = `REMINDER_${kind}:${s.id}`;
  for (const a of s.bookings.flatMap((b) => b.attendees)) {
    if (!a.person) continue;
    if (await db.emailLog.findFirst({ where: { trigger, personId: a.person.id } })) continue;
    const approved = a.registration?.approval === 'APPROVED' || a.registration?.approval === 'NOT_REQUIRED';
    const blocks: Block[] = [
      { type: 'heading', text: kind === 'DAY' ? `See you tomorrow, ${a.person.firstName}` : `Starting in an hour, ${a.person.firstName}` },
      { type: 'summary', rows: [['Course', s.course.title], ['Date', whenText(s)], ['Where', whereText(s.course, s, approved)]] },
    ];
    if (s.course.deliveryType === 'VIRTUAL_CLASSROOM' && s.joinUrl) blocks.push({ type: 'text', text: 'Join 10 minutes early with your camera and microphone working.' }, { type: 'button', label: `Join on ${s.course.meetingPlatform === 'ZOOM' ? 'Zoom' : 'Teams'}`, href: s.joinUrl });
    if (s.course.deliveryType === 'IN_PERSON' && s.venue && approved && s.venue.directions) blocks.push({ type: 'text', text: s.venue.directions });
    if (!a.registration) blocks.push({ type: 'note', text: 'Your registration is not complete yet. Please do it now so the course can go ahead for you.' }, { type: 'button', label: 'Complete my registration', href: registrationLink(a.id) });
    await sendEmail({ to: a.person.email, personId: a.person.id, trigger, subject: `${kind === 'DAY' ? 'Tomorrow' : 'In one hour'}: ${s.course.title}`, blocks });
  }
  if (kind === 'DAY' && s.trainerId) {
    const t = await db.person.findUnique({ where: { id: s.trainerId } });
    if (t && !(await db.emailLog.findFirst({ where: { trigger, personId: t.id } }))) {
      const names = s.bookings.flatMap((b) => b.attendees).map((a) => {
        const ans = (a.registration?.answers ?? {}) as Record<string, string>;
        const needs = [ans.dietary && `diet: ${ans.dietary}`, ans.accessNeeds && `access: ${ans.accessNeeds}`].filter(Boolean).join('; ');
        return [a.person ? `${a.person.firstName} ${a.person.lastName}` : 'Name to follow', needs || '-'] as [string, string];
      });
      await sendEmail({ to: t.email, personId: t.id, trigger, subject: `Class list for tomorrow: ${s.course.title}`, blocks: [{ type: 'heading', text: 'Your class list for tomorrow' }, { type: 'summary', rows: [['Course', s.course.title], ['Date', whenText(s)], ['Where', whereText(s.course, s, true)]] }, { type: 'summary', rows: names.length ? names : [['Nobody booked', '-']] }] });
    }
  }
}

/** Five days before: nudge attendees who have not registered, and bookers with unnamed places. */
export async function sendRegistrationReminders(sessionId: string) {
  const s = await db.session.findUniqueOrThrow({ where: { id: sessionId }, include: { venue: true, course: { include: { subject: true } }, bookings: { where: { status: 'CONFIRMED' }, include: { booker: true, attendees: { where: { status: { not: 'CANCELLED' } }, include: { person: true, registration: true } } } } } });
  const trigger = `REGISTRATION_MISSING:${s.id}`;
  for (const b of s.bookings) {
    for (const a of b.attendees) {
      if (!a.person || a.registration || (await db.emailLog.findFirst({ where: { trigger, personId: a.person.id } }))) continue;
      await sendEmail({ to: a.person.email, personId: a.person.id, trigger, subject: `Reminder: complete your registration for ${s.course.title}`, blocks: [{ type: 'heading', text: 'Your registration form is still open' }, { type: 'text', text: `Hi ${a.person.firstName}, we need a few details before your course. It takes about 3 minutes.` }, { type: 'summary', rows: [['Course', s.course.title], ['Date', whenText(s)], ['Booked by', `${b.booker.firstName} ${b.booker.lastName}`]] }, { type: 'button', label: 'Complete my form', href: registrationLink(a.id) }] });
    }
    const unnamed = b.attendees.filter((a) => !a.personId).length;
    if (unnamed && !(await db.emailLog.findFirst({ where: { trigger, personId: b.bookerId } }))) {
      await sendEmail({ to: b.booker.email, personId: b.bookerId, trigger, subject: `Add attendees for ${s.course.title}`, blocks: [{ type: 'heading', text: `${unnamed} ${unnamed === 1 ? 'place needs' : 'places need'} a name` }, { type: 'text', text: `Hi ${b.booker.firstName}, the course is in 5 days. Add who is attending so they get their joining details.` }, { type: 'summary', rows: [['Course', s.course.title], ['Date', whenText(s)], ['Reference', b.reference]] }, { type: 'button', label: 'Add attendees', href: `/account/bookings/${b.reference}` }] });
    }
  }
}

/** The venue for a date changed: tell everyone booked (and their bookers), respecting the address release rule. */
export async function sendVenueChanged(sessionId: string) {
  const s = await db.session.findUniqueOrThrow({ where: { id: sessionId }, include: { venue: true, course: { include: { subject: true } }, bookings: { where: { status: 'CONFIRMED' }, include: { booker: true, attendees: { where: { status: { not: 'CANCELLED' } }, include: { person: true, registration: true } } } } } });
  const sent = new Set<string>();
  for (const b of s.bookings) {
    const people = [...b.attendees.filter((a) => a.person).map((a) => ({ p: a.person!, approved: a.registration?.approval === 'APPROVED' || a.registration?.approval === 'NOT_REQUIRED' })), { p: b.booker, approved: false }];
    for (const { p, approved } of people) {
      if (sent.has(p.id)) continue;
      sent.add(p.id);
      const blocks: Block[] = [
        { type: 'heading', text: `New venue for ${s.course.title}` },
        { type: 'text', text: `Hello ${p.firstName}, the venue for this course has changed. The date and times are the same.` },
        { type: 'summary', rows: [['Course', s.course.title], ['Date', whenText(s)], ['Where', whereText(s.course, s, approved)]] },
      ];
      if (approved && s.venue?.directions) blocks.push({ type: 'text', text: s.venue.directions });
      blocks.push({ type: 'button', label: 'View my booking', href: `/account/bookings/${b.reference}` });
      await sendEmail({ to: p.email, personId: p.id, trigger: `VENUE_CHANGED:${s.id}`, subject: `Venue changed: ${s.course.title}`, blocks });
    }
  }
}

/** Venue address released to an attendee (in-person courses whose address waits for registration). */
export async function sendVenueReleased(attendeeId: string) {
  const a = await db.attendee.findUniqueOrThrow({ where: { id: attendeeId }, include: { person: true, booking: { include: { course: { include: { subject: true } }, session: { include: { venue: true } } } } } });
  const b = a.booking;
  if (!a.person || b.course.deliveryType !== 'IN_PERSON' || !b.session?.venue) return;
  const blocks: Block[] = [
    { type: 'heading', text: `Your venue for ${b.course.title}` },
    { type: 'text', text: `Thanks for registering, ${a.person.firstName}. Here is where to go.` },
    { type: 'summary', rows: [['Course', b.course.title], ['Date', whenText(b.session)], ['Where', whereText(b.course, b.session, true)]] },
  ];
  if (b.session.venue.directions) blocks.push({ type: 'text', text: b.session.venue.directions });
  blocks.push({ type: 'button', label: 'View my booking', href: `/account/bookings/${b.reference}` });
  await sendEmail({ to: a.person.email, personId: a.person.id, trigger: 'VENUE_RELEASED', subject: `Venue details: ${b.course.title}`, blocks });
}

/**
 * eLearning, "email the provider" courses: send the enrolment pack, record when it went, and raise a task
 * so the team confirms the enrolment (and marks it) once the provider replies.
 */
export async function sendEnrolmentPack(attendeeId: string) {
  const a = await db.attendee.findUniqueOrThrow({ where: { id: attendeeId }, include: { person: true, registration: true, booking: { include: { account: true, course: true } } } });
  const c = a.booking.course;
  if (!a.person || !c.providerEmail) return;
  const p = a.person;
  const scheme = (p.schemeIds ?? {}) as Record<string, string>;
  const ans = (a.registration?.answers ?? {}) as Record<string, string>;
  await sendEmail({
    to: c.providerEmail, trigger: 'ENROLMENT_PACK', subject: `Enrolment request: ${p.firstName} ${p.lastName}, ${c.title}`,
    blocks: [
      { type: 'heading', text: 'Please enrol this learner' },
      { type: 'text', text: `ECI-Hub has booked ${p.firstName} ${p.lastName} on ${c.title}. Please enrol them and send their login directly to the learner, then reply to confirm.` },
      { type: 'summary', rows: [['Course', c.title], ['Name', `${p.firstName} ${p.lastName}`], ['Email', p.email], ['Date of birth', p.dateOfBirth ? p.dateOfBirth.toLocaleDateString('en-GB', { timeZone: 'UTC' }) : 'Not given'], ['Employer', p.employer ?? a.booking.account?.company ?? 'Not given'], ['Scheme ID', scheme.eusr ?? scheme.compex ?? ans.eusrId ?? ans.compexId ?? 'None'], ['Booking reference', a.booking.reference]] },
      { type: 'note', text: 'Photo and ID files are held securely by ECI-Hub and sent on request. They are not attached to email.' },
    ],
  });
  await db.$transaction(async (tx) => {
    await tx.enrolment.update({ where: { attendeeId: a.id }, data: { packSentAt: new Date() } });
    const open = await tx.task.findFirst({ where: { type: 'ELEARNING_ENROLMENT', recordId: a.id, status: 'OPEN' } });
    if (!open) await tx.task.create({ data: { type: 'ELEARNING_ENROLMENT', title: `Confirm enrolment: ${p.firstName} ${p.lastName} with ${c.provider ?? 'the provider'}`, detail: `Pack emailed to ${c.providerEmail}. Mark enrolled once they confirm.`, recordType: 'Attendee', recordId: a.id, payload: { packSent: true } } });
    await tx.auditLog.create({ data: { action: 'ENROLMENT_PACK_SENT', recordType: 'Attendee', recordId: a.id, after: { to: c.providerEmail } } });
  });
}

/** Learner enrolled: access details and the finish-by date. */
export async function sendEnrolled(attendeeId: string) {
  const a = await db.attendee.findUniqueOrThrow({ where: { id: attendeeId }, include: { person: true, enrolment: true, booking: { include: { course: true } } } });
  if (!a.person || !a.enrolment) return;
  const e = a.enrolment;
  await sendEmail({
    to: a.person.email, personId: a.person.id, trigger: 'ELEARNING_ENROLLED', subject: `You're enrolled: ${a.booking.course.title}`,
    blocks: [
      { type: 'heading', text: `You're enrolled, ${a.person.firstName}` },
      { type: 'text', text: `Your login for ${a.booking.course.title} comes from ${e.provider} by email, usually within one working day. Check your junk folder if it hasn't arrived.` },
      { type: 'summary', rows: [['Course', a.booking.course.title], ['Platform', e.provider], ['Finish by', e.deadline ? e.deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }) : 'No deadline'], ['Reference', a.booking.reference]] },
      { type: 'button', label: 'View my booking', href: `/account/bookings/${a.booking.reference}` },
    ],
  });
}
