import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { fmtTime } from '@/lib/format';
import { placesLeft } from '@/lib/sessions';
import { addSession } from '../courses/actions';
import { trainerOptions } from '@/lib/trainers';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Calendar', robots: { index: false } };

const TZ = 'Europe/London';
const parts = (d: Date) => {
  const p = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: TZ }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return { y: g('year'), m: g('month'), d: g('day') };
};
const input = 'h-11 rounded-control border border-field bg-white px-3 text-sm text-ink';

type View = 'month' | 'week' | 'day';
const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const dayKey = (d: Date) => { const p = parts(d); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };

export default async function Schedule({ searchParams }: { searchParams: Promise<{ month?: string; trainer?: string; new?: string; view?: string; date?: string }> }) {
  await requireAdmin('/admin/schedule');
  const sp = await searchParams;
  const view: View = sp.view === 'week' || sp.view === 'day' ? sp.view : 'month';
  const now = parts(new Date());
  // The anchor day: ?date=YYYY-MM-DD, else the first of ?month=YYYY-MM, else today.
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sp.date ?? '');
  const mm = /^(\d{4})-(\d{2})$/.exec(sp.month ?? '');
  const anchor = dm ? Date.UTC(+dm[1], +dm[2] - 1, +dm[3]) : mm ? Date.UTC(+mm[1], +mm[2] - 1, 1) : Date.UTC(now.y, now.m - 1, now.d);
  const ad = new Date(anchor);
  const y = ad.getUTCFullYear();
  const m = ad.getUTCMonth() + 1;
  const weekStart = anchor - ((ad.getUTCDay() + 6) % 7) * DAY;
  const [from, to] = view === 'month' ? [Date.UTC(y, m - 1, 1), Date.UTC(y, m, 1)] : view === 'week' ? [weekStart, weekStart + 7 * DAY] : [anchor, anchor + DAY];
  const ym = (yy: number, mo: number) => { const t = yy * 12 + mo - 1; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
  const [sessions, trainers, courses] = await Promise.all([
    db.session.findMany({
      where: { startsAt: { gte: new Date(from - DAY), lt: new Date(to + DAY) }, status: { not: 'CANCELLED' }, trainerId: sp.trainer || undefined },
      include: { course: true, trainer: true, venue: true },
      orderBy: { startsAt: 'asc' },
    }),
    trainerOptions(),
    db.course.findMany({ where: { deliveryType: { not: 'ELEARNING' }, status: { not: 'WITHDRAWN' } }, orderBy: { title: 'asc' } }),
  ]);
  const inRange = sessions.filter((s) => { const k = dayKey(s.startsAt); return k >= iso(from) && k < iso(to); });
  const left = await placesLeft(inRange);
  const byDay = new Map<string, typeof inRange>();
  for (const s of inRange) { const k = dayKey(s.startsAt); byDay.set(k, [...(byDay.get(k) ?? []), s]); }
  // A trainer on two sessions that overlap is a clash.
  const clash = new Set<string>();
  for (const a of inRange) for (const b of inRange) if (a.id < b.id && a.trainerId && a.trainerId === b.trainerId && a.startsAt < b.endsAt && b.startsAt < a.endsAt) { clash.add(a.id); clash.add(b.id); }
  const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Math.ceil((firstDow + days) / 7) * 7;
  const fmt = (o: Intl.DateTimeFormatOptions, t: number) => new Intl.DateTimeFormat('en-GB', { ...o, timeZone: 'UTC' }).format(new Date(t));
  const title = view === 'month' ? fmt({ month: 'long', year: 'numeric' }, anchor) : view === 'week' ? `Week of ${fmt({ day: 'numeric', month: 'long', year: 'numeric' }, weekStart)}` : fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, anchor);
  const monthName = fmt({ month: 'long', year: 'numeric' }, anchor);
  const prev = view === 'month' ? `${ym(y, m - 1)}-01` : iso(anchor - (view === 'week' ? 7 : 1) * DAY);
  const next = view === 'month' ? `${ym(y, m + 1)}-01` : iso(anchor + (view === 'week' ? 7 : 1) * DAY);
  const q = (extra: Record<string, string | undefined>) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ view: view === 'month' ? undefined : view, date: iso(anchor), trainer: sp.trainer, ...extra })) if (v) u.set(k, v); return `/admin/schedule?${u}`; };
  const pill = (s: (typeof inRange)[number]) => `block rounded-chip px-1.5 py-1 text-[11px] font-bold leading-tight no-underline ${clash.has(s.id) ? 'bg-bad-bg text-bad-fg' : s.status === 'PUBLISHED' ? (s.course.deliveryType === 'IN_PERSON' ? 'bg-ink text-white hover:text-white' : 'bg-cyan-tint text-ink') : 'border border-dashed border-field bg-white text-slate'}`;
  const sub = (s: (typeof inRange)[number]) => `${fmtTime(s.startsAt)} · ${s.capacity - (left.get(s.id) ?? 0)}/${s.capacity}${s.trainer ? ` · ${s.trainer.firstName}` : ' · no trainer'}${s.status !== 'PUBLISHED' ? ' · draft' : ''}`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-1.5 text-xs">Admin › Calendar</p><h1 className="text-[30px] font-extrabold tracking-tight text-ink">Calendar</h1></div>
        <form className="flex items-end gap-2">
          <input type="hidden" name="date" value={iso(anchor)} />{view !== 'month' && <input type="hidden" name="view" value={view} />}
          <label className="flex flex-col gap-1 text-xs font-bold">Trainer<select name="trainer" defaultValue={sp.trainer ?? ''} className={input}><option value="">All trainers</option>{trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <button type="submit" className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-4 text-sm font-bold text-ink">Filter</button>
        </form>
      </div>

      {sp.new && /^\d{4}-\d{2}-\d{2}$/.test(sp.new) && (
        <section className="rounded-card bg-white p-6 shadow-card" aria-labelledby="new-h">
          <h2 id="new-h" className="mb-3 text-lg font-extrabold text-ink">New session on {new Date(`${sp.new}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <form action={addSession} className="grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="date" value={sp.new} />
            <label className="flex flex-col gap-1 text-xs font-bold sm:col-span-2">Course<select name="courseId" required className={input}>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-xs font-bold">Starts<input type="time" name="start" defaultValue="09:00" className={input} /></label>
            <label className="flex flex-col gap-1 text-xs font-bold">Ends<input type="time" name="end" defaultValue="16:30" className={input} /></label>
            <label className="flex flex-col gap-1 text-xs font-bold">Days<input type="number" name="days" min={1} max={10} defaultValue={1} className={input} /></label>
            <label className="flex flex-col gap-1 text-xs font-bold">Trainer<select name="trainerId" defaultValue={sp.trainer ?? ''} className={input}><option value="">Not yet</option>{trainers.map((t) => <option key={t.id} value={t.id} disabled={!!t.block}>{t.name}{t.block ? ` (${t.block.toLowerCase()})` : ''}</option>)}</select></label>
            <label className="flex min-h-11 items-center gap-2 self-end text-sm text-ink"><input type="checkbox" name="publish" className="size-5 accent-ink" />Publish now</label>
            <div className="flex items-end gap-2"><button type="submit" className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-4 text-sm font-bold text-ink">Add session</button><Link href={q({ new: undefined })} className="inline-flex min-h-11 items-center text-sm">Cancel</Link></div>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-card bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="flex items-center gap-3">
            <Link href={q({ date: prev })} aria-label={`Previous ${view}`} className="inline-flex size-11 items-center justify-center rounded-control border border-field text-ink no-underline">←</Link>
            <h2 className="text-xl font-extrabold text-ink">{title}</h2>
            <Link href={q({ date: next })} aria-label={`Next ${view}`} className="inline-flex size-11 items-center justify-center rounded-control border border-field text-ink no-underline">→</Link>
          </div>
          <nav aria-label="Calendar view" className="flex rounded-control border border-field p-0.5">
            {(['month', 'week', 'day'] as View[]).map((v) => <Link key={v} href={q({ view: v === 'month' ? undefined : v })} aria-current={v === view ? 'page' : undefined} className={`inline-flex min-h-10 items-center rounded-[6px] px-4 text-sm font-bold capitalize no-underline ${v === view ? 'bg-ink text-white hover:text-white' : 'text-ink'}`}>{v}</Link>)}
          </nav>
        </div>
        {clash.size > 0 && <p role="alert" className="bg-bad-bg px-5 py-3 text-sm font-semibold text-bad-fg">{clash.size} sessions clash: the same trainer is booked at the same time. They are marked in red.</p>}
        {view === 'month' && (
        <div className="relative overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-7 border-b border-hairline bg-[#FAFAFA]">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d} className="p-2.5 text-xs font-extrabold uppercase tracking-[0.06em]">{d}</span>)}</div>
            <div className="grid grid-cols-7 gap-px bg-[#E6E6E6]">
              {Array.from({ length: cells }, (_, i) => {
                const d = i - firstDow + 1;
                const ok = d >= 1 && d <= days;
                const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                return (
                  <div key={i} className={`min-h-[120px] p-2 ${ok ? 'bg-white' : 'bg-page'}`}>
                    {ok && (
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[13px] font-bold text-ink">{d}</span>
                        <Link href={q({ new: key })} aria-label={`Add a session on ${d} ${monthName}`} className="flex size-7 items-center justify-center rounded-chip text-slate no-underline hover:bg-page">+</Link>
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      {(ok ? byDay.get(key) ?? [] : []).map((s) => (
                        <Link key={s.id} href={`/admin/courses/${s.courseId}?session=${s.id}`} className={pill(s)}>
                          {s.course.title}
                          <span className="block font-semibold">{sub(s)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        )}
        {view === 'week' && (
          <div className="relative overflow-x-auto">
            <div className="grid min-w-[860px] grid-cols-7 gap-px bg-[#E6E6E6]">
              {Array.from({ length: 7 }, (_, i) => {
                const t = weekStart + i * DAY;
                const key = iso(t);
                return (
                  <div key={key} className="min-h-[360px] bg-white p-2">
                    <div className="mb-2 flex items-center justify-between">
                      <Link href={q({ view: 'day', date: key })} className="text-[13px] font-bold">{fmt({ weekday: 'short', day: 'numeric', month: 'short' }, t)}</Link>
                      <Link href={q({ new: key })} aria-label={`Add a session on ${fmt({ day: 'numeric', month: 'long' }, t)}`} className="flex size-7 items-center justify-center rounded-chip text-slate no-underline hover:bg-page">+</Link>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {(byDay.get(key) ?? []).map((s) => (
                        <Link key={s.id} href={`/admin/courses/${s.courseId}?session=${s.id}`} className={`${pill(s)} !py-2 !text-xs`}>
                          {s.course.title}
                          <span className="block font-semibold">{fmtTime(s.startsAt)} to {fmtTime(s.endsAt)}</span>
                          <span className="block font-semibold">{s.capacity - (left.get(s.id) ?? 0)}/{s.capacity} booked · {s.trainer ? s.trainer.firstName : 'no trainer'}{s.status !== 'PUBLISHED' ? ' · draft' : ''}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {view === 'day' && (
          <div>
            {(byDay.get(iso(anchor)) ?? []).length === 0 ? <p className="px-6 py-8 text-sm">Nothing scheduled. <Link href={q({ new: iso(anchor) })}>Add a session on this day</Link>.</p> : (
              <ul>
                {(byDay.get(iso(anchor)) ?? []).map((s) => (
                  <li key={s.id} className={`flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-6 py-4 text-sm last:border-0 ${clash.has(s.id) ? 'bg-bad-bg' : ''}`}>
                    <div>
                      <p className="font-extrabold text-ink"><Link href={`/admin/courses/${s.courseId}?session=${s.id}`}>{s.course.title}</Link></p>
                      <p>{fmtTime(s.startsAt)} to {fmtTime(s.endsAt)} · {s.course.deliveryType === 'IN_PERSON' ? s.venue?.name ?? 'Venue to be confirmed' : s.course.deliveryType === 'VIRTUAL_CLASSROOM' ? 'Virtual classroom' : 'eLearning'}</p>
                      {clash.has(s.id) && <p className="font-bold text-bad-fg">Clash: this trainer is on another session at the same time.</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-ink">{s.capacity - (left.get(s.id) ?? 0)} of {s.capacity} booked</p>
                      <p>{s.trainer ? `${s.trainer.firstName} ${s.trainer.lastName}` : 'No trainer yet'}{s.status !== 'PUBLISHED' ? ' · draft' : ''}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-hairline px-6 py-3 text-sm"><Link href={q({ new: iso(anchor) })}>+ Add a session on this day</Link></p>
          </div>
        )}
      </section>
    </>
  );
}
