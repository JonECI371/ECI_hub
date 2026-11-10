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
import { cancelSessionMeeting, syncSessionMeeting } from '@/lib/integrations/teams';
import { refundBooking, stripeEnabled } from '@/lib/integrations/payments';
import { assertAssignable } from '@/lib/trainers';
import { sendVenueChanged } from '@/lib/notifications';
import { storeFile } from '@/lib/integrations/files';
import { sessionPublishBlock } from '@/lib/publish-rules';

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
  const photo = form.get('photo');
  const hasPhoto = photo instanceof File && photo.size > 0;
  if (hasPhoto && (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 5 * 1024 * 1024)) fields.photo = 'Upload a JPEG, PNG or WebP photo of 5MB or less';
  if ((hasPhoto || (get('currentPhoto') && get('removePhoto') !== 'on')) && !get('photoAlt')) fields.photoAlt = 'Describe the photo for people using screen readers';
  if (status === 'PUBLISHED') {
    if (!get('description')) fields.description = 'Add a description before publishing';
    if (delivery === 'ELEARNING' && !get('provider')) fields.provider = 'Name the provider before publishing';
  }
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
    photoAlt: get('photoAlt').slice(0, 200) || null,
    ...(get('removePhoto') === 'on' ? { photoUrl: null, photoAlt: null } : {}),
  };
  if (hasPhoto) {
    const key = await storeFile('files', `courses/${slug.replace(/[^A-Za-z0-9_-]/g, '')}`, photo as File);
    data.photoUrl = `/media/${key.slice(key.indexOf(':') + 1)}`;
  }
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
  try { await assertAssignable(String(form.get('trainerId') ?? '') || null); } catch { redirect(`/admin/courses/${courseId}?msg=trainerblocked`); }
  const venueId = String(form.get('venueId') ?? '') || course.defaultVenueId;
  const block = form.get('publish') === 'on' ? sessionPublishBlock(course, { startsAt, venueId }) : null;
  const s = await db.session.create({
    data: {
      courseId, startsAt, endsAt, capacity: Number(form.get('capacity')) || course.placesPerSession || 12,
      status: form.get('publish') === 'on' && !block ? 'PUBLISHED' : 'DRAFT', venueId, trainerId: String(form.get('trainerId') ?? '') || null,
    },
  });
  await audit(me.id, 'SESSION_CREATED', 'Session', s.id, undefined, { courseId, startsAt, endsAt, status: s.status });
  await syncSessionMeeting(s.id);
  revalidatePath('/', 'layout');
  redirect(`/admin/courses/${courseId}?session=${s.id}&msg=${block ?? 'sessionadded'}`);
}

/** Change a session's status, capacity or trainer. */
export async function updateSession(form: FormData) {
  const me = await requireAdmin('/admin/courses');
  const s = await db.session.findUniqueOrThrow({ where: { id: String(form.get('sessionId')) } });
  const op = String(form.get('op'));
  if (op === 'trainer') {
    try { await assertAssignable(String(form.get('trainerId') ?? '') || null); } catch { redirect(`/admin/courses/${s.courseId}?session=${s.id}&msg=trainerblocked`); }
  }
  if (op === 'publish') {
    const block = sessionPublishBlock(await db.course.findUniqueOrThrow({ where: { id: s.courseId } }), s);
    if (block) redirect(`/admin/courses/${s.courseId}?session=${s.id}&msg=${block}`);
  }
  const data: Prisma.SessionUpdateInput = {};
  if (op === 'publish') data.status = 'PUBLISHED';
  if (op === 'unpublish') data.status = 'DRAFT';
  if (op === 'capacity') data.capacity = Math.max(1, Math.min(500, Number(form.get('capacity')) || s.capacity));
  if (op === 'trainer') data.trainer = form.get('trainerId') ? { connect: { id: String(form.get('trainerId')) } } : { disconnect: true };
  if (op === 'venue') data.venue = form.get('venueId') ? { connect: { id: String(form.get('venueId')) } } : { disconnect: true };
  await db.session.update({ where: { id: s.id }, data });
  await audit(me.id, `SESSION_${op.toUpperCase()}`, 'Session', s.id, { status: s.status, capacity: s.capacity, trainerId: s.trainerId }, data);
  if (op === 'capacity' && Number(data.capacity) > s.capacity) await offerFreedPlaces(s.id);
  if (op === 'publish' || op === 'trainer' || op === 'teams') await syncSessionMeeting(s.id);
  if (op === 'venue' && (form.get('venueId') || null) !== s.venueId) await sendVenueChanged(s.id);
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
      if (!stripeEnabled()) for (const p of b.payments) if (p.status === 'succeeded') await tx.payment.update({ where: { id: p.id }, data: { refundedPence: p.amountPence, status: 'refunded_test' } });
    }
    await tx.waitlistEntry.deleteMany({ where: { sessionId: s.id } });
    await tx.auditLog.create({ data: { actorId: me.id, action: 'SESSION_CANCELLED', recordType: 'Session', recordId: s.id, before: { status: s.status }, after: { status: 'CANCELLED', bookings: s.bookings.length } } });
  });
  if (stripeEnabled()) for (const b of s.bookings) await refundBooking(b.id);
  await cancelSessionMeeting(s.id);
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

/** eLearning: record that a learner finished on the provider platform, and raise the certificate task. */
export async function markCompleted(form: FormData) {
  const me = await requireAdmin('/admin/courses');
  const a = await db.attendee.findUniqueOrThrow({ where: { id: String(form.get('attendeeId')) }, include: { person: true, enrolment: true, booking: { include: { course: true } } } });
  if (!a.enrolment?.enrolledAt || a.enrolment.completedAt) redirect(`/admin/courses/${a.booking.courseId}?msg=notenrolled`);
  await db.$transaction(async (tx) => {
    await tx.enrolment.update({ where: { attendeeId: a.id }, data: { completedAt: new Date() } });
    await tx.attendee.update({ where: { id: a.id }, data: { status: 'ATTENDED' } });
    await tx.task.create({ data: { type: 'CERTIFICATE_UPLOAD', title: `Upload certificate: ${a.person?.firstName ?? ''} ${a.person?.lastName ?? ''}`.trim(), detail: `${a.booking.course.title} (eLearning), completed ${new Date().toLocaleDateString('en-GB', { timeZone: 'Europe/London' })}`, recordType: 'Attendee', recordId: a.id } });
    await tx.auditLog.create({ data: { actorId: me.id, action: 'ELEARNING_COMPLETED', recordType: 'Attendee', recordId: a.id } });
  });
  revalidatePath('/admin', 'layout');
  redirect(`/admin/courses/${a.booking.courseId}?msg=completed`);
}
