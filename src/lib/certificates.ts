import 'server-only';
import { db } from '@/lib/db';
import { SITE_URL, fmtSessionDates } from '@/lib/format';
import { sendEmail } from '@/lib/integrations/email';
import { storeFile } from '@/lib/integrations/files';

export class CertificateError extends Error {}

const longDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });

/** Expiry from the course's validity, counted from the issue date. */
export function expiryFor(issuedAt: Date, validityYears: number | null): Date | null {
  if (!validityYears) return null;
  const e = new Date(issuedAt);
  e.setUTCFullYear(e.getUTCFullYear() + validityYears);
  return e;
}

/**
 * Issue a certificate to an attendee who attended (or completed eLearning): store the file, record it with its
 * expiry, mark the attendee certified, tell them and their booker, and close the task once everyone is done.
 */
export async function issueCertificate(attendeeId: string, actorId: string, file: File, issuedAt: Date) {
  const a = await db.attendee.findUniqueOrThrow({ where: { id: attendeeId }, include: { person: true, booking: { include: { booker: true, course: true, session: true } } } });
  if (!a.person) throw new CertificateError('This place has no attendee name yet.');
  if (a.status !== 'ATTENDED' && a.status !== 'CERTIFIED') throw new CertificateError('Certificates can only be issued to people marked as attended.');
  const c = a.booking.course;
  const fileKey = await storeFile('files', `certificates/${a.person.id}`, file);
  const cert = await db.$transaction(async (tx) => {
    const cert = await tx.certificate.create({ data: { personId: a.person!.id, courseId: c.id, issuedAt, expiresAt: expiryFor(issuedAt, c.validityYears), fileKey } });
    await tx.attendee.update({ where: { id: a.id }, data: { status: 'CERTIFIED' } });
    await tx.auditLog.create({ data: { actorId, action: 'CERTIFICATE_ISSUED', recordType: 'Attendee', recordId: a.id, after: { certificateId: cert.id, expiresAt: cert.expiresAt } } });
    // Close the session's (or attendee's) task once nobody who attended is still waiting.
    const recordId = a.booking.sessionId ?? a.id;
    const waiting = a.booking.sessionId
      ? await tx.attendee.count({ where: { status: 'ATTENDED', booking: { sessionId: a.booking.sessionId, status: { in: ['CONFIRMED', 'COMPLETED'] } } } })
      : 0;
    if (!waiting) await tx.task.updateMany({ where: { type: 'CERTIFICATE_UPLOAD', recordId, status: 'OPEN' }, data: { status: 'DONE', doneAt: new Date(), assigneeId: actorId } });
    return cert;
  });

  const rows: [string, string][] = [['Course', c.title], ['Issued', longDate(issuedAt)], ['Valid until', cert.expiresAt ? longDate(cert.expiresAt) : 'Does not expire']];
  await sendEmail({
    to: a.person.email, personId: a.person.id, trigger: 'CERTIFICATE_ISSUED', subject: `Your certificate: ${c.title}`,
    blocks: [
      { type: 'heading', text: `Well done, ${a.person.firstName}` },
      { type: 'text', text: `Your certificate for ${c.title} is ready to download from your account.` },
      { type: 'summary', rows },
      { type: 'button', label: 'Download my certificate', href: `${SITE_URL}/account/certificates` },
    ],
  });
  const b = a.booking.booker;
  if (b.id !== a.person.id) {
    await sendEmail({
      to: b.email, personId: b.id, trigger: 'TEAM_CERTIFICATE_ISSUED', subject: `Certificate issued: ${a.person.firstName} ${a.person.lastName}, ${c.title}`,
      blocks: [
        { type: 'heading', text: 'Team certificate available' },
        { type: 'text', text: `${a.person.firstName} ${a.person.lastName} has been certified on ${c.title}.` },
        { type: 'summary', rows: [['Delegate', `${a.person.firstName} ${a.person.lastName}`], ...rows, ['Booking', a.booking.reference]] },
        { type: 'button', label: 'See your team', href: `${SITE_URL}/account/team` },
      ],
    });
  }
  return cert;
}

/** Who may download a certificate: its owner, or a booker who manages a booking that person attended for that course. */
export async function canSeeCertificate(personId: string, cert: { personId: string; courseId: string }): Promise<boolean> {
  if (cert.personId === personId) return true;
  const accountIds = (await db.accountMember.findMany({ where: { personId, status: 'ACTIVE' }, select: { accountId: true } })).map((m) => m.accountId);
  return !!(await db.attendee.findFirst({ where: { personId: cert.personId, booking: { courseId: cert.courseId, OR: [{ bookerId: personId }, { accountId: { in: accountIds } }] } } }));
}

/**
 * Three months before a certificate expires: remind the holder (with the next dates) and the booker who booked
 * that course for them. Once per certificate, and only if they haven't already re-booked.
 */
export async function sendExpiryReminders(now = new Date()) {
  const certs = await db.certificate.findMany({
    where: { expiresAt: { gt: now, lte: new Date(now.getTime() + 92 * 86400000) } },
    include: { person: true, course: true },
  });
  let sent = 0;
  for (const cert of certs) {
    const trigger = `EXPIRY_REMINDER:${cert.id}`;
    if (await db.emailLog.findFirst({ where: { trigger } })) continue;
    // Already re-booked on the same course for a future date? Then no reminder is needed.
    const rebooked = await db.attendee.findFirst({ where: { personId: cert.personId, status: { not: 'CANCELLED' }, booking: { courseId: cert.courseId, status: 'CONFIRMED', OR: [{ session: { startsAt: { gt: now } } }, { sessionId: null, createdAt: { gt: cert.issuedAt } }] } } });
    if (rebooked) continue;
    const dates = await db.session.findMany({ where: { courseId: cert.courseId, status: 'PUBLISHED', startsAt: { gt: now } }, orderBy: { startsAt: 'asc' }, take: 3 });
    const next: [string, string][] = dates.length ? dates.map((s, i) => [i === 0 ? 'Next dates' : '', fmtSessionDates(s.startsAt, s.endsAt)]) : [['Next dates', 'New dates coming soon']];
    const rows: [string, string][] = [['Certificate', cert.course.title], ['Expires', longDate(cert.expiresAt!)], ...next];
    await sendEmail({
      to: cert.person.email, personId: cert.personId, trigger, subject: `Your ${cert.course.title} certificate expires on ${longDate(cert.expiresAt!)}`,
      blocks: [
        { type: 'heading', text: `Time to renew, ${cert.person.firstName}` },
        { type: 'text', text: `Your ${cert.course.title} certificate expires in about three months. Book a refresher now to stay covered.` },
        { type: 'summary', rows },
        { type: 'button', label: 'Book renewal', href: `${SITE_URL}/courses/${cert.course.slug}#dates` },
      ],
    });
    const last = await db.attendee.findFirst({ where: { personId: cert.personId, booking: { courseId: cert.courseId } }, include: { booking: { include: { booker: true } } }, orderBy: { booking: { createdAt: 'desc' } } });
    const booker = last?.booking.booker;
    if (booker && booker.id !== cert.personId) {
      await sendEmail({
        to: booker.email, personId: booker.id, trigger, subject: `Renewal due: ${cert.person.firstName} ${cert.person.lastName}, ${cert.course.title}`,
        blocks: [
          { type: 'heading', text: 'A team certificate is due for renewal' },
          { type: 'text', text: `${cert.person.firstName} ${cert.person.lastName}'s ${cert.course.title} certificate expires on ${longDate(cert.expiresAt!)}.` },
          { type: 'summary', rows: [['Delegate', `${cert.person.firstName} ${cert.person.lastName}`], ...rows] },
          { type: 'button', label: 'Book renewal', href: `${SITE_URL}/courses/${cert.course.slug}#dates` },
        ],
      });
    }
    sent++;
  }
  return sent;
}
