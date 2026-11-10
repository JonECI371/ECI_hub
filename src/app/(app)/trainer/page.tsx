import Link from 'next/link';
import type { Metadata } from 'next';
import { requirePerson } from '@/lib/auth';
import { fmtTime } from '@/lib/format';
import { myTrainerSessions } from '@/lib/trainer-app';
import { conflict } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My sessions', robots: { index: false } };

const TZ = 'Europe/London';
const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const btn = 'inline-flex min-h-11 items-center justify-center rounded-chip px-4 text-sm font-bold no-underline';
const where = (s: { venue: { name: string; address: string } | null; course: { deliveryType: string; meetingPlatform: string | null } }) =>
  s.course.deliveryType === 'IN_PERSON' ? (s.venue ? `${s.venue.name}, ${s.venue.address.split(',').pop()!.trim()}` : 'Venue to be confirmed') : s.course.meetingPlatform === 'ZOOM' ? 'Zoom' : 'Microsoft Teams';

export default async function TrainerSessions({ searchParams }: { searchParams: Promise<{ flagged?: string; error?: string }> }) {
  const me = await requirePerson(['TRAINER'], '/trainer');
  const { flagged, error } = await searchParams;
  const sessions = await myTrainerSessions(me.id);
  const today = day(new Date());
  // "Today" covers multi-day courses: started on or before today, ending today or later.
  const now = sessions.filter((s) => day(s.startsAt) <= today && day(s.endsAt) >= today);
  const later = sessions.filter((s) => day(s.startsAt) > today);
  const count = (s: (typeof sessions)[number]) => s.bookings.reduce((n, b) => n + b.places, 0);
  const dayOf = (s: (typeof sessions)[number]) => Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${day(s.startsAt)}T00:00:00Z`).getTime()) / 86400000) + 1;
  const days = (s: (typeof sessions)[number]) => Math.round((new Date(`${day(s.endsAt)}T00:00:00Z`).getTime() - new Date(`${day(s.startsAt)}T00:00:00Z`).getTime()) / 86400000) + 1;

  return (
    <>
      <div><p className="mb-1 text-xs font-bold uppercase tracking-[0.08em]">Trainer</p><h1 className="text-[28px] font-extrabold tracking-tight text-ink">My sessions</h1></div>
      {flagged && <p role="status" className="rounded-control bg-cyan-soft px-4 py-3 text-sm font-semibold text-ink">Thanks. The office has a task to sort it out and will be in touch.</p>}
      {error && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">{error}</p>}

      {now.map((s) => (
        <section key={s.id} aria-label="Today" className="rounded-card bg-ink p-6 text-white shadow-card">
          <p className="mb-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-cyan">Today · {s.startsAt < new Date() ? 'started' : 'starts'} {fmtTime(s.startsAt)}</p>
          <h2 className="mb-1 text-[22px] font-extrabold">{s.course.title}</h2>
          <p className="mb-4 text-sm text-white/80">{days(s) > 1 ? `Day ${dayOf(s)} of ${days(s)} · ` : ''}{where(s)} · {count(s)} {count(s) === 1 ? 'delegate' : 'delegates'}</p>
          <Link href={`/trainer/sessions/${s.id}`} className={`${btn} bg-cyan text-ink`}>Mark attendance</Link>
        </section>
      ))}

      <section aria-labelledby="up-h" className="overflow-hidden rounded-card bg-white shadow-card">
        <h2 id="up-h" className="border-b border-hairline px-5 py-4 text-lg font-extrabold text-ink">Coming up</h2>
        {later.length === 0 ? <p className="px-5 py-6 text-sm">Nothing else assigned yet. Keep your <Link href="/trainer/availability">availability</Link> up to date so the office can schedule you.</p> : (
          <ul>
            {later.map((s) => (
              <li key={s.id} className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-4 border-b border-hairline px-5 py-4 last:border-0">
                <div className="text-center"><p className="text-xl font-extrabold leading-none text-ink">{s.startsAt.toLocaleDateString('en-GB', { day: 'numeric', timeZone: TZ })}</p><p className="text-xs">{s.startsAt.toLocaleDateString('en-GB', { month: 'short', timeZone: TZ })}</p></div>
                <div className="min-w-0">
                  <Link href={`/trainer/sessions/${s.id}`} className="font-bold">{s.course.title}</Link>
                  <p className="text-[13px]">{fmtTime(s.startsAt)} UK time · {where(s)}{days(s) > 1 ? ` · ${days(s)} days` : ''}</p>
                  <p className="text-[13px]">{count(s) ? `${count(s)} ${count(s) === 1 ? 'delegate' : 'delegates'}` : '0 delegates yet'}{s.status === 'DRAFT' ? ' · not published yet' : ''}</p>
                  <details className="mt-1">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-ink underline decoration-cyan decoration-2 underline-offset-[3px]">Flag a conflict</summary>
                    <form action={conflict} className="mt-2 flex flex-col gap-2">
                      <input type="hidden" name="sessionId" value={s.id} />
                      <label className="text-sm font-bold text-ink">What&apos;s the problem?<textarea name="note" required maxLength={500} rows={3} placeholder="For example: I'm on another job that week." className="mt-1 w-full rounded-control border border-field px-3 py-2 text-sm font-normal" /></label>
                      <button type="submit" className={`${btn} w-fit border border-field bg-white text-ink`}>Send to the office</button>
                    </form>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
