'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { audit, requireAdmin } from '@/lib/admin';
import { SITE_URL, fmtSessionDates, fmtTime } from '@/lib/format';
import { placesTakenWhere } from '@/lib/sessions';
import { registrationLink } from '@/lib/registration-link';
import { sendEmail } from '@/lib/integrations/email';
import { syncSessionMeeting } from '@/lib/integrations/teams';
import { offerFreedPlaces, placesOnOffer } from '@/lib/waitlist';

async function openTask(form: FormData) {
  const me = await requireAdmin();
  const t = await db.task.findUnique({ where: { id: String(form.get('taskId')) } });
  if (!t || t.status !== 'OPEN') redirect('/admin/tasks?msg=gone');
  return { me, t };
}
async function done(taskId: string, actorId: string, note: string) {
  await db.task.update({ where: { id: taskId }, data: { status: 'DONE', doneAt: new Date(), assigneeId: actorId } });
  await audit(actorId, 'TASK_DONE', 'Task', taskId, undefined, { note });
  revalidatePath('/admin', 'layout');
}
const back = (form: FormData, msg: string): never => redirect(`/admin/tasks?${form.get('filter') ? `type=${form.get('filter')}&` : ''}msg=${msg}`);

/** Generic "mark done" for tasks with nothing else to change here. */
export async function markDone(form: FormData) {
  const { me, t } = await openTask(form);
  await done(t.id, me.id, 'Marked done');
  back(form, 'done');
}

export async function markEnrolled(form: FormData) {
  const { me, t } = await openTask(form);
  const a = await db.attendee.findUniqueOrThrow({ where: { id: t.recordId }, include: { person: true, enrolment: true, booking: { include: { course: true } } } });
  const enr = await db.enrolment.upsert({
    where: { attendeeId: a.id },
    update: { enrolledAt: new Date() },
    create: { attendeeId: a.id, provider: a.booking.course.provider ?? 'Provider', enrolledAt: new Date(), deadline: a.booking.course.daysToComplete ? new Date(Date.now() + a.booking.course.daysToComplete * 86400000) : null },
  });
  await audit(me.id, 'ENROLLED', 'Attendee', a.id, { enrolledAt: a.enrolment?.enrolledAt ?? null }, { enrolledAt: enr.enrolledAt });
  if (a.person) {
    await sendEmail({
      to: a.person.email, personId: a.person.id, trigger: 'ELEARNING_ENROLLED',
      subject: `You're enrolled: ${a.booking.course.title}`,
      text: `Hello ${a.person.firstName},\n\nYou are enrolled on ${a.booking.course.title}. Your login comes from ${enr.provider} by email.${enr.deadline ? ` Please finish by ${enr.deadline.toLocaleDateString('en-GB', { timeZone: 'Europe/London' })}.` : ''}`,
    });
  }
  await done(t.id, me.id, 'Enrolled');
  back(form, 'enrolled');
}

export async function decideRegistration(form: FormData) {
  const { me, t } = await openTask(form);
  const approve = form.get('decision') === 'approve';
  const note = String(form.get('note') ?? '').slice(0, 500);
  if (!approve && !note) back(form, 'note');
  const a = await db.attendee.findUniqueOrThrow({ where: { id: t.recordId }, include: { person: true, registration: true, booking: { include: { course: true, session: { include: { venue: true } } } } } });
  if (!a.registration || !a.person) back(form, 'gone');
  await db.registration.update({ where: { id: a.registration!.id }, data: { approval: approve ? 'APPROVED' : 'RETURNED' } });
  await db.attendee.update({ where: { id: a.id }, data: { status: approve ? 'APPROVED' : 'INVITED' } });
  await audit(me.id, approve ? 'REGISTRATION_APPROVED' : 'REGISTRATION_RETURNED', 'Attendee', a.id, { approval: a.registration!.approval }, { approval: approve ? 'APPROVED' : 'RETURNED', note });
  const s = a.booking.session;
  const v = s?.venue;
  await sendEmail({
    to: a.person!.email, personId: a.person!.id, trigger: approve ? 'REGISTRATION_APPROVED' : 'REGISTRATION_RETURNED',
    subject: approve ? `Registration approved: ${a.booking.course.title}` : `Please update your registration: ${a.booking.course.title}`,
    text: approve
      ? `Hello ${a.person!.firstName},\n\nYour registration for ${a.booking.course.title} is approved.${s ? `\n\n${fmtSessionDates(s.startsAt, s.endsAt)}, ${fmtTime(s.startsAt)} UK time` : ''}${v ? `\nVenue: ${v.name}, ${v.address}, ${v.postcode}${v.directions ? `\n${v.directions}` : ''}` : ''}`
      : `Hello ${a.person!.firstName},\n\nWe need a change to your registration for ${a.booking.course.title}:\n\n${note}\n\nUpdate it here: ${SITE_URL}${registrationLink(a.id)}`,
  });
  await done(t.id, me.id, approve ? 'Approved' : `Returned: ${note}`);
  back(form, approve ? 'approved' : 'returned');
}

export async function decideDateChange(form: FormData) {
  const { me, t } = await openTask(form);
  const approve = form.get('decision') === 'approve';
  const b = await db.booking.findUniqueOrThrow({ where: { id: t.recordId }, include: { booker: true, course: true } });
  const target = String(form.get('sessionId') ?? '');
  if (approve) {
    const ok = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${target}))`;
      const s = await tx.session.findUnique({ where: { id: target } });
      if (!s || s.courseId !== b.courseId || s.startsAt <= new Date()) return null;
      const taken = await tx.booking.aggregate({ where: { sessionId: s.id, ...placesTakenWhere() }, _sum: { places: true } });
      if (s.capacity - (taken._sum.places ?? 0) - (await placesOnOffer(tx, s.id)) < b.places) return null;
      await tx.booking.update({ where: { id: b.id }, data: { sessionId: s.id } });
      return s;
    });
    if (!ok) back(form, 'nodate');
    if (b.sessionId) { await offerFreedPlaces(b.sessionId); await syncSessionMeeting(b.sessionId); }
    await syncSessionMeeting(ok!.id);
    await audit(me.id, 'DATE_CHANGED', 'Booking', b.id, { sessionId: b.sessionId }, { sessionId: ok!.id });
    await sendEmail({ to: b.booker.email, personId: b.bookerId, trigger: 'DATE_CHANGED', subject: `Date change confirmed: ${b.course.title}`, text: `Hello ${b.booker.firstName},\n\nYour booking ${b.reference} has moved to ${fmtSessionDates(ok!.startsAt, ok!.endsAt)}, ${fmtTime(ok!.startsAt)} UK time.` });
  } else {
    await sendEmail({ to: b.booker.email, personId: b.bookerId, trigger: 'DATE_CHANGE_DECLINED', subject: `Date change request: ${b.course.title}`, text: `Hello ${b.booker.firstName},\n\nWe could not move booking ${b.reference}. ${String(form.get('note') ?? '').slice(0, 500) || 'Please call us on +44 (0) 1932 963463 to talk through other options.'}` });
  }
  await done(t.id, me.id, approve ? 'Date changed' : 'Declined');
  back(form, approve ? 'moved' : 'declined');
}

/** Approve or decline a credit account application. Limits above the default need a Super Admin. */
export async function decideAccount(form: FormData) {
  const { me, t } = await openTask(form);
  const { AccountRuleError, PO_RULES, approveAccount, declineAccount } = await import('@/lib/accounts');
  try {
    if (form.get('decision') === 'approve') {
      const pounds = Number(String(form.get('limit') ?? '').replace(/[£,\s]/g, ''));
      const poRule = String(form.get('poRule') ?? 'NONE');
      if (!Number.isFinite(pounds) || pounds <= 0 || !(poRule in PO_RULES)) back(form, 'badlimit');
      await approveAccount(t.recordId, me, { creditLimitPence: Math.round(pounds * 100), paymentTermsDays: Number(form.get('terms') ?? 30) || 30, poRule: poRule as keyof typeof PO_RULES });
      revalidatePath('/admin', 'layout');
      back(form, 'accountapproved');
    }
    const reason = String(form.get('reason') ?? '').trim().slice(0, 300);
    if (!reason) back(form, 'reason');
    await declineAccount(t.recordId, me.id, reason);
    revalidatePath('/admin', 'layout');
    back(form, 'accountdeclined');
  } catch (err) {
    if (err instanceof AccountRuleError) redirect(`/admin/tasks?msg=rule&detail=${encodeURIComponent(err.message)}`);
    throw err;
  }
}

/** Approve or decline a booker the main booker invited. */
export async function decideBookerTask(form: FormData) {
  const { me, t } = await openTask(form);
  const { AccountRuleError, decideBooker } = await import('@/lib/accounts');
  const approve = form.get('decision') === 'approve';
  try {
    await decideBooker(t.recordId, me.id, approve);
  } catch (err) {
    if (err instanceof AccountRuleError) redirect(`/admin/tasks?msg=rule&detail=${encodeURIComponent(err.message)}`);
    throw err;
  }
  revalidatePath('/admin', 'layout');
  back(form, approve ? 'bookerapproved' : 'bookerdeclined');
}
