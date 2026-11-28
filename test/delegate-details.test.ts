import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOCAL_UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'eci-delegates-'));

describe('delegate invoice references, SkillGuard before certificate', async () => {
  const { db } = await import('@/lib/db');
  const { refreshLineRefs } = await import('@/lib/delegate-details');
  const { issueCertificate, CertificateError, sendMissingDetailsChases } = await import('@/lib/certificates');
  const { createAccountBooking } = await import('@/lib/credit');
  const { course } = await import('./fixtures');

  /** An active credit account with one booker, a Thames Water style course and a booking on account. */
  async function setup(places = 3) {
    const id = Math.random().toString(36).slice(2, 10);
    const booker = await db.person.create({ data: { email: `booker.${id}@example.com`, firstName: 'Priya', lastName: 'Shah', roles: ['DELEGATE', 'BOOKER'] } });
    await db.account.create({
      data: { company: `Acme ${id}`, companyNumber: `X${id}`, registeredAddress: 'x', accountsName: 'x', accountsEmail: 'x@example.com', creditLimitPence: 500000, poRule: 'NONE', status: 'ACTIVE',
        members: { create: { personId: booker.id, role: 'MAIN_BOOKER', status: 'ACTIVE' } } },
    });
    const { course: c, session, subject } = await course({ capacity: 10 });
    await db.subject.update({ where: { id: subject.id }, data: { registrationSet: 'thames-water' } });
    const b = await createAccountBooking({ personId: booker.id, courseId: c.id, sessionId: session!.id, places, bookerAttends: true, others: null, poNumber: 'PO-100' });
    const attendees = await db.attendee.findMany({ where: { bookingId: b.id }, orderBy: { id: 'asc' } });
    return { id, booker, c, session: session!, b, attendees };
  }
  const delegate = async (s: Awaited<ReturnType<typeof setup>>, attendeeId: string, first: string, ref: string | null = null) => {
    const p = await db.person.create({ data: { email: `${first.toLowerCase()}.${s.id}@example.com`, firstName: first, lastName: 'Test' } });
    await db.attendee.update({ where: { id: attendeeId }, data: { personId: p.id, invoiceRef: ref, status: 'REGISTERED' } });
    return p;
  };

  it('the invoice line lists references that differ from the booking PO, one line per booking', async () => {
    const s = await setup();
    const [x, y] = s.attendees.filter((a) => a.personId !== s.booker.id);
    await delegate(s, x.id, 'Ann', 'PO-100'); // same as the booking: not repeated
    await delegate(s, y.id, 'Bo', 'PO-777');
    await db.$transaction((tx) => refreshLineRefs(tx, s.b.id));
    const lines = await db.statementLine.findMany({ where: { bookingId: s.b.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toContain('Refs: Bo Test PO-777');
    expect(lines[0].description).not.toContain('Ann Test');
    await db.attendee.update({ where: { id: y.id }, data: { invoiceRef: null } });
    await db.$transaction((tx) => refreshLineRefs(tx, s.b.id));
    const after = await db.statementLine.findFirstOrThrow({ where: { bookingId: s.b.id } });
    expect(after.description).not.toContain('Refs:');
    expect(after.description).not.toMatch(/\.$/);
  });

  it('a Thames Water certificate cannot be issued without a SkillGuard number, and the delegate and booker are chased', async () => {
    const s = await setup(2);
    const free = s.attendees.find((a) => a.personId !== s.booker.id)!;
    const p = await delegate(s, free.id, 'Cy');
    await db.attendee.update({ where: { id: free.id }, data: { status: 'ATTENDED' } });
    const pdf = () => new File([new Uint8Array([37, 80, 68, 70])], 'c.pdf', { type: 'application/pdf' });
    await expect(issueCertificate(free.id, 'admin', pdf(), new Date())).rejects.toThrow(/SkillGuard number needed/);
    await expect(issueCertificate(free.id, 'admin', pdf(), new Date())).rejects.toBeInstanceOf(CertificateError);

    // The course ended two days ago: one email each to the delegate and the booker, and not again the same week.
    await db.session.update({ where: { id: s.session.id }, data: { startsAt: new Date(Date.now() - 3 * 86400000), endsAt: new Date(Date.now() - 2 * 86400000) } });
    expect(await sendMissingDetailsChases()).toBeGreaterThanOrEqual(2);
    expect(await sendMissingDetailsChases()).toBe(0);

    await db.person.update({ where: { id: p.id }, data: { schemeIds: { skillguard: 'SG-123' } } });
    const cert = await issueCertificate(free.id, 'admin', pdf(), new Date());
    expect(cert.personId).toBe(p.id);
  });
});
