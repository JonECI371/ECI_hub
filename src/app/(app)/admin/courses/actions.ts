'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { DeliveryType, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { audit, requireAdmin } from '@/lib/admin';
import { fmtSessionDates, fmtTime } from '@/lib/format';
import { sendEmail } from '@/lib/integrations/email';
import { offerFreedPlaces } from '@/lib/waitlist';

export type CourseFormState = { error?: string; fields?: Record<string, string>; values?: Record<string, string> };

const DELIVERY: DeliveryType[] = ['ELEARNING', 'VIRTUAL_CLASSROOM', 'IN_PERSON'];
const optInt = (v: string) => (v.trim() === '' ? null : Number(v));

export async function saveCourse(_prev: CourseFormState, form: FormData): Promise<CourseFormState> {
  const me = await requireAdmin('/admin/courses');
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string' && !k.startsWith('$')) values[k] = v.trim();
  const get = (k: string) => values[k] ?? '';
  const fields: Record<string, string> = {};
  const delivery = DELIVERY.includes(get('deliveryType') as DeliveryType) ? (get('deliveryType') as DeliveryType) : 'VIRTUAL_CLASSROOM';
  const status = ['DRAFT', 'PUBLISHED', 'WITHDRAWN'].includes(get('status')) ? get('status') : 'DRAFT';

  if (!get('title')) fields.title = 'Enter a course name';
  if (!get('shortDescription')) fields.shortDescription = 'Enter a short description';
  if (!get('durationText')) fields.durationText = 'Enter a duration';
  const price = Number(get('pricePounds') || '0');
  if (!Number.isFinite(price) || price < 0 || price > 100000) fields.pricePounds = 'Enter a price in pounds, like 185.00';
  const slug = get('slug').replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fields.slug = 'Use lower-case letters, numbers and hyphens';
  const places = optInt(get('placesPerSession'));
  if (delivery !== 'ELEARNING' && (!places || places < 1 || places > 500)) fields.placesPerSession = 'Enter the number of places per session';
  if (get('providerEmail') && !z.string().email().safeParse(get('providerEmail')).success) fields.providerEmail = 'Enter a valid email address';
  if (delivery === 'ELEARNING' && get('fulfilment') === 'EMAIL_PROVIDER' && !get('providerEmail')) fields.providerEmail = 'Enter the provider email to send packs to';
  const clash = await db.course.findFirst({ where: { slug, NOT: get('id') ? { id: get('id') } : undefined } });
  if (clash) fields.slug = 'Another course already uses this web address';
  if (Object.keys(fields).length) return { error: 'Check the highlighted fields.', fields, values };

  const data: Prisma.CourseUncheckedCreateInput = {
    title: get('title'), slug, subjectId: get('subjectId'), deliveryType: delivery, status: status as 'DRAFT' | 'PUBLISHED' | 'WITHDRAWN',
    shortDescription: get('shortDescription').slice(0, 160), description: get('description') || get('shortDescription'), durationText: get('durationText'),
    pricePence: Math.round(price * 100), vatRatePercent: optInt(get('vatRatePercent')) ?? 20,
    placesPerSession: delivery === 'ELEARNING' ? null : places,
    meetingPlatform: delivery === 'VIRTUAL_CLASSROOM' ? (get('meetingPlatform') === 'ZOOM' ? 'ZOOM' : 'TEAMS') : null,
    meetingHost: delivery === 'VIRTUAL_CLASSROOM' ? get('meetingHost') || null : null,
    defaultVenueId: delivery === 'IN_PERSON' ? get('defaultVenueId') || null : null,
    venueRelease: get('venueRelease') === 'AFTER_APPROVAL' ? 'AFTER_APPROVAL' : 'ON_CONFIRMATION',
    provider: delivery === 'ELEARNING' ? get('provider') || null : null,
    fulfilment: delivery === 'ELEARNING' ? (get('fulfilment') === 'EMAIL_PROVIDER' ? 'EMAIL_PROVIDER' : 'ADMIN_TASK') : null,
    providerEmail: get('providerEmail') || null, daysToComplete: delivery === 'ELEARNING' ? optInt(get('daysToComplete')) : null,
    validityYears: optInt(get('validityYears')), accreditation: get('accreditation') || null,
    seoTitle: get('seoTitle').slice(0, 60) || null, seoDescription: get('seoDescription').slice(0, 155) || null,
  };
  let id = get('id');
  if (id) {
    const before = await db.course.findUniqueOrThrow({ where: { id } });
    await db.course.update({ where: { id }, data });
    await audit(me.id, 'COURSE_UPDATED', 'Course', id, before, data);
  } else {
    id = (await db.course.create({ data })).id;
    await audit(me.id, 'COURSE_CREATED', 'Course', id, undefined, data);
  }
  revalidatePath('/', 'layout');
  redirect(`/admin/courses/${id}?msg=saved`);
}

export async function addSession(form: FormData) {
  const me = await requireAdmin('/admin/courses');
  const courseId = String(form.get('courseId'));
  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course) redirect('/admin/schedule');
  const date = String(form.get('date') ?? '');
  const start = String(form.get('start') ?? '');
  const end = String(form.get('end') ?? '');
  const days = Math.max(1, Math.min(10, Number(form.get('days') ?? 1)));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) redirect(`/admin/courses/${courseId}?msg=badsession`);
  const startsAt = ukToUtc(date, start);
  const endDate = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + days - 1)).toISOString().slice(0, 10);
  const endsAt = ukToUtc(endDate, end);
  if (endsAt <= startsAt || startsAt <= new Date()) redirect(`/admin/courses/${courseId}?msg=badsession`);
  const s = await db.session.create({
    data: {
      courseId, startsAt, endsAt, capacity: Number(form.get('capacity')) || course.placesPerSession || 12,
      status: form.get('publish') === 'on' ? 'PUBLISHED' : 'DRAFT', venueId: String(form.get('venueId') ?? '') || course.defaultVenueId, trainerId: String(form.get('trainerId') ?? '') || null,
    },
  });
  await audit(me.id, 'SESSION_CREATED', 'Session', s.id, undefined, { courseId, startsAt, endsAt, status: s.status });
  revalidatePath('/', 'layout');
  redirect(`/admin/courses/${courseId}?session=${s.id}&msg=sessionadded`);
}

/** Change a session's status, capacity or trainer. */
export async function updateSession(form: FormData) {
  const me = await requireAdmin('/admin/courses');
  const s = await db.session.findUniqueOrThrow({ where: { id: String(form.get('sessionId')) } });
  const op = String(form.get('op'));
  const data: Prisma.SessionUpdateInput = {};
  if (op === 'publish') data.status = 'PUBLISHED';
  if (op === 'unpublish') data.status = 'DRAFT';
  if (op === 'capacity') data.capacity = Math.max(1, Math.min(500, Number(form.get('capacity')) || s.capacity));
  if (op === 'trainer') data.trainer = form.get('trainerId') ? { connect: { id: String(form.get('trainerId')) } } : { disconnect: true };
  await db.session.update({ where: { id: s.id }, data });
  await audit(me.id, `SESSION_${op.toUpperCase()}`, 'Session', s.id, { status: s.status, capacity: s.capacity, trainerId: s.trainerId }, data);
  if (op === 'capacity' && Number(data.capacity) > s.capacity) await offerFreedPlaces(s.id);
  revalidatePath('/', 'layout');
  redirect(`/admin/courses/${s.courseId}?session=${s.id}&msg=updated`);
}

/** Cancel a session: every booking is cancelled, card payments refunded, everyone emailed. */
export async function cancelSession(form: FormData) {
  const me = await requireAdmin('/admin/courses');
  const s = await db.session.findUniqueOrThrow({ where: { id: String(form.get('sessionId')) }, include: { course: true, bookings: { where: { status: { in: ['CONFIRMED', 'PAYMENT_PENDING'] } }, include: { booker: true, payments: true, attendees: { include: { person: true } } } } } });
  if (form.get('confirm') !== s.course.title) redirect(`/admin/courses/${s.courseId}?session=${s.id}&msg=confirmname`);
  await db.$transaction(async (tx) => {
    await tx.session.update({ where: { id: s.id }, data: { status: 'CANCELLED' } });
    for (const b of s.bookings) {
      await tx.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED' } });
      await tx.attendee.updateMany({ where: { bookingId: b.id }, data: { status: 'CANCELLED' } });
      for (const p of b.payments) if (p.status === 'succeeded') await tx.payment.update({ where: { id: p.id }, data: { refundedPence: p.amountPence, status: process.env.PAYMENTS_MODE === 'stripe' ? 'refund_pending' : 'refunded_test' } });
    }
    await tx.waitlistEntry.deleteMany({ where: { sessionId: s.id } });
    await tx.auditLog.create({ data: { actorId: me.id, action: 'SESSION_CANCELLED', recordType: 'Session', recordId: s.id, before: { status: s.status }, after: { status: 'CANCELLED', bookings: s.bookings.length } } });
  });
  const when = `${fmtSessionDates(s.startsAt, s.endsAt)}, ${fmtTime(s.startsAt)}`;
  const people = new Map<string, { email: string; firstName: string; id: string }>();
  for (const b of s.bookings) {
    people.set(b.booker.id, b.booker);
    for (const a of b.attendees) if (a.person) people.set(a.person.id, a.person);
  }
  for (const p of people.values()) {
    await sendEmail({ to: p.email, personId: p.id, trigger: 'SESSION_CANCELLED', subject: `Cancelled: ${s.course.title}, ${when}`, text: `Hello ${p.firstName},\n\nWe are sorry: ${s.course.title} on ${when} has been cancelled. Bookers are refunded in full. We will be in touch about other dates.` });
  }
  revalidatePath('/', 'layout');
  redirect(`/admin/courses/${s.courseId}?msg=cancelled`);
}

/** "2026-11-24" + "09:00" in UK time to a UTC Date (handles GMT and BST). */
function ukToUtc(date: string, time: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const ukHour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/London' }).format(guess));
  const offset = (ukHour - guess.getUTCHours() + 24) % 24; // 0 in winter, 1 in summer
  return new Date(guess.getTime() - offset * 3600000);
}
