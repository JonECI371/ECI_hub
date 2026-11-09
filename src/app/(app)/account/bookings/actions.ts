'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePerson } from '@/lib/auth';
import { SITE_URL, fmtSessionDates, fmtTime } from '@/lib/format';
import { findOrCreatePerson, splitName } from '@/lib/booking';
import { placesTakenWhere } from '@/lib/sessions';
import { withinCutoff } from '@/lib/portal';
import { registrationLink } from '@/lib/registration-link';
import { sendEmail } from '@/lib/integrations/email';

/** Loads a booking the signed-in person made. Every action checks this on the server. */
async function myBooking(reference: string) {
  const me = await requirePerson();
  const b = await db.booking.findUnique({
    where: { reference },
    include: { course: { include: { subject: true } }, session: true, attendees: { include: { person: true, registration: true, enrolment: true } }, payments: true, booker: true },
  });
  if (!b || b.bookerId !== me.id) redirect('/no-access');
  return { me, b };
}

const back = (ref: string, msg: string) => {
  revalidatePath(`/account/bookings/${ref}`);
  redirect(`/account/bookings/${ref}?msg=${msg}`);
};

/** Name an empty place, or swap someone out (before the cut-off). */
export async function setAttendee(form: FormData) {
  const ref = String(form.get('ref'));
  const attendeeId = String(form.get('attendeeId'));
  const { me, b } = await myBooking(ref);
  const a = b.attendees.find((x) => x.id === attendeeId);
  if (!a || a.status === 'CANCELLED') back(ref, 'error');
  const swap = !!a!.personId;
  if (swap && !withinCutoff(b.session, b.course.subject)) back(ref, 'cutoff');
  const name = z.string().trim().min(1).max(80).safeParse(form.get('name'));
  const email = z.string().trim().toLowerCase().email().safeParse(form.get('email'));
  if (!name.success || !email.success) back(ref, 'invalid');
  const person = await db.$transaction(async (tx) => {
    const p = await findOrCreatePerson(tx, { email: email.data!, ...splitName(name.data!) });
    if (b.attendees.some((x) => x.personId === p.id && x.status !== 'CANCELLED')) return null;
    if (swap) {
      await tx.registration.deleteMany({ where: { attendeeId: a!.id } });
      await tx.enrolment.deleteMany({ where: { attendeeId: a!.id } });
    }
    await tx.attendee.update({ where: { id: a!.id }, data: { personId: p.id, status: 'INVITED' } });
    await tx.auditLog.create({ data: { actorId: me.id, action: swap ? 'ATTENDEE_SWAPPED' : 'ATTENDEE_ADDED', recordType: 'Booking', recordId: b.id, before: { personId: a!.personId }, after: { personId: p.id } } });
    return p;
  });
  if (!person) back(ref, 'duplicate');
  await sendEmail({
    to: person!.email,
    personId: person!.id,
    trigger: 'ATTENDEE_ADDED',
    subject: `You're booked on ${b.course.title}`,
    text: `Hello ${person!.firstName},\n\n${me.firstName} ${me.lastName} has booked you on ${b.course.title}${b.session ? `, ${fmtSessionDates(b.session.startsAt, b.session.endsAt)} at ${fmtTime(b.session.startsAt)} UK time` : ''}.\n\nComplete your registration (about 2 minutes): ${SITE_URL}${registrationLink(a!.id)}`,
  });
  back(ref, swap ? 'swapped' : 'added');
}

/** Email everyone on the booking who has not registered yet. */
export async function sendReminders(form: FormData) {
  const ref = String(form.get('ref'));
  const { me, b } = await myBooking(ref);
  const todo = b.attendees.filter((a) => a.person && a.status !== 'CANCELLED' && !a.registration && a.personId !== me.id);
  for (const a of todo) {
    await sendEmail({
      to: a.person!.email,
      personId: a.personId!,
      trigger: 'REGISTRATION_REMINDER',
      subject: `Reminder: register for ${b.course.title}`,
      text: `Hello ${a.person!.firstName},\n\nPlease complete your registration for ${b.course.title}. It takes about 2 minutes: ${SITE_URL}${registrationLink(a.id)}`,
    });
  }
  back(ref, todo.length ? 'reminded' : 'none');
}

/** Move the whole booking to another date of the same course (virtual classroom), or ask for it (in person). */
export async function changeDate(form: FormData) {
  const ref = String(form.get('ref'));
  const { me, b } = await myBooking(ref);
  if (b.status !== 'CONFIRMED' || !b.session || !withinCutoff(b.session, b.course.subject)) back(ref, 'cutoff');
  const reason = String(form.get('reason') ?? '').slice(0, 500);
  const target = String(form.get('sessionId') ?? '');

  if (b.course.deliveryType === 'IN_PERSON') {
    await db.task.create({ data: { type: 'DATE_CHANGE', title: `Date change request: ${b.reference}`, detail: `${b.course.title}. ${reason || 'No reason given.'}${target ? ` Preferred session ${target}.` : ''}`, recordType: 'Booking', recordId: b.id, payload: { sessionId: target || null } } });
    await db.auditLog.create({ data: { actorId: me.id, action: 'DATE_CHANGE_REQUESTED', recordType: 'Booking', recordId: b.id, after: { target, reason } } });
    back(ref, 'requested');
  }

  const ok = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${target}))`;
    const s = await tx.session.findUnique({ where: { id: target } });
    if (!s || s.courseId !== b.courseId || s.status !== 'PUBLISHED' || s.startsAt <= new Date() || s.id === b.sessionId) return false;
    const taken = await tx.booking.aggregate({ where: { sessionId: s.id, ...placesTakenWhere() }, _sum: { places: true } });
    if (s.capacity - (taken._sum.places ?? 0) < b.places) return false;
    await tx.booking.update({ where: { id: b.id }, data: { sessionId: s.id } });
    await tx.auditLog.create({ data: { actorId: me.id, action: 'DATE_CHANGED', recordType: 'Booking', recordId: b.id, before: { sessionId: b.sessionId }, after: { sessionId: s.id, reason } } });
    return s;
  });
  if (!ok) back(ref, 'nodate');
  const s = ok as Exclude<typeof ok, false>;
  for (const p of [b.booker, ...b.attendees.map((a) => a.person).filter((x) => x && x.id !== b.bookerId)]) {
    await sendEmail({ to: p!.email, personId: p!.id, trigger: 'DATE_CHANGED', subject: `New date: ${b.course.title}`, text: `Hello ${p!.firstName},\n\n${b.course.title} (${b.reference}) has moved to ${fmtSessionDates(s.startsAt, s.endsAt)}, ${fmtTime(s.startsAt)} to ${fmtTime(s.endsAt)} UK time. An updated calendar invite follows.` });
  }
  back(ref, 'changed');
}

/** Cancel before the cut-off. Card bookings are refunded in full (test mode records the refund only). */
export async function cancelBooking(form: FormData) {
  const ref = String(form.get('ref'));
  const { me, b } = await myBooking(ref);
  const enrolled = b.attendees.some((a) => a.enrolment?.enrolledAt);
  if (b.status !== 'CONFIRMED' || !withinCutoff(b.session, b.course.subject, enrolled)) back(ref, 'cutoff');
  const reason = String(form.get('reason') ?? '').slice(0, 200);
  await db.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED' } });
    await tx.attendee.updateMany({ where: { bookingId: b.id }, data: { status: 'CANCELLED' } });
    for (const p of b.payments) {
      if (p.status === 'succeeded') await tx.payment.update({ where: { id: p.id }, data: { refundedPence: p.amountPence, status: process.env.PAYMENTS_MODE === 'stripe' ? 'refund_pending' : 'refunded_test' } });
    }
    await tx.auditLog.create({ data: { actorId: me.id, action: 'BOOKING_CANCELLED', recordType: 'Booking', recordId: b.id, before: { status: b.status }, after: { status: 'CANCELLED', reason } } });
  });
  for (const p of [b.booker, ...b.attendees.map((a) => a.person).filter((x) => x && x.id !== b.bookerId)]) {
    await sendEmail({ to: p!.email, personId: p!.id, trigger: 'BOOKING_CANCELLED', subject: `Cancelled: ${b.course.title} (${b.reference})`, text: `Hello ${p!.firstName},\n\nBooking ${b.reference} for ${b.course.title} has been cancelled.${p!.id === b.bookerId && b.method === 'CARD' ? ' Your refund goes back to the card you paid with within 5 to 10 working days.' : ''}` });
  }
  back(ref, 'cancelled');
}
