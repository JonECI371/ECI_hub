import 'server-only';
import { db } from '@/lib/db';
import { sendRegistrationReminders, sendSessionReminder } from '@/lib/notifications';
import { offerFreedPlaces } from '@/lib/waitlist';

const H = 3600000;
const within = (fromMs: number, toMs: number) => ({ gte: new Date(Date.now() + fromMs), lt: new Date(Date.now() + toMs) });

/**
 * Scheduled work, every 5 minutes. Each email is sent once (checked against the email log),
 * so overlapping windows and restarts are safe. A Postgres advisory lock means only one copy
 * of the app runs the jobs at a time.
 */
export async function runJobs(): Promise<Record<string, number>> {
  const got = await db.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_lock(424242) AS ok`;
  if (!got[0]?.ok) return { skipped: 1 };
  const done: Record<string, number> = { day: 0, hour: 0, registration: 0, waitlist: 0 };
  try {
    const live = { status: { in: ['PUBLISHED', 'FULL'] as ('PUBLISHED' | 'FULL')[] } };
    for (const s of await db.session.findMany({ where: { ...live, startsAt: within(20 * H, 26 * H) }, select: { id: true } })) { await sendSessionReminder(s.id, 'DAY'); done.day++; }
    for (const s of await db.session.findMany({ where: { ...live, startsAt: within(40 * 60000, 80 * 60000) }, select: { id: true } })) { await sendSessionReminder(s.id, 'HOUR'); done.hour++; }
    for (const s of await db.session.findMany({ where: { ...live, startsAt: within(4.5 * 24 * H, 5.5 * 24 * H) }, select: { id: true } })) { await sendRegistrationReminders(s.id); done.registration++; }
    // Expired waitlist offers pass to the next person; freed places are offered.
    const waiting = await db.waitlistEntry.findMany({ where: { session: { status: 'PUBLISHED', startsAt: { gt: new Date() } } }, distinct: ['sessionId'], select: { sessionId: true } });
    for (const w of waiting) done.waitlist += await offerFreedPlaces(w.sessionId);
  } catch (err) {
    console.error('[jobs] failed', err);
    await db.task.create({ data: { type: 'INTEGRATION_FAILURE', title: 'Scheduled reminders failed', detail: String((err as Error).message).slice(0, 500), recordType: 'System', recordId: 'jobs' } });
  } finally {
    await db.$queryRaw`SELECT pg_advisory_unlock(424242)`;
  }
  return done;
}

let started = false;
export function startJobs() {
  if (started) return;
  started = true;
  const tick = () => runJobs().then((r) => { if (Object.values(r).some((n) => n > 0)) console.info('[jobs]', r); }).catch((e) => console.error('[jobs]', e));
  setTimeout(tick, 30000);
  setInterval(tick, 5 * 60000);
  console.info('[jobs] scheduled every 5 minutes');
}
