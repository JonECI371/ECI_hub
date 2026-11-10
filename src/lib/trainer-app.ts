import 'server-only';
import { db } from '@/lib/db';

export class TrainerRuleError extends Error {}

const ukDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD

/** Sessions a trainer is assigned to, from today on (UK time), with live delegates. */
export async function myTrainerSessions(trainerId: string) {
  const startOfToday = new Date(`${ukDay(new Date())}T00:00:00Z`);
  return db.session.findMany({
    where: { trainerId, status: { in: ['PUBLISHED', 'FULL', 'DRAFT'] }, endsAt: { gte: new Date(startOfToday.getTime() - 3600000) } },
    include: { course: true, venue: true, bookings: { where: { status: 'CONFIRMED' }, select: { places: true } } },
    orderBy: { startsAt: 'asc' },
    take: 30,
  });
}

/** The session, if this trainer is assigned to it. Anyone else gets an error. */
export async function trainerSession(trainerId: string, sessionId: string) {
  const s = await db.session.findUnique({
    where: { id: sessionId },
    include: { course: true, venue: true, bookings: { where: { status: { in: ['CONFIRMED', 'COMPLETED'] } }, include: { account: true, attendees: { where: { status: { not: 'CANCELLED' } }, include: { person: true, registration: true } } } } },
  });
  if (!s || s.trainerId !== trainerId) throw new TrainerRuleError('This session is not assigned to you.');
  return s;
}

/**
 * Attendance, one tap per delegate. Only the assigned trainer, from the first day of the session.
 * Raises one Certificates to upload task per session for the office.
 */
export async function saveAttendance(trainerId: string, sessionId: string, marks: Record<string, 'ATTENDED' | 'NO_SHOW'>) {
  const s = await trainerSession(trainerId, sessionId);
  if (ukDay(s.startsAt) > ukDay(new Date())) throw new TrainerRuleError('Attendance opens on the first day of the session.');
  const allowed = new Set(s.bookings.flatMap((b) => b.attendees).filter((a) => a.personId).map((a) => a.id));
  const entries = Object.entries(marks).filter(([id]) => allowed.has(id));
  if (!entries.length) throw new TrainerRuleError('Mark at least one delegate.');
  const attended = entries.filter(([, m]) => m === 'ATTENDED').length;
  await db.$transaction(async (tx) => {
    for (const [id, m] of entries) await tx.attendee.update({ where: { id }, data: { status: m } });
    const open = await tx.task.findFirst({ where: { type: 'CERTIFICATE_UPLOAD', recordType: 'Session', recordId: s.id, status: 'OPEN' } });
    const detail = `${attended} attended, ${entries.length - attended} no-show, marked by the trainer.`;
    if (open) await tx.task.update({ where: { id: open.id }, data: { detail } });
    else if (attended) await tx.task.create({ data: { type: 'CERTIFICATE_UPLOAD', title: `Upload certificates: ${s.course.title}, ${s.startsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })}`, detail, recordType: 'Session', recordId: s.id } });
    await tx.auditLog.create({ data: { actorId: trainerId, action: 'ATTENDANCE_SAVED', recordType: 'Session', recordId: s.id, after: Object.fromEntries(entries) } });
  });
  return { attended, total: allowed.size, marked: entries.length };
}

/** Trainer flags a clash or problem with an assigned session; the office gets a task. */
export async function flagConflict(trainerId: string, sessionId: string, note: string) {
  const s = await trainerSession(trainerId, sessionId);
  const t = await db.person.findUniqueOrThrow({ where: { id: trainerId } });
  const text = note.trim().slice(0, 500);
  if (!text) throw new TrainerRuleError('Say what the problem is.');
  await db.task.create({ data: { type: 'TRAINER_CONFLICT', title: `${t.firstName} ${t.lastName} flagged a conflict: ${s.course.title}, ${s.startsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })}`, detail: text, recordType: 'Session', recordId: s.id, dueAt: s.startsAt } });
  await db.auditLog.create({ data: { actorId: trainerId, action: 'TRAINER_CONFLICT_FLAGGED', recordType: 'Session', recordId: s.id, after: { note: text } } });
}

/** Replace a trainer's availability for one month (future days only) with the days ticked and one time range. */
export async function saveAvailability(personId: string, month: string, days: string[], from: string, to: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new TrainerRuleError('Choose a month.');
  if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to) || from >= to) throw new TrainerRuleError('Set a start time before the end time.');
  const today = ukDay(new Date());
  const picked = [...new Set(days)].filter((d) => d.startsWith(`${month}-`) && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today);
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 1));
  const fromDay = new Date(`${today}T00:00:00Z`) > first ? new Date(`${today}T00:00:00Z`) : first;
  await db.$transaction(async (tx) => {
    await tx.availability.deleteMany({ where: { personId, date: { gte: fromDay, lt: last } } });
    if (picked.length) await tx.availability.createMany({ data: picked.map((d) => ({ personId, date: new Date(`${d}T00:00:00Z`), fromTime: from, toTime: to })) });
    await tx.auditLog.create({ data: { actorId: personId, action: 'AVAILABILITY_SAVED', recordType: 'Person', recordId: personId, after: { month, days: picked, from, to } } });
  });
  return picked.length;
}
