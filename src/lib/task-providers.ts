import 'server-only';
import { db } from '@/lib/db';

/** E-learning providers (for example EUSR QuartzWeb, Trainor, SkillGuard), taken from the courses, with how many open enrolment tasks each has. */
export async function enrolmentProviders(): Promise<{ provider: string; open: number }[]> {
  const fromCourses = await db.course.findMany({ where: { deliveryType: 'ELEARNING', provider: { not: null } }, select: { provider: true }, distinct: ['provider'] });
  const open = await db.task.findMany({ where: { type: 'ELEARNING_ENROLMENT', status: 'OPEN' }, select: { recordId: true } });
  const attendees = open.length
    ? await db.attendee.findMany({ where: { id: { in: open.map((t) => t.recordId) } }, select: { booking: { select: { course: { select: { provider: true } } } } } })
    : [];
  const counts = new Map<string, number>();
  for (const a of attendees) {
    const p = a.booking.course.provider;
    if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const names = new Set([...fromCourses.map((c) => c.provider as string), ...counts.keys()]);
  return [...names].sort((a, b) => a.localeCompare(b)).map((provider) => ({ provider, open: counts.get(provider) ?? 0 }));
}

/** Ids of everyone booked on a course from this provider: the records that enrolment tasks point at. */
export async function attendeeIdsForProvider(provider: string): Promise<string[]> {
  return (await db.attendee.findMany({ where: { booking: { course: { provider } } }, select: { id: true } })).map((a) => a.id);
}
