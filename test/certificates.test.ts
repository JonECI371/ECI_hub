import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOCAL_UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'eci-certs-'));

describe('certificates', async () => {
  const { db } = await import('@/lib/db');
  const { issueCertificate, canSeeCertificate, sendExpiryReminders, expiryFor, CertificateError } = await import('@/lib/certificates');
  const { createPendingBooking, confirmCardBooking } = await import('@/lib/booking');
  const { course, booker } = await import('./fixtures');

  it('expiry counts the course validity from the issue date', () => {
    expect(expiryFor(new Date('2026-11-10T12:00:00Z'), 5)?.toISOString().slice(0, 10)).toBe('2031-11-10');
    expect(expiryFor(new Date(), null)).toBeNull();
  });

  it('issues to attended delegates only, closes the task when all are done, and limits downloads', async () => {
    const { course: c, session } = await course({ delivery: 'IN_PERSON', capacity: 5 });
    await db.course.update({ where: { id: c.id }, data: { validityYears: 3 } });
    const id = Date.now().toString(36);
    const b = await createPendingBooking({ courseId: c.id, sessionId: session!.id, places: 2, booker: booker(), bookerAttends: false, others: [{ name: 'Alex Swap', email: `alex.${id}@example.com` }, { name: 'Sam Lee', email: `sam.${id}@example.com` }] });
    await confirmCardBooking(b.id, `pi_${b.id}`);
    const [x, y] = await db.attendee.findMany({ where: { bookingId: b.id }, orderBy: { id: 'asc' } });
    await db.task.create({ data: { type: 'CERTIFICATE_UPLOAD', title: 't', recordType: 'Session', recordId: session!.id } });
    const pdf = () => new File([new Uint8Array([37, 80, 68, 70])], 'c.pdf', { type: 'application/pdf' });

    await expect(issueCertificate(x.id, 'admin', pdf(), new Date())).rejects.toBeInstanceOf(CertificateError); // not marked attended yet
    await db.attendee.updateMany({ where: { id: { in: [x.id, y.id] } }, data: { status: 'ATTENDED' } });
    const cert = await issueCertificate(x.id, 'admin', pdf(), new Date());
    expect(cert.expiresAt!.getUTCFullYear()).toBe(new Date().getUTCFullYear() + 3);
    expect(await db.task.count({ where: { type: 'CERTIFICATE_UPLOAD', recordId: session!.id, status: 'OPEN' } })).toBe(1); // Sam still waiting
    await issueCertificate(y.id, 'admin', pdf(), new Date());
    expect(await db.task.count({ where: { type: 'CERTIFICATE_UPLOAD', recordId: session!.id, status: 'OPEN' } })).toBe(0);

    expect(await canSeeCertificate(x.personId!, cert)).toBe(true); // holder
    expect(await canSeeCertificate(b.bookerId, cert)).toBe(true); // their booker
    expect(await canSeeCertificate(y.personId!, cert)).toBe(false); // a classmate
  });

  it('reminds once, about three months before expiry, unless already re-booked', async () => {
    const { course: c } = await course({ delivery: 'IN_PERSON' });
    const p = await db.person.create({ data: { email: `exp.${Date.now()}@example.com`, firstName: 'Jordan', lastName: 'Price' } });
    await db.certificate.create({ data: { personId: p.id, courseId: c.id, issuedAt: new Date(Date.now() - 1000 * 86400000), expiresAt: new Date(Date.now() + 80 * 86400000) } });
    const far = await db.certificate.create({ data: { personId: p.id, courseId: c.id, issuedAt: new Date(), expiresAt: new Date(Date.now() + 400 * 86400000) } });
    await sendExpiryReminders();
    await sendExpiryReminders();
    expect(await db.emailLog.count({ where: { personId: p.id, trigger: { startsWith: 'EXPIRY_REMINDER:' } } })).toBe(1);
    expect(await db.emailLog.count({ where: { trigger: `EXPIRY_REMINDER:${far.id}` } })).toBe(0);
  });
});
