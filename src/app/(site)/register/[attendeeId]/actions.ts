'use server';

import { inspectSubmission } from '@/lib/anomalies';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { loadForRegistration } from '@/lib/registration';
import { FILE_TYPES, MAX_FILE_BYTES, questionSet } from '@/lib/registration-sets';
import { storeFile, storeIdFile } from '@/lib/integrations/files';
import { sendEmail } from '@/lib/integrations/email';
import { sendEnrolmentPack, sendVenueReleased } from '@/lib/notifications';
import { currentPerson } from '@/lib/auth';
import { delegatesPath, enteringForOther } from '@/lib/delegates';
import { registrationLink } from '@/lib/registration-link';
import { effectiveFields } from '@/lib/delegate-fields';

export type RegState = { error?: string; fields?: Record<string, string>; values?: Record<string, string> };

const req = (label: string, max = 120) => z.string().trim().min(1, `Enter your ${label}`).max(max);

function parseDob(s: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const age = (Date.now() - d.getTime()) / (365.25 * 86400000);
  return d.getUTCDate() === +m[1] && age > 14 && age < 100 ? d : null;
}

export async function submitRegistration(_prev: RegState, form: FormData): Promise<RegState> {
  const attendeeId = String(form.get('attendeeId') ?? '');
  const token = String(form.get('t') ?? '') || undefined;
  const a = await loadForRegistration(attendeeId, token);
  if (!a || !a.person) return { error: 'This registration link is not valid. Use the link in your email, or log in.' };
  await inspectSubmission(form, 'Delegate registration', a.person.id);

  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string' && !k.startsWith('$') && k !== '_sig') values[k] = v;
  const get = (k: string) => String(values[k] ?? '').trim();
  const fields: Record<string, string> = {};
  const course = a.booking.course;
  const hadRegistration = !!(await db.registration.findUnique({ where: { attendeeId: a.id }, select: { id: true } }));
  const df = effectiveFields(course);
  const mode = df.fields;
  const set = questionSet(df, course.deliveryType, course.subject.approvalRequired, course.subject.name);

  for (const [k, schema] of [['firstName', req('first name', 80)], ['lastName', req('last name', 80)]] as const) {
    const r = schema.safeParse(get(k));
    if (!r.success) fields[k] = r.error.issues[0].message;
  }
  const byBooker = await enteringForOther(a);
  if (byBooker && form.get('authority') !== 'on') fields.authority = 'Tick the box to confirm you are authorised to give these details';
  if (mode.phone !== 'OFF' && (get('mobile') || mode.phone === 'REQUIRED') && !/^[0-9 +()-]{7,20}$/.test(get('mobile'))) fields.mobile = 'Enter a telephone number, like 07700 900123';
  if (mode.employer !== 'OFF' && !get('employer') && mode.employer === 'REQUIRED') fields.employer = 'Enter your employer';
  const dob = mode.dob === 'OFF' ? null : parseDob(get('dob'));
  if (mode.dob !== 'OFF' && !dob && (get('dob') || mode.dob === 'REQUIRED')) fields.dob = 'Enter your full date of birth: day, month and year';

  const answers: Record<string, string> = {};
  const files: [string, File][] = [];
  for (const q of set.questions) {
    if (q.kind === 'file') {
      const f = form.get(q.key);
      const existing = a.registration?.fileKeys.some((k) => k.includes(`/${q.key}/`));
      if (f instanceof File && f.size > 0) {
        if (!FILE_TYPES.includes(f.type)) fields[q.key] = 'Upload a JPEG, PNG or PDF';
        else if (f.size > MAX_FILE_BYTES) fields[q.key] = 'Upload a file of 10MB or less';
        else files.push([q.key, f]);
      } else if (!existing) fields[q.key] = `Upload your ${q.label.toLowerCase()}`;
      continue;
    }
    const v = get(q.key).slice(0, 1000);
    if (!q.optional && !v) fields[q.key] = `Enter your ${q.label.toLowerCase()}`;
    answers[q.key] = v;
  }
  if (Object.keys(fields).length) return { error: 'Check the highlighted fields.', fields, values };

  const fileKeys = [...(a.registration?.fileKeys ?? [])];
  for (const [key, f] of files) fileKeys.push(await storeIdFile(`registrations/${a.id}/${key}`, f));

  // The selfie also becomes the person's profile picture, kept until they remove it (the ID copies are not).
  let photoKey: string | null = null;
  const selfie = files.find(([k, f]) => k === 'photo' && /^image\/(jpeg|png|webp)$/.test(f.type));
  if (selfie) { try { photoKey = await storeFile('files', `profile/${a.person.id}`, selfie[1]); } catch { /* not a usable image: the registration itself still goes through */ } }

  const scheme = { ...((a.person.schemeIds as Record<string, string>) ?? {}) };
  for (const q of set.questions) if (q.kind === 'text' && q.scheme && answers[q.key]) scheme[q.scheme] = answers[q.key];
  const approval = course.subject.approvalRequired ? 'PENDING' : 'NOT_REQUIRED';
  const person = a.person;

  await db.$transaction(async (tx) => {
    const before = { firstName: person.firstName, lastName: person.lastName, mobile: person.mobile, employer: person.employer };
    await tx.person.update({
      where: { id: person.id },
      data: { firstName: get('firstName'), lastName: get('lastName'), ...(mode.phone !== 'OFF' ? { mobile: get('mobile') || null } : {}), ...(mode.employer !== 'OFF' ? { employer: get('employer') || null } : {}), ...(dob ? { dateOfBirth: dob } : {}), ...(answers.jobTitle ? { jobTitle: answers.jobTitle.slice(0, 120) } : {}), ...(answers.address ? { address: answers.address.slice(0, 500) } : {}), schemeIds: scheme as Prisma.InputJsonValue, ...(photoKey ? { photoKey, photoUpdatedAt: new Date() } : {}) },
    });
    await tx.registration.upsert({
      where: { attendeeId: a.id },
      update: { answers, fileKeys, approval, submittedAt: new Date(), enteredById: byBooker ? a.booking.bookerId : null, authorityAt: byBooker ? new Date() : null },
      create: { attendeeId: a.id, answers, fileKeys, approval, enteredById: byBooker ? a.booking.bookerId : null, authorityAt: byBooker ? new Date() : null },
    });
    await tx.attendee.update({ where: { id: a.id }, data: { status: 'REGISTERED' } });
    await tx.auditLog.create({ data: { actorId: byBooker ? ((await currentPerson())?.id ?? a.booking.bookerId) : person.id, action: byBooker ? 'REGISTRATION_ENTERED_FOR' : 'REGISTRATION_SUBMITTED', recordType: 'Attendee', recordId: a.id, before, after: { approval, files: files.length } } });
    if (approval === 'PENDING') {
      await tx.task.create({
        data: { type: 'REGISTRATION_APPROVAL', title: `Approve registration: ${get('firstName')} ${get('lastName')}`, detail: `${course.title}${a.booking.session ? `, ${a.booking.session.startsAt.toISOString().slice(0, 10)}` : ''}`, recordType: 'Attendee', recordId: a.id, dueAt: a.booking.session?.startsAt },
      });
    }
    if (course.deliveryType === 'ELEARNING') {
      const deadline = course.daysToComplete ? new Date(Date.now() + course.daysToComplete * 86400000) : null;
      await tx.enrolment.upsert({ where: { attendeeId: a.id }, update: {}, create: { attendeeId: a.id, provider: course.provider ?? 'Provider', deadline } });
      if (course.fulfilment !== 'EMAIL_PROVIDER') {
        const open = await tx.task.findFirst({ where: { type: 'ELEARNING_ENROLMENT', recordId: a.id, status: 'OPEN' } });
        if (!open) await tx.task.create({ data: { type: 'ELEARNING_ENROLMENT', title: `Enrol ${get('firstName')} ${get('lastName')} on ${course.provider ?? 'the provider platform'}`, detail: course.title, recordType: 'Attendee', recordId: a.id } });
      }
    }
  });

  if (course.deliveryType === 'ELEARNING' && course.fulfilment === 'EMAIL_PROVIDER' && course.providerEmail && !hadRegistration) await sendEnrolmentPack(a.id);
  // Address held back until registration, and no approval step: release it now.
  if (course.deliveryType === 'IN_PERSON' && course.venueRelease === 'AFTER_APPROVAL' && !course.subject.approvalRequired && !hadRegistration) await sendVenueReleased(a.id);
  if (byBooker) {
    // The delegate gets a copy to check, with a link to correct anything.
    await sendEmail({
      to: person.email, personId: person.id, trigger: 'REGISTRATION_ENTERED_FOR', subject: `Please check your details for ${course.title}`,
      blocks: [
        { type: 'heading', text: `Please check your details, ${get('firstName')}` },
        { type: 'text', text: `${a.booking.booker.firstName} ${a.booking.booker.lastName} has entered your registration details for ${course.title}. Please check them and correct anything that is wrong.` },
        { type: 'summary', rows: [['Name', `${get('firstName')} ${get('lastName')}`], ['Mobile', get('mobile')], ['Employer', get('employer')], ['Booking', a.booking.reference]] },
        { type: 'button', label: 'Check my details', href: registrationLink(a.id) },
      ],
    });
    redirect(delegatesPath(a.booking.reference));
  }
  redirect(`/register/${a.id}?done=1${token ? `&t=${encodeURIComponent(token)}` : ''}`);
}
