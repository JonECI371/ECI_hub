import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOCAL_UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'eci-delegates-'));

describe('delegate details', async () => {
  const { db } = await import('@/lib/db');
  const { saveDelegate, DelegateError, dobFromParts, skillguardOf } = await import('@/lib/delegate-details');
  const { issueCertificate, CertificateError, sendSkillguardChases } = await import('@/lib/certificates');
  const { createAccountBooking, addStatementLine } = await import('@/lib/credit');
  const { course } = await import('./fixtures');

  /** An active credit account with one booker, a Thames Water style course (no approval) and a 3 place booking on account. */
  async function setup(places = 3) {
    const id = Math.random().toString(36).slice(2, 10);
    const booker = await db.person.create({ data: { email: `booker.${id}@example.com`, firstName: 'Priya', lastName: 'Shah', roles: ['DELEGATE', 'BOOKER'] } });
    const account = await db.account.create({
      data: { company: `Acme ${id}`, companyNumber: `X${id}`, registeredAddress: 'x', accountsName: 'x', accountsEmail: 'x@example.com', creditLimitPence: 500000, poRule: 'NONE', status: 'ACTIVE',
        members: { create: { personId: booker.id, role: 'MAIN_BOOKER', status: 'ACTIVE' } } },
    });
    const { course: c, session, subject } = await course({ capacity: 10 });
    await db.subject.update({ where: { id: subject.id }, data: { registrationSet: 'thames-water' } });
    const b = await createAccountBooking({ personId: booker.id, courseId: c.id, sessionId: session!.id, places, bookerAttends: true, others: null, poNumber: 'PO-100' });
    const attendees = await db.attendee.findMany({ where: { bookingId: b.id }, orderBy: { id: 'asc' } });
    return { id, booker, account, c, session: session!, b, attendees };
  }
  const input = (attendeeId: string, over: Partial<Parameters<typeof saveDelegate>[2]> = {}) => ({
    attendeeId, mode: 'now' as const, firstName: 'Sam', lastName: 'Lee', email: `sam.${Math.random().toString(36).slice(2, 8)}@example.com`,
    dob: { d: '3', m: '4', y: '1990' }, authority: true, ...over,
  });

  it('reads dates of birth strictly', () => {
    expect(dobFromParts('3', '4', '1990')?.toISOString().slice(0, 10)).toBe('1990-04-03');
    expect(dobFromParts('31', '2', '1990')).toBeNull();
    expect(dobFromParts('', '4', '1990')).toBeNull();
    expect(dobFromParts('1', '1', String(new Date().getFullYear() - 5))).toBeNull();
  });

  it('fill in now: needs name, email and date of birth; telephone and SkillGuard are optional', async () => {
    const s = await setup();
    const free = s.attendees.find((a) => a.personId !== s.booker.id)!;
    const e1 = await saveDelegate(s.booker.id, s.b.id, input(free.id, { firstName: '', dob: { d: '', m: '', y: '' } })).catch((e) => e);
    expect(e1).toBeInstanceOf(DelegateError);
    expect(Object.keys((e1 as InstanceType<typeof DelegateError>).fields).sort()).toEqual(['dob', 'first']);
    await saveDelegate(s.booker.id, s.b.id, input(free.id, { email: `sam.${s.id}@example.com` }));
    const a = await db.attendee.findUniqueOrThrow({ where: { id: free.id }, include: { person: true, registration: true } });
    expect(a.status).toBe('REGISTERED');
    expect(a.registration).not.toBeNull();
    expect(a.person?.dateOfBirth?.toISOString().slice(0, 10)).toBe('1990-04-03');
    expect(skillguardOf(a.person?.schemeIds)).toBe('');
  });

  it('someone else\'s details need the authority tick, and only the booker can enter them', async () => {
    const s = await setup();
    const free = s.attendees.find((a) => a.personId !== s.booker.id)!;
    const e = await saveDelegate(s.booker.id, s.b.id, input(free.id, { authority: false })).catch((x) => x);
    expect((e as InstanceType<typeof DelegateError>).fields.authority).toBeTruthy();
    const stranger = await db.person.create({ data: { email: `s.${s.id}@example.com`, firstName: 'No', lastName: 'Body' } });
    await expect(saveDelegate(stranger.id, s.b.id, input(free.id))).rejects.toBeInstanceOf(DelegateError);
  });

  it('email a link needs only name and email, and invites the delegate', async () => {
    const s = await setup();
    const free = s.attendees.find((a) => a.personId !== s.booker.id)!;
    await saveDelegate(s.booker.id, s.b.id, { attendeeId: free.id, mode: 'link', firstName: 'Una', lastName: 'Kay', email: `una.${s.id}@example.com`, authority: true });
    const a = await db.attendee.findUniqueOrThrow({ where: { id: free.id }, include: { registration: true } });
    expect(a.status).toBe('INVITED');
    expect(a.registration).toBeNull();
    expect(await db.emailLog.count({ where: { trigger: 'ATTENDEE_ADDED', personId: a.personId! } })).toBe(1);
  });

  it('never overwrites an existing person\'s record, only fills blanks', async () => {
    const s = await setup();
    const free = s.attendees.find((a) => a.personId !== s.booker.id)!;
    const other = await db.person.create({ data: { email: `known.${s.id}@example.com`, firstName: 'Real', lastName: 'Name', mobile: '07700900111', schemeIds: { skillguard: 'SG-REAL' } } });
    await saveDelegate(s.booker.id, s.b.id, input(free.id, { email: other.email, firstName: 'Typo', lastName: 'Wrong', mobile: '07700900999', skillguard: 'SG-WRONG' }));
    const p = await db.person.findUniqueOrThrow({ where: { id: other.id } });
    expect([p.firstName, p.lastName, p.mobile, skillguardOf(p.schemeIds)]).toEqual(['Real', 'Name', '07700900111', 'SG-REAL']);
    expect(p.dateOfBirth?.toISOString().slice(0, 10)).toBe('1990-04-03'); // was blank, so filled
  });

  it('the invoice line lists references that differ from the booking PO, one line per booking', async () => {
    const s = await setup();
    const [x, y] = s.attendees.filter((a) => a.personId !== s.booker.id);
    await saveDelegate(s.booker.id, s.b.id, input(x.id, { firstName: 'Ann', lastName: 'Ray', invoiceRef: 'PO-100' })); // same as the booking: not repeated
    await saveDelegate(s.booker.id, s.b.id, input(y.id, { firstName: 'Bo', lastName: 'Fox', invoiceRef: 'PO-777' }));
    const lines = await db.statementLine.findMany({ where: { bookingId: s.b.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toContain('Refs: Bo Fox PO-777');
    expect(lines[0].description).not.toContain('Ann Ray');
    await saveDelegate(s.booker.id, s.b.id, input(y.id, { firstName: 'Bo', lastName: 'Fox', email: (await db.attendee.findUniqueOrThrow({ where: { id: y.id }, include: { person: true } })).person!.email, invoiceRef: '' }));
    const after = await db.statementLine.findFirstOrThrow({ where: { bookingId: s.b.id } });
    expect(after.description).not.toContain('Refs:');
    expect(after.description).not.toMatch(/\.$/);
  });

  it('a Thames Water certificate cannot be issued without a SkillGuard number, and the delegate and booker are chased', async () => {
    const s = await setup(2);
    const free = s.attendees.find((a) => a.personId !== s.booker.id)!;
    await saveDelegate(s.booker.id, s.b.id, input(free.id, { firstName: 'Cy', lastName: 'Dee', email: `cy.${s.id}@example.com` }));
    await db.attendee.update({ where: { id: free.id }, data: { status: 'ATTENDED' } });
    const pdf = () => new File([new Uint8Array([37, 80, 68, 70])], 'c.pdf', { type: 'application/pdf' });
    await expect(issueCertificate(free.id, 'admin', pdf(), new Date())).rejects.toThrow(/SkillGuard number needed/);
    await expect(issueCertificate(free.id, 'admin', pdf(), new Date())).rejects.toBeInstanceOf(CertificateError);

    // The course ended two days ago: one email each to the delegate and the booker, and not again the same week.
    await db.session.update({ where: { id: s.session.id }, data: { startsAt: new Date(Date.now() - 3 * 86400000), endsAt: new Date(Date.now() - 2 * 86400000) } });
    expect(await sendSkillguardChases()).toBeGreaterThanOrEqual(2);
    expect(await sendSkillguardChases()).toBe(0);

    const p = await db.attendee.findUniqueOrThrow({ where: { id: free.id }, include: { person: true } });
    await db.person.update({ where: { id: p.personId! }, data: { schemeIds: { skillguard: 'SG-123' } } });
    const cert = await issueCertificate(free.id, 'admin', pdf(), new Date());
    expect(cert.personId).toBe(p.personId);
  });
});
