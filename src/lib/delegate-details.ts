import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { findOrCreatePerson } from '@/lib/booking';
import { sendJoiningDetails } from '@/lib/notifications';
import { sendEmail } from '@/lib/integrations/email';
import { registrationLink } from '@/lib/registration-link';
import { syncSessionMeeting } from '@/lib/integrations/teams';

/** Registration sets that use the delegate details page. Others (photo and ID uploads) keep the registration form. */
export const DELEGATE_DETAILS_SETS = ['thames-water'];
/** Courses whose certificate cannot be issued until the delegate's SkillGuard number is on record. */
export const SKILLGUARD_SETS = ['thames-water'];

export const usesDelegateDetails = (registrationSet: string | null | undefined) => DELEGATE_DETAILS_SETS.includes(registrationSet ?? '');
export const needsSkillguard = (registrationSet: string | null | undefined) => SKILLGUARD_SETS.includes(registrationSet ?? '');
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
  mobile?: string;
  skillguard?: string;
  invoiceRef?: string;
  authority: boolean;
};

/**
 * The booker gives one delegate's details on the booking's Delegate details page: either in full ("now") or just a name
 * and email, after which the delegate is emailed a link to add the rest ("link"). Existing people are never
 * overwritten: only blanks are filled, unless the details are the booker's own.
 */
export async function saveDelegate(actorId: string, bookingId: string, input: DelegateInput) {
  const a = await db.attendee.findUnique({
    where: { id: input.attendeeId },
    include: { person: true, registration: true, booking: { include: { booker: true, course: { include: { subject: true } } } } },
  });
  if (!a || a.bookingId !== bookingId || a.status === 'CANCELLED' || a.booking.status !== 'CONFIRMED') throw new DelegateError('We could not find that place on your booking.');
  if (a.booking.bookerId !== actorId) throw new DelegateError('Only the person who made the booking can enter these details.');
  if (!usesDelegateDetails(a.booking.course.subject.registrationSet) || a.booking.course.subject.approvalRequired) throw new DelegateError('This course collects delegate details on its registration form instead.');

  const email = input.email.trim().toLowerCase();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const mobile = (input.mobile ?? '').trim();
  const skillguard = (input.skillguard ?? '').trim();
  const invoiceRef = (input.invoiceRef ?? '').trim().slice(0, 50);
  const self = email === a.booking.booker.email.toLowerCase();
  const fields: Record<string, string> = {};
  if (!firstName || firstName.length > 80) fields.first = 'Enter their first name';
  if (!lastName || lastName.length > 80) fields.last = 'Enter their last name';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) fields.email = 'Enter a valid email address';
  if (mobile && !/^[0-9 +()-]{7,20}$/.test(mobile)) fields.phone = 'Enter a telephone number, like 07700 900123';
  if (skillguard.length > 40) fields.skillguard = 'That SkillGuard number is too long';
  const dob = input.mode === 'now' ? dobFromParts(input.dob?.d ?? '', input.dob?.m ?? '', input.dob?.y ?? '') : null;
  if (input.mode === 'now' && !dob) fields.dob = 'Choose their full date of birth';
  if (!self && !input.authority) fields.authority = 'Tick the box to confirm you may give these details';
  if (Object.keys(fields).length) throw new DelegateError('Check the highlighted fields.', fields);

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
    if (dob && (mayOverwrite || !p.dateOfBirth)) data.dateOfBirth = dob;
    if (mobile && (mayOverwrite || !p.mobile)) data.mobile = mobile;
    if (skillguard && (mayOverwrite || !scheme.skillguard)) { scheme.skillguard = skillguard; data.schemeIds = scheme as Prisma.InputJsonValue; }
    if (Object.keys(data).length) await tx.person.update({ where: { id: p.id }, data });

    const status = input.mode === 'now' ? 'REGISTERED' : a.status === 'REGISTERED' && a.personId === p.id ? 'REGISTERED' : 'INVITED';
    await tx.attendee.update({ where: { id: a.id }, data: { personId: p.id, status, invoiceRef: invoiceRef || null } });
    if (input.mode === 'now') {
      const sg = skillguard || skillguardOf(scheme);
      await tx.registration.upsert({ where: { attendeeId: a.id }, update: { answers: { skillguard: sg }, submittedAt: new Date() }, create: { attendeeId: a.id, answers: { skillguard: sg }, approval: 'NOT_REQUIRED' } });
    }
    await tx.auditLog.create({ data: { actorId, action: input.mode === 'now' ? 'DELEGATE_DETAILS_ENTERED' : 'DELEGATE_LINK_SENT', recordType: 'Attendee', recordId: a.id, before: { personId: a.personId }, after: { personId: p.id, invoiceRef: invoiceRef || null, skillguard: !!(skillguard || skillguardOf(scheme)) } } });
    await refreshLineRefs(tx, bookingId);
    return p;
  });

  const b = a.booking;
  if (input.mode === 'link') await sendJoiningDetails(a.id);
  else if (!self) {
    await sendEmail({
      to: person.email, personId: person.id, trigger: 'DELEGATE_DETAILS_COPY', subject: `Please check your details for ${b.course.title}`,
      blocks: [
        { type: 'heading', text: `Your details, ${person.firstName}` },
        { type: 'text', text: `${b.booker.firstName} ${b.booker.lastName} has booked you on ${b.course.title} and entered these details so we can record your competencies after the course. Please check they are right.` },
        { type: 'summary', rows: [['Name', `${person.firstName} ${person.lastName}`], ['Email', person.email], ['SkillGuard number', skillguardOf(person.schemeIds) || 'Not given yet'], ['Reference', b.reference]] },
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
