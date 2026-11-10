'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { Prisma, Role } from '@prisma/client';
import { db } from '@/lib/db';
import { audit, requireAdmin } from '@/lib/admin';
import { requirePerson } from '@/lib/auth';
import { readQuals } from '@/lib/trainers';
import { EXT, storeFile } from '@/lib/integrations/files';

const requireSuper = () => requirePerson(['SUPER_ADMIN'], '/admin/people');
const STAFF_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN', 'TRAINER', 'BOOKER'];
const go = (id: string, msg: string): never => redirect(`/admin/people/${id}?msg=${msg}`);

/** Super Admin: add a staff member or trainer (or give an existing person the role). */
export async function addStaff(form: FormData) {
  const me = await requireSuper();
  const email = z.string().trim().toLowerCase().email().safeParse(form.get('email'));
  const first = String(form.get('firstName') ?? '').trim().slice(0, 80);
  const last = String(form.get('lastName') ?? '').trim().slice(0, 80);
  const role = String(form.get('role')) as Role;
  if (!email.success || !first || !['ADMIN', 'SUPER_ADMIN', 'TRAINER'].includes(role)) redirect('/admin/people?msg=invalid');
  const roles: Role[] = role === 'SUPER_ADMIN' ? ['ADMIN', 'SUPER_ADMIN'] : [role];
  const existing = await db.person.findUnique({ where: { email: email.data! } });
  const p = existing
    ? await db.person.update({ where: { id: existing.id }, data: { roles: [...new Set([...existing.roles, ...roles])] } })
    : await db.person.create({ data: { email: email.data!, firstName: first, lastName: last || '-', roles } });
  if (role === 'TRAINER') await db.trainerProfile.upsert({ where: { personId: p.id }, update: {}, create: { personId: p.id, status: 'PENDING' } });
  await audit(me.id, 'STAFF_ADDED', 'Person', p.id, existing ? { roles: existing.roles } : undefined, { roles: p.roles });
  revalidatePath('/admin', 'layout');
  go(p.id, 'added');
}

/** Super Admin: set someone's roles. You cannot remove your own Super Admin, and one Super Admin must always remain. */
export async function setRoles(form: FormData) {
  const me = await requireSuper();
  const id = String(form.get('personId'));
  const p = await db.person.findUniqueOrThrow({ where: { id } });
  const picked = STAFF_ROLES.filter((r) => form.get(`role_${r}`) === 'on');
  if (picked.includes('SUPER_ADMIN') && !picked.includes('ADMIN')) picked.push('ADMIN');
  const next: Role[] = ['DELEGATE', ...picked];
  if (id === me.id && !next.includes('SUPER_ADMIN')) go(id, 'selflock');
  if (p.roles.includes('SUPER_ADMIN') && !next.includes('SUPER_ADMIN')) {
    const supers = await db.person.count({ where: { roles: { has: 'SUPER_ADMIN' } } });
    if (supers <= 1) go(id, 'lastsuper');
  }
  await db.person.update({ where: { id }, data: { roles: next } });
  if (next.includes('TRAINER')) await db.trainerProfile.upsert({ where: { personId: id }, update: {}, create: { personId: id, status: 'PENDING' } });
  await audit(me.id, 'ROLES_CHANGED', 'Person', id, { roles: p.roles }, { roles: next });
  revalidatePath('/admin', 'layout');
  go(id, 'roles');
}

/** Super Admin: clear someone's authenticator so they set it up again at next log-in (lost phone). */
export async function resetAuthenticator(form: FormData) {
  const me = await requireSuper();
  const id = String(form.get('personId'));
  await db.person.update({ where: { id }, data: { totpSecret: null } });
  await audit(me.id, 'AUTHENTICATOR_RESET', 'Person', id);
  go(id, 'reset');
}

/** Admin: edit contact details. */
export async function updateDetails(form: FormData) {
  const me = await requireAdmin('/admin/people');
  const id = String(form.get('personId'));
  const p = await db.person.findUniqueOrThrow({ where: { id } });
  const data = {
    firstName: String(form.get('firstName') ?? '').trim().slice(0, 80) || p.firstName,
    lastName: String(form.get('lastName') ?? '').trim().slice(0, 80) || p.lastName,
    mobile: String(form.get('mobile') ?? '').trim().slice(0, 20) || null,
    employer: String(form.get('employer') ?? '').trim().slice(0, 120) || null,
  };
  await db.person.update({ where: { id }, data });
  await audit(me.id, 'PERSON_UPDATED', 'Person', id, { firstName: p.firstName, lastName: p.lastName, mobile: p.mobile, employer: p.employer }, data);
  go(id, 'saved');
}

/** Super Admin: approve, suspend or reinstate a trainer. */
export async function setTrainerStatus(form: FormData) {
  const me = await requireSuper();
  const id = String(form.get('personId'));
  const status = String(form.get('status'));
  if (!['APPROVED', 'SUSPENDED', 'PENDING'].includes(status)) go(id, 'invalid');
  const tp = await db.trainerProfile.findUniqueOrThrow({ where: { personId: id } });
  await db.trainerProfile.update({ where: { personId: id }, data: { status: status as 'APPROVED', ...(status === 'APPROVED' ? { approvedAt: new Date(), approvedById: me.id } : {}) } });
  await audit(me.id, `TRAINER_${status}`, 'Person', id, { status: tp.status }, { status });
  revalidatePath('/admin', 'layout');
  go(id, status.toLowerCase());
}

/** Admin: trainer subjects, home base and employment. */
export async function updateTrainer(form: FormData) {
  const me = await requireAdmin('/admin/people');
  const id = String(form.get('personId'));
  const tp = await db.trainerProfile.findUniqueOrThrow({ where: { personId: id } });
  const data = {
    subjects: form.getAll('subjects').map(String).slice(0, 20),
    homeBase: String(form.get('homeBase') ?? '').trim().slice(0, 80) || null,
    employment: ['EMPLOYED', 'ASSOCIATE'].includes(String(form.get('employment'))) ? String(form.get('employment')) : null,
  };
  await db.trainerProfile.update({ where: { personId: id }, data });
  await audit(me.id, 'TRAINER_UPDATED', 'Person', id, { subjects: tp.subjects, homeBase: tp.homeBase, employment: tp.employment }, data);
  go(id, 'saved');
}

/** Admin: add a qualification with expiry and an optional certificate file. */
export async function addQualification(form: FormData) {
  const me = await requireAdmin('/admin/people');
  const id = String(form.get('personId'));
  const name = String(form.get('name') ?? '').trim().slice(0, 120);
  const issuer = String(form.get('issuer') ?? '').trim().slice(0, 120);
  const expiresAt = String(form.get('expiresAt') ?? '');
  if (!name || (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt))) go(id, 'invalid');
  const file = form.get('file');
  let fileKey: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (!EXT[file.type] || file.size > 10 * 1024 * 1024) go(id, 'badfile');
    fileKey = await storeFile('files', `trainers/${id}`, file);
  }
  const tp = await db.trainerProfile.findUniqueOrThrow({ where: { personId: id } });
  const quals = [...readQuals(tp.qualifications), { id: randomUUID(), name, issuer, expiresAt: expiresAt || null, fileKey }];
  await db.trainerProfile.update({ where: { personId: id }, data: { qualifications: quals as Prisma.InputJsonValue } });
  await audit(me.id, 'QUALIFICATION_ADDED', 'Person', id, undefined, { name, expiresAt });
  go(id, 'qualadded');
}

export async function removeQualification(form: FormData) {
  const me = await requireAdmin('/admin/people');
  const id = String(form.get('personId'));
  const qid = String(form.get('qualId'));
  const tp = await db.trainerProfile.findUniqueOrThrow({ where: { personId: id } });
  const before = readQuals(tp.qualifications);
  const removed = before.find((q) => q.id === qid);
  await db.trainerProfile.update({ where: { personId: id }, data: { qualifications: before.filter((q) => q.id !== qid) as Prisma.InputJsonValue } });
  await audit(me.id, 'QUALIFICATION_REMOVED', 'Person', id, removed, undefined);
  go(id, 'qualremoved');
}
