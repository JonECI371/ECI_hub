'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePerson } from '@/lib/auth';
import { TrainerRuleError, flagConflict, saveAttendance, saveAvailability } from '@/lib/trainer-app';

const fail = (to: string, e: unknown): never => {
  if (e instanceof TrainerRuleError) redirect(`${to}${to.includes('?') ? '&' : '?'}error=${encodeURIComponent(e.message)}`);
  throw e;
};

export async function attendance(form: FormData) {
  const me = await requirePerson(['TRAINER'], '/trainer');
  const sessionId = String(form.get('sessionId'));
  const marks: Record<string, 'ATTENDED' | 'NO_SHOW'> = {};
  for (const [k, v] of form.entries()) if (k.startsWith('m_') && (v === 'ATTENDED' || v === 'NO_SHOW')) marks[k.slice(2)] = v;
  try { await saveAttendance(me.id, sessionId, marks); } catch (e) { fail(`/trainer/sessions/${sessionId}`, e); }
  revalidatePath('/trainer');
  redirect(`/trainer/sessions/${sessionId}?saved=1`);
}

export async function conflict(form: FormData) {
  const me = await requirePerson(['TRAINER'], '/trainer');
  try { await flagConflict(me.id, String(form.get('sessionId')), String(form.get('note') ?? '')); } catch (e) { fail('/trainer', e); }
  redirect('/trainer?flagged=1');
}

export async function availability(form: FormData) {
  const me = await requirePerson(['TRAINER'], '/trainer');
  const month = String(form.get('month') ?? '');
  try { await saveAvailability(me.id, month, form.getAll('day').map(String), String(form.get('from') ?? ''), String(form.get('to') ?? '')); } catch (e) { fail(`/trainer/availability?month=${month}`, e); }
  revalidatePath('/trainer/availability');
  redirect(`/trainer/availability?month=${month}&saved=1`);
}

const SUBJECTS = ['CompEx', 'EUSR', 'Thames Water', 'Process safety', 'DSEAR', 'Functional safety'];

/** Trainer edits their own mobile, base and subjects. */
export async function saveProfile(form: FormData) {
  const me = await requirePerson(['TRAINER'], '/trainer');
  const { db } = await import('@/lib/db');
  const mobile = String(form.get('mobile') ?? '').trim();
  if (mobile && !/^[0-9 +()-]{7,20}$/.test(mobile)) redirect('/trainer/profile?error=' + encodeURIComponent('Enter a mobile number, like 07700 900456.'));
  const homeBase = String(form.get('homeBase') ?? '').trim().slice(0, 80) || null;
  const subjects = form.getAll('subjects').map(String).filter((s) => SUBJECTS.includes(s));
  const tp = await db.trainerProfile.upsert({ where: { personId: me.id }, update: { homeBase, subjects }, create: { personId: me.id, homeBase, subjects } });
  await db.person.update({ where: { id: me.id }, data: { mobile: mobile || null } });
  await db.auditLog.create({ data: { actorId: me.id, action: 'TRAINER_PROFILE_UPDATED', recordType: 'Person', recordId: me.id, before: { mobile: me.mobile }, after: { mobile, homeBase: tp.homeBase, subjects } } });
  redirect('/trainer/profile?saved=1');
}

/** Trainer adds a qualification with its certificate (or a renewed one replacing an old entry). */
export async function addMyQualification(form: FormData) {
  const me = await requirePerson(['TRAINER'], '/trainer');
  const { db } = await import('@/lib/db');
  const { randomUUID } = await import('node:crypto');
  const { readQuals } = await import('@/lib/trainers');
  const { storeFile, EXT } = await import('@/lib/integrations/files');
  const back = (m: string): never => redirect('/trainer/profile?error=' + encodeURIComponent(m));
  const name = String(form.get('name') ?? '').trim().slice(0, 120);
  const issuer = String(form.get('issuer') ?? '').trim().slice(0, 120);
  const expiresAt = String(form.get('expiresAt') ?? '');
  const replaces = String(form.get('replaces') ?? '');
  if (!name) back('Enter the qualification name.');
  if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) back('Enter the expiry date.');
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) back('Attach the certificate (PDF or photo).');
  if (!EXT[(file as File).type] || (file as File).size > 10 * 1024 * 1024) back('Upload a PDF, JPEG, PNG or WebP of 10MB or less.');
  const fileKey = await storeFile('files', `trainers/${me.id}`, file as File);
  const tp = await db.trainerProfile.upsert({ where: { personId: me.id }, update: {}, create: { personId: me.id } });
  const quals = readQuals(tp.qualifications).filter((q) => q.id !== replaces);
  quals.push({ id: randomUUID(), name, issuer, expiresAt: expiresAt || null, fileKey });
  await db.trainerProfile.update({ where: { personId: me.id }, data: { qualifications: quals } });
  await db.auditLog.create({ data: { actorId: me.id, action: replaces ? 'QUALIFICATION_RENEWED' : 'QUALIFICATION_ADDED', recordType: 'Person', recordId: me.id, after: { name, expiresAt, replaces: replaces || null } } });
  redirect('/trainer/profile?saved=qual');
}
