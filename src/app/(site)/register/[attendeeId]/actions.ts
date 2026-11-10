'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { loadForRegistration } from '@/lib/registration';
import { FILE_TYPES, MAX_FILE_BYTES, questionSet } from '@/lib/registration-sets';
import { storeIdFile } from '@/lib/integrations/files';
import { sendEmail } from '@/lib/integrations/email';
import { sendVenueReleased } from '@/lib/notifications';

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

  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string' && !k.startsWith('$')) values[k] = v;
  const get = (k: string) => String(values[k] ?? '').trim();
  const fields: Record<string, string> = {};
  const course = a.booking.course;
  const hadRegistration = !!(await db.registration.findUnique({ where: { attendeeId: a.id }, select: { id: true } }));
  const set = questionSet(course.subject.registrationSet, course.deliveryType, course.subject.approvalRequired, course.subject.name);

  for (const [k, schema] of [
    ['firstName', req('first name', 80)],
    ['lastName', req('last name', 80)],
    ['mobile', z.string().trim().regex(/^[0-9 +()-]{7,20}$/, 'Enter a mobile number, like 07700 900123')],
    ['employer', req('employer')],
  ] as const) {
    const r = schema.safeParse(get(k));
    if (!r.success) fields[k] = r.error.issues[0].message;
  }
  const dob = parseDob(get('dob'));
  if (!dob) fields.dob = 'Enter your date of birth as DD/MM/YYYY';

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

  const scheme = { ...((a.person.schemeIds as Record<string, string>) ?? {}) };
  for (const q of set.questions) if (q.kind === 'text' && q.scheme && answers[q.key]) scheme[q.scheme] = answers[q.key];
  const approval = course.subject.approvalRequired ? 'PENDING' : 'NOT_REQUIRED';
  const person = a.person;

  await db.$transaction(async (tx) => {
    const before = { firstName: person.firstName, lastName: person.lastName, mobile: person.mobile, employer: person.employer };
    await tx.person.update({
      where: { id: person.id },
      data: { firstName: get('firstName'), lastName: get('lastName'), mobile: get('mobile'), employer: get('employer'), dateOfBirth: dob, schemeIds: scheme as Prisma.InputJsonValue },
    });
    await tx.registration.upsert({
      where: { attendeeId: a.id },
      update: { answers, fileKeys, approval, submittedAt: new Date() },
      create: { attendeeId: a.id, answers, fileKeys, approval },
    });
    await tx.attendee.update({ where: { id: a.id }, data: { status: 'REGISTERED' } });
    await tx.auditLog.create({ data: { actorId: person.id, action: 'REGISTRATION_SUBMITTED', recordType: 'Attendee', recordId: a.id, before, after: { approval, files: files.length } } });
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

  if (course.deliveryType === 'ELEARNING' && course.fulfilment === 'EMAIL_PROVIDER' && course.providerEmail) {
    await sendEmail({
      to: course.providerEmail,
      trigger: 'ENROLMENT_PACK',
      subject: `Enrolment: ${get('firstName')} ${get('lastName')}, ${course.title}`,
      text: `Please enrol:\nName: ${get('firstName')} ${get('lastName')}\nEmail: ${person.email}\nDate of birth: ${get('dob')}\nEmployer: ${get('employer')}\nCourse: ${course.title}`,
    });
  }
  // Address held back until registration, and no approval step: release it now.
  if (course.deliveryType === 'IN_PERSON' && course.venueRelease === 'AFTER_APPROVAL' && !course.subject.approvalRequired && !hadRegistration) await sendVenueReleased(a.id);
  redirect(`/register/${a.id}?done=1${token ? `&t=${encodeURIComponent(token)}` : ''}`);
}
