import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePerson } from '@/lib/auth';
import { AvailabilityPicker } from '@/components/availability-picker';
import { availability } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My availability', robots: { index: false } };

const input = 'h-11 w-full rounded-control border border-field bg-white px-3 text-sm text-ink';

export default async function Availability({ searchParams }: { searchParams: Promise<{ month?: string; saved?: string; error?: string }> }) {
  const me = await requirePerson(['TRAINER'], '/trainer');
  const sp = await searchParams;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const ym = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? sp.month! : today.slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const shift = (n: number) => { const t = y * 12 + m - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
  const from = new Date(Date.UTC(y, m - 1, 1)), to = new Date(Date.UTC(y, m, 1));
  const [rows, sessions] = await Promise.all([
    db.availability.findMany({ where: { personId: me.id, date: { gte: from, lt: to } }, orderBy: { date: 'asc' } }),
    db.session.findMany({ where: { trainerId: me.id, status: { not: 'CANCELLED' }, startsAt: { lt: to }, endsAt: { gte: from } }, select: { startsAt: true, endsAt: true } }),
  ]);
  const assigned = new Set<string>();
  for (const s of sessions) for (let t = new Date(s.startsAt.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) + 'T00:00:00Z'); t <= s.endsAt; t = new Date(t.getTime() + 86400000)) assigned.add(t.toISOString().slice(0, 10));
  const title = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)));

  return (
    <>
      <div><Link href="/trainer" className="text-sm">← My sessions</Link><h1 className="mt-2 text-[26px] font-extrabold tracking-tight text-ink">My availability</h1></div>
      {sp.saved && <p role="status" className="rounded-control bg-cyan-soft px-4 py-3 text-sm font-semibold text-ink">Saved. ECI can now schedule you on these days.</p>}
      {sp.error && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">{sp.error}</p>}
      <form action={availability} className="flex flex-col gap-5">
        <input type="hidden" name="month" value={ym} />
        <section className="rounded-card bg-white p-5 shadow-card" aria-labelledby="s1">
          <p className="text-xs font-bold uppercase tracking-[0.08em]">Step 1</p>
          <h2 id="s1" className="mb-3 text-lg font-extrabold text-ink">Tap the days you can work</h2>
          <div className="mb-3 flex items-center justify-between">
            <Link href={`/trainer/availability?month=${shift(-1)}`} aria-label="Previous month" className="inline-flex size-11 items-center justify-center rounded-control border border-field text-ink no-underline">←</Link>
            <p className="font-extrabold text-ink">{title}</p>
            <Link href={`/trainer/availability?month=${shift(1)}`} aria-label="Next month" className="inline-flex size-11 items-center justify-center rounded-control border border-field text-ink no-underline">→</Link>
          </div>
          <AvailabilityPicker key={ym} year={y} month={m} today={today} initial={rows.map((r) => r.date.toISOString().slice(0, 10))} assigned={[...assigned]} />
        </section>
        <section className="rounded-card bg-white p-5 shadow-card" aria-labelledby="s2">
          <p className="text-xs font-bold uppercase tracking-[0.08em]">Step 2</p>
          <h2 id="s2" className="mb-3 text-lg font-extrabold text-ink">Set your times</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-bold text-ink">From<input type="time" name="from" defaultValue={rows[0]?.fromTime ?? '08:00'} className={input} /></label>
            <label className="flex flex-col gap-1 text-sm font-bold text-ink">To<input type="time" name="to" defaultValue={rows[0]?.toTime ?? '17:00'} className={input} /></label>
          </div>
          <p className="mt-2 text-[13px]">Applies to every selected day this month.</p>
        </section>
        <button type="submit" className="inline-flex min-h-[52px] items-center justify-center rounded-chip bg-cyan px-6 font-bold text-ink">Save availability</button>
      </form>
    </>
  );
}
