import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { findOrCreatePerson } from '@/lib/booking';
import { sendJoiningDetails, sendVenueReleased } from '@/lib/notifications';
import { sendEmail } from '@/lib/integrations/email';
import { registrationLink } from '@/lib/registration-link';
import { syncSessionMeeting } from '@/lib/integrations/teams';
import { ANSWER_KEY, FIELD_INFO, FIELD_KEYS, SCHEME_KEY, asksForFiles, effectiveFields, type FieldKey } from '@/lib/delegate-fields';

/** The delegate details page serves courses that need no uploaded files. eLearning and photo or ID courses keep the registration form. */
export const usesDelegateDetails = (course: { deliveryType: string; delegateFields: unknown; subject: { registrationSet: string } }) =>
  course.deliveryType !== 'ELEARNING' && !asksForFiles(effectiveFields(course));
export const skillguardOf = (schemeIds: unknown): string => String(((schemeIds ?? {}) as Record<string, unknown>).skillguard ?? '').trim();

export class DelegateError extends Error {
  constructor(message: string, public fields: Record<string, string> = {}) { super(message); }
}

/** Day, month and year from the form to a date; null unless it is real and the person is 14 to 100. */
export function dobFromParts(d: string, m: string, y: string): Date | null {
  const day = +d, month = +m, year = +y;
  if (!day || !month || !year) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  const age = (Date.now() - date.getTime()) / (365.25 * 86400000);
  return date.getUTCDate() === day && date.getUTCMonth() === month - 1 && age > 14 && age < 100 ? date : null;
}

export type DelegateInput = {
  attendeeId: string;
  mode: 'now' | 'link';
  firstName: string;
  lastName: string;
  email: string;
  dob?: { d: string; m: string; y: string };
  values?: Partial<Record<FieldKey, string>>; // phone, employer, jobTitle, address, skillguard, uln, eusrId, emergency, dietary, access
  invoiceRef?: string;
  authority: boolean;
};

/**
 * The booker gives one delegate's details on the booking's Delegate details page: either in full ("now", the fields the
 * course asks for) or just a name and email, after which the delegate is emailed a link to add the rest ("link").
 * Existing people are never overwritten: only blanks are filled, unless the details are the booker's own.
 */
export async function saveDelegate(actorId: string, bookingId: string, input: DelegateInput) {
  const a = await db.attendee.findUnique({
    where: { id: input.attendeeId },
    include: { person: true, registration: true, booking: { include: { booker: true, course: { include: { subject: true } }, session: true } } },
  });
  if (!a || a.bookingId !== bookingId || a.status === 'CANCELLED' || a.booking.status !== 'CONFIRMED') throw new DelegateError('We could not find that place on your booking.');
  if (a.booking.bookerId !== actorId) throw new DelegateError('Only the person who made the booking can enter these details.');
  const course = a.booking.course;
  if (!usesDelegateDetails(course)) throw new DelegateError('This course collects delegate details on its registration form instead.');
  const df = effectiveFields(course);
  const mode = df.fields;

  const email = input.email.trim().toLowerCase();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const v = (k: FieldKey) => (input.values?.[k] ?? '').trim();
  const invoiceRef = (input.invoiceRef ?? '').trim().slice(0, 50);
  const self = email === a.booking.booker.email.toLowerCase();
  const fields: Record<string, string> = {};
  if (!firstName || firstName.length > 80) fields.first = 'Enter their first name';
  if (!lastName || lastName.length > 80) fields.last = 'Enter their last name';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) fields.email = 'Enter a valid email address';
  const now = input.mode === 'now';
  if (now) {
    for (const k of FIELD_KEYS) {
      if (k === 'dob' || mode[k] === 'OFF') continue;
      const label = FIELD_INFO[k].label.toLowerCase();
      if (mode[k] === 'REQUIRED' && !v(k)) fields[k] = `Enter their ${label}`;
      if (k === 'phone' && v(k) && !/^[0-9 +()-]{7,20}$/.test(v(k))) fields.phone = 'Enter a telephone number, like 07700 900123';
      if (v(k).length > (k === 'address' || k === 'dietary' || k === 'access' ? 500 : 120)) fields[k] = 'That is too long';
    }
  }
  const dob = now && mode.dob !== 'OFF' ? dobFromParts(input.dob?.d ?? '', input.dob?.m ?? '', input.dob?.y ?? '') : null;
  if (now && mode.dob !== 'OFF' && !dob && (mode.dob === 'REQUIRED' || input.dob?.d || input.dob?.m || input.dob?.y)) fields.dob = 'Choose their full date of birth';
  if (!self && !input.authority) fields.authority = 'Tick the box to confirm you may give these details';
  if (Object.keys(fields).length) throw new DelegateError('Check the highlighted fields.', fields);

  const approval = course.subject.approvalRequired ? 'PENDING' : 'NOT_REQUIRED';
  const person = await db.$transaction(async (tx) => {
    const existing = await tx.person.findUnique({ where: { email } });
    if (existing && (await tx.attendee.count({ where: { bookingId, personId: existing.id, status: { not: 'CANCELLED' }, id: { not: a.id } } }))) {
      throw new DelegateError('That person is already on this booking.', { email: 'That person is already on this booking' });
    }
    const p = existing ?? (await findOrCreatePerson(tx, { email, firstName, lastName }));
    const mayOverwrite = !existing || self || existing.id === a.personId;
    const scheme = { ...((p.schemeIds as Record<string, string>) ?? {}) };
    const data: Prisma.PersonUpdateInput = {};
    if (mayOverwrite) { data.firstName = firstName; data.lastName = lastName; }
    const fill = (have: string | null | undefined, val: string) => !!val && (mayOverwrite || !have);
    if (now) {
      if (dob && (mayOverwrite || !p.dateOfBirth)) data.dateOfBirth = dob;
      if (mode.phone !== 'OFF' && fill(p.mobile, v('phone'))) data.mobile = v('phone');
      if (mode.employer !== 'OFF' && fill(p.employer, v('employer'))) data.employer = v('employer');
      if (mode.jobTitle !== 'OFF' && fill(p.jobTitle, v('jobTitle'))) data.jobTitle = v('jobTitle');
      if (mode.address !== 'OFF' && fill(p.address, v('address'))) data.address = v('address');
      for (const k of ['skillguard', 'uln', 'eusrId'] as const) if (mode[k] !== 'OFF' && fill(scheme[SCHEME_KEY[k]!], v(k))) scheme[SCHEME_KEY[k]!] = v(k);
      data.schemeIds = scheme as Prisma.InputJsonValue;
    }
    if (Object.keys(data).length) await tx.person.update({ where: { id: p.id }, data });

    const status = now ? 'REGISTERED' : a.status === 'REGISTERED' && a.personId === p.id ? 'REGISTERED' : 'INVITED';
    await tx.attendee.update({ where: { id: a.id }, data: { personId: p.id, status, invoiceRef: invoiceRef || null } });
    if (now) {
      const answers: Record<string, string> = {};
      for (const k of FIELD_KEYS) {
        if (mode[k] === 'OFF' || k === 'photo' || k === 'photoId') continue;
        if (SCHEME_KEY[k]) answers[k === 'uln' ? 'compexId' : k] = String(scheme[SCHEME_KEY[k]!] ?? '');
        else if (ANSWER_KEY[k]) answers[ANSWER_KEY[k]!] = v(k);
        else if (k === 'jobTitle' || k === 'address') answers[k] = v(k);
      }
      await tx.registration.upsert({ where: { attendeeId: a.id }, update: { answers, approval, submittedAt: new Date() }, create: { attendeeId: a.id, answers, approval } });
      if (approval === 'PENDING' && !(await tx.task.findFirst({ where: { type: 'REGISTRATION_APPROVAL', recordId: a.id, status: 'OPEN' } }))) {
        await tx.task.create({ data: { type: 'REGISTRATION_APPROVAL', title: `Approve registration: ${p.firstName} ${p.lastName}`, detail: `${course.title}${a.booking.session ? `, ${a.booking.session.startsAt.toISOString().slice(0, 10)}` : ''}`, recordType: 'Attendee', recordId: a.id } });
      }
    }
    await tx.auditLog.create({ data: { actorId, action: now ? 'DELEGATE_DETAILS_ENTERED' : 'DELEGATE_LINK_SENT', recordType: 'Attendee', recordId: a.id, before: { personId: a.personId }, after: { personId: p.id, invoiceRef: invoiceRef || null } } });
    await refreshLineRefs(tx, bookingId);
    return p;
  });

  const b = a.booking;
  if (now && course.deliveryType === 'IN_PERSON' && course.venueRelease === 'AFTER_APPROVAL' && !course.subject.approvalRequired && !a.registration) await sendVenueReleased(a.id);
  if (!now) await sendJoiningDetails(a.id);
  else if (!self) {
    await sendEmail({
      to: person.email, personId: person.id, trigger: 'DELEGATE_DETAILS_COPY', subject: `Please check your details for ${b.course.title}`,
      blocks: [
        { type: 'heading', text: `Your details, ${person.firstName}` },
        { type: 'text', text: `${b.booker.firstName} ${b.booker.lastName} has booked you on ${b.course.title} and entered these details so we can record your competencies after the course. Please check they are right.` },
        { type: 'summary', rows: [['Name', `${person.firstName} ${person.lastName}`], ['Email', person.email], ...(mode.skillguard !== 'OFF' ? [['SkillGuard number', skillguardOf(person.schemeIds) || 'Not given yet'] as [string, string]] : []), ['Reference', b.reference]] },
        { type: 'button', label: 'Check or correct my details', href: registrationLink(a.id) },
      ],
    });
  }
  if (b.sessionId) await syncSessionMeeting(b.sessionId);
  return { mode: input.mode, personId: person.id };
}

type Tx = Prisma.TransactionClient;
const REFS = ' Refs: ';

/**
 * Puts each delegate's invoice reference in the booking's statement line description (one line per booking, as before),
 * while the statement is still open. Only references that differ from the booking's own PO are listed.
 */
export async function refreshLineRefs(tx: Tx, bookingId: string) {
  const b = await tx.booking.findUnique({ where: { id: bookingId }, include: { attendees: { include: { person: true }, orderBy: { id: 'asc' } } } });
  if (!b || b.method !== 'ACCOUNT') return;
  const line = await tx.statementLine.findFirst({ where: { bookingId, statement: { status: 'OPEN' }, netPence: { gt: 0 }, NOT: { description: { startsWith: 'Cancellation charge' } } } });
  if (!line) return;
  const own = (b.poNumber ?? '').trim().toLowerCase();
  const refs = b.attendees
    .filter((x) => x.status !== 'CANCELLED' && x.invoiceRef && x.invoiceRef.trim().toLowerCase() !== own)
    .map((x) => `${x.person ? `${x.person.firstName} ${x.person.lastName}` : 'Delegate'} ${x.invoiceRef}`);
  const base = line.description.includes(REFS) ? line.description.split(REFS)[0].replace(/\.$/, '') : line.description;
  const description = (refs.length ? `${base}.${REFS}${refs.join('; ')}` : base).slice(0, 300);
  if (description !== line.description) await tx.statementLine.update({ where: { id: line.id }, data: { description } });
}
