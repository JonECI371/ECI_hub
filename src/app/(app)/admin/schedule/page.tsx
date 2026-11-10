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

export default async function Schedule({ searchParams }: { searchParams: Promise<{ month?: string; trainer?: string; new?: string }> }) {
  await requireAdmin('/admin/schedule');
  const sp = await searchParams;
  const now = parts(new Date());
  const mm = /^(\d{4})-(\d{2})$/.exec(sp.month ?? '');
  const y = mm ? +mm[1] : now.y;
  const m = mm ? +mm[2] : now.m;
  const ym = (yy: number, mo: number) => { const t = yy * 12 + mo - 1; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
  const [sessions, trainers, courses] = await Promise.all([
    db.session.findMany({
      where: { startsAt: { gte: new Date(Date.UTC(y, m - 1, 1) - 86400000), lt: new Date(Date.UTC(y, m, 1) + 86400000) }, status: { not: 'CANCELLED' }, trainerId: sp.trainer || undefined },
      include: { course: true, trainer: true },
      orderBy: { startsAt: 'asc' },
    }),
    trainerOptions(),
    db.course.findMany({ where: { deliveryType: { not: 'ELEARNING' }, status: { not: 'WITHDRAWN' } }, orderBy: { title: 'asc' } }),
  ]);
  const inMonth = sessions.filter((s) => { const p = parts(s.startsAt); return p.y === y && p.m === m; });
  const left = await placesLeft(inMonth);
  const byDay = new Map<number, typeof inMonth>();
  for (const s of inMonth) { const d = parts(s.startsAt).d; byDay.set(d, [...(byDay.get(d) ?? []), s]); }
  // A trainer on two sessions that overlap is a clash.
  const clash = new Set<string>();
  for (const a of inMonth) for (const b of inMonth) if (a.id < b.id && a.trainerId && a.trainerId === b.trainerId && a.startsAt < b.endsAt && b.startsAt < a.endsAt) { clash.add(a.id); clash.add(b.id); }
  const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Math.ceil((firstDow + days) / 7) * 7;
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)));
  const q = (extra: Record<string, string | undefined>) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ month: ym(y, m), trainer: sp.trainer, ...extra })) if (v) u.set(k, v); return `/admin/schedule?${u}`; };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-1.5 text-xs">Admin › Calendar</p><h1 className="text-[30px] font-extrabold tracking-tight text-ink">Calendar</h1></div>
        <form className="flex items-end gap-2">
          <input type="hidden" name="month" value={ym(y, m)} />
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
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <Link href={q({ month: ym(y, m - 1) })} aria-label="Previous month" className="inline-flex size-11 items-center justify-center rounded-control border border-field text-ink no-underline">←</Link>
          <h2 className="text-xl font-extrabold text-ink">{monthName}</h2>
          <Link href={q({ month: ym(y, m + 1) })} aria-label="Next month" className="inline-flex size-11 items-center justify-center rounded-control border border-field text-ink no-underline">→</Link>
        </div>
        {clash.size > 0 && <p role="alert" className="bg-bad-bg px-5 py-3 text-sm font-semibold text-bad-fg">{clash.size} sessions clash: the same trainer is booked at the same time. They are marked in red.</p>}
        <div className="relative overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-7 border-b border-hairline bg-[#FAFAFA]">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d} className="p-2.5 text-xs font-extrabold uppercase tracking-[0.06em]">{d}</span>)}</div>
            <div className="grid grid-cols-7 gap-px bg-[#E6E6E6]">
              {Array.from({ length: cells }, (_, i) => {
                const d = i - firstDow + 1;
                const ok = d >= 1 && d <= days;
                const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                return (
                  <div key={i} className={`min-h-[120px] p-2 ${ok ? 'bg-white' : 'bg-page'}`}>
                    {ok && (
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[13px] font-bold text-ink">{d}</span>
                        <Link href={q({ new: iso })} aria-label={`Add a session on ${d} ${monthName}`} className="flex size-7 items-center justify-center rounded-chip text-slate no-underline hover:bg-page">+</Link>
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      {(ok ? byDay.get(d) ?? [] : []).map((s) => (
                        <Link key={s.id} href={`/admin/courses/${s.courseId}?session=${s.id}`} className={`block rounded-chip px-1.5 py-1 text-[11px] font-bold leading-tight no-underline ${clash.has(s.id) ? 'bg-bad-bg text-bad-fg' : s.status === 'PUBLISHED' ? (s.course.deliveryType === 'IN_PERSON' ? 'bg-ink text-white hover:text-white' : 'bg-cyan-tint text-ink') : 'border border-dashed border-field bg-white text-slate'}`}>
                          {s.course.title}
                          <span className="block font-semibold">{fmtTime(s.startsAt)} · {s.capacity - (left.get(s.id) ?? 0)}/{s.capacity}{s.trainer ? ` · ${s.trainer.firstName}` : ' · no trainer'}{s.status !== 'PUBLISHED' ? ' · draft' : ''}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
