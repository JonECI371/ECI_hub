import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOCAL_UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'eci-fields-'));

describe('delegate field settings', async () => {
  const { db } = await import('@/lib/db');
  const { effectiveFields, parseDelegateFields, templateIdFor, templateById, certificateMissing, asksForFiles } = await import('@/lib/delegate-fields');
  const { questionSet } = await import('@/lib/registration-sets');
  const { saveDelegate, DelegateError, usesDelegateDetails } = await import('@/lib/delegate-details');
  const { issueCertificate, CertificateError } = await import('@/lib/certificates');
  const { createAccountBooking } = await import('@/lib/credit');
  const { course } = await import('./fixtures');

  it('picks the template for the subject and delivery, and a course can override it', () => {
    expect(templateIdFor('thames-water', 'VIRTUAL_CLASSROOM')).toBe('thames');
    expect(templateIdFor('compex', 'IN_PERSON')).toBe('compex-in-person');
    expect(templateIdFor('compex', 'ELEARNING')).toBe('compex-elearning');
    expect(templateIdFor('eusr', 'ELEARNING')).toBe('eusr');
    expect(templateIdFor('', 'VIRTUAL_CLASSROOM')).toBe('awareness');
    const base = { deliveryType: 'IN_PERSON', subject: { registrationSet: 'compex' } };
    expect(effectiveFields({ ...base, delegateFields: null }).fields.uln).toBe('REQUIRED');
    const custom = { fields: { ...templateById('compex-in-person').fields, uln: 'OPTIONAL', emergency: 'REQUIRED' }, certificate: ['uln'] };
    const e = effectiveFields({ ...base, delegateFields: custom });
    expect([e.fields.uln, e.fields.emergency, e.certificate]).toEqual(['OPTIONAL', 'REQUIRED', ['uln']]);
  });

  it('ignores anything unknown or invalid in stored settings, and cannot require a field that is off', () => {
    expect(parseDelegateFields(null)).toBeNull();
    expect(parseDelegateFields('x')).toBeNull();
    const p = parseDelegateFields({ fields: { phone: 'REQUIRED', dob: 'MAYBE', nonsense: 'REQUIRED' }, certificate: ['phone', 'dob', 'bogus'] })!;
    expect([p.fields.phone, p.fields.dob, Object.keys(p.fields).includes('nonsense'), p.certificate]).toEqual(['REQUIRED', 'OFF', false, ['phone']]);
  });

  it('builds the registration questions from the settings (no photo for CompEx, ULN required; photo and ID for EUSR)', () => {
    const cx = questionSet(templateById('compex-in-person'), 'IN_PERSON', true, 'CompEx');
    expect(cx.questions.map((q) => q.key)).toEqual(['compexId', 'dietary', 'accessNeeds']);
    expect(cx.questions.find((q) => q.key === 'compexId')).toMatchObject({ optional: false, label: 'CompEx Unique Learner Number (ULN)' });
    expect(cx.questions.some((q) => q.kind === 'file')).toBe(false);
    const eu = questionSet(templateById('eusr'), 'ELEARNING', false, 'EUSR');
    expect(eu.questions.filter((q) => q.kind === 'file').map((q) => q.key)).toEqual(['photo', 'photoId']);
    expect(asksForFiles(templateById('eusr'))).toBe(true);
    expect(asksForFiles(templateById('thames'))).toBe(false);
  });

  /** A CompEx style in-person course (approval needed) with a booking on account. */
  async function compexSetup() {
    const id = Math.random().toString(36).slice(2, 10);
    const booker = await db.person.create({ data: { email: `booker.${id}@example.com`, firstName: 'Priya', lastName: 'Shah', roles: ['DELEGATE', 'BOOKER'] } });
    await db.account.create({ data: { company: `Acme ${id}`, companyNumber: `X${id}`, registeredAddress: 'x', accountsName: 'x', accountsEmail: 'x@example.com', creditLimitPence: 500000, poRule: 'NONE', status: 'ACTIVE', members: { create: { personId: booker.id, role: 'MAIN_BOOKER', status: 'ACTIVE' } } } });
    const { course: c, session, subject } = await course({ delivery: 'IN_PERSON', capacity: 10 });
    await db.subject.update({ where: { id: subject.id }, data: { registrationSet: 'compex', approvalRequired: true } });
    const b = await createAccountBooking({ personId: booker.id, courseId: c.id, sessionId: session!.id, places: 2, bookerAttends: true, others: null });
    const free = (await db.attendee.findMany({ where: { bookingId: b.id }, orderBy: { id: 'asc' } })).find((a) => a.personId !== booker.id)!;
    return { id, booker, c, session: session!, b, free };
  }

  it('the booker page asks for what the course requires: CompEx needs telephone, date of birth, employer and ULN, and goes to approval', async () => {
    const s = await compexSetup();
    const full = await db.course.findUniqueOrThrow({ where: { id: s.c.id }, include: { subject: true } });
    expect(usesDelegateDetails(full)).toBe(true);
    const base = { attendeeId: s.free.id, mode: 'now' as const, firstName: 'Una', lastName: 'Kay', email: `una.${s.id}@example.com`, authority: true };
    const e = await saveDelegate(s.booker.id, s.b.id, base).catch((x) => x);
    expect(e).toBeInstanceOf(DelegateError);
    expect(Object.keys((e as InstanceType<typeof DelegateError>).fields).sort()).toEqual(['dob', 'employer', 'phone', 'uln']);
    await saveDelegate(s.booker.id, s.b.id, { ...base, dob: { d: '2', m: '5', y: '1985' }, values: { phone: '07700900123', employer: 'Acme', uln: '1234567890' } });
    const a = await db.attendee.findUniqueOrThrow({ where: { id: s.free.id }, include: { registration: true, person: true } });
    expect(a.registration?.approval).toBe('PENDING');
    expect((a.person?.schemeIds as Record<string, string>).compex).toBe('1234567890');
    expect(await db.task.count({ where: { type: 'REGISTRATION_APPROVAL', recordId: a.id, status: 'OPEN' } })).toBe(1);
  });

  it('a course can hold the certificate for any field, and it is released when the field is on record', async () => {
    const s = await compexSetup();
    await db.course.update({ where: { id: s.c.id }, data: { delegateFields: { fields: { ...templateById('compex-in-person').fields, uln: 'OPTIONAL' }, certificate: ['uln'] } } });
    await saveDelegate(s.booker.id, s.b.id, { attendeeId: s.free.id, mode: 'now', firstName: 'Una', lastName: 'Kay', email: `una.${s.id}@example.com`, authority: true, dob: { d: '2', m: '5', y: '1985' }, values: { phone: '07700900123', employer: 'Acme' } });
    await db.attendee.update({ where: { id: s.free.id }, data: { status: 'ATTENDED' } });
    const pdf = () => new File([new Uint8Array([37, 80, 68, 70])], 'c.pdf', { type: 'application/pdf' });
    await expect(issueCertificate(s.free.id, 'admin', pdf(), new Date())).rejects.toThrow(/Unique Learner Number \(ULN\) needed/);
    const p = await db.attendee.findUniqueOrThrow({ where: { id: s.free.id }, include: { person: true, registration: true } });
    expect(certificateMissing(effectiveFields({ delegateFields: { fields: { ...templateById('compex-in-person').fields, uln: 'OPTIONAL' }, certificate: ['uln'] }, deliveryType: 'IN_PERSON', subject: { registrationSet: 'compex' } }), p.person!, p.registration?.answers as Record<string, unknown>)).toEqual(['uln']);
    await db.person.update({ where: { id: p.personId! }, data: { schemeIds: { compex: '999' } } });
    await expect(issueCertificate(s.free.id, 'admin', pdf(), new Date())).resolves.toBeTruthy();
    await expect(issueCertificate(s.free.id, 'admin', pdf(), new Date())).resolves.toBeTruthy(); // already certified: issuing again is allowed
  });
});
