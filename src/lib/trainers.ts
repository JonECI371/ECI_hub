import 'server-only';
import { z } from 'zod';
import type { Person, TrainerProfile } from '@prisma/client';
import { db } from '@/lib/db';

export const Qualification = z.object({ id: z.string(), name: z.string(), issuer: z.string().optional(), expiresAt: z.string().nullable().optional(), fileKey: z.string().nullable().optional() });
export type Qualification = z.infer<typeof Qualification>;

export function readQuals(v: unknown): Qualification[] {
  const r = z.array(Qualification).safeParse(v);
  return r.success ? r.data : [];
}

export type QualState = 'valid' | 'soon' | 'expired' | 'none';
export function qualState(q: Qualification, now = new Date()): QualState {
  if (!q.expiresAt) return 'none';
  const t = new Date(q.expiresAt).getTime();
  if (t < now.getTime()) return 'expired';
  if (t - now.getTime() < 90 * 86400000) return 'soon';
  return 'valid';
}

/** Why a trainer cannot be assigned, or null when they can. */
export function assignBlock(p: Person & { trainerProfile: TrainerProfile | null }): string | null {
  if (!p.roles.includes('TRAINER')) return 'Not a trainer';
  const tp = p.trainerProfile;
  if (!tp || tp.status === 'PENDING') return 'Awaiting approval';
  if (tp.status === 'SUSPENDED') return 'Suspended';
  if (readQuals(tp.qualifications).some((q) => qualState(q) === 'expired')) return 'Has an expired qualification';
  return null;
}

/** Trainers for the session pickers, with the reason any of them cannot be chosen. */
export async function trainerOptions() {
  const people = await db.person.findMany({ where: { roles: { has: 'TRAINER' } }, include: { trainerProfile: true }, orderBy: { firstName: 'asc' } });
  return people.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, block: assignBlock(p) }));
}

export async function assertAssignable(trainerId: string | null) {
  if (!trainerId) return;
  const p = await db.person.findUnique({ where: { id: trainerId }, include: { trainerProfile: true } });
  const why = p ? assignBlock(p) : 'Not found';
  if (why) throw new Error(`This trainer cannot be assigned: ${why.toLowerCase()}.`);
}
