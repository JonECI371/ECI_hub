'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

export type PickerSession = {
  id: string;
  y: number;
  m: number; // 1-12, UK time
  d: number;
  long: string; // "Tuesday 24 November 2026"
  time: string; // "09:00 to 12:30"
  where: string;
  full: boolean;
  places: { text: string; low: boolean } | null;
};

const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const key = (y: number, m: number) => y * 12 + (m - 1);

function Action({ s }: { s: PickerSession }) {
  return s.full ? (
    <Link href={`/waitlist/${s.id}`} className="inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-chip border border-field bg-white px-5 text-sm font-semibold text-ink no-underline">Join waitlist</Link>
  ) : (
    <Link href={`/book/${s.id}`} className="inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-chip bg-cyan px-5 text-sm font-semibold text-ink no-underline">Book</Link>
  );
}

function Places({ s }: { s: PickerSession }) {
  if (s.full) return <span className="text-[13px] font-semibold text-slate">Full</span>;
  if (!s.places) return null;
  return <span className={`text-[13px] ${s.places.low ? 'font-semibold text-warn-fg' : 'text-slate'}`}>{s.places.text}</span>;
}

/** Course page date chooser: month calendar, the selected date, and the full list. */
export function DatePicker({ sessions, initialId }: { sessions: PickerSession[]; initialId?: string }) {
  const first = sessions.find((s) => s.id === initialId) ?? sessions.find((s) => !s.full) ?? sessions[0];
  const [selId, setSelId] = useState(first.id);
  const months = useMemo(() => [...new Set(sessions.map((s) => key(s.y, s.m)))].sort((a, b) => a - b), [sessions]);
  const [monthKey, setMonthKey] = useState(key(first.y, first.m));
  const sel = sessions.find((s) => s.id === selId) ?? first;

  const y = Math.floor(monthKey / 12);
  const m = (monthKey % 12) + 1;
  const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Math.ceil((firstDow + days) / 7) * 7;
  const idx = months.indexOf(monthKey);

  const pick = (s: PickerSession) => {
    setSelId(s.id);
    setMonthKey(key(s.y, s.m));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-card bg-white p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" aria-label="Previous month" disabled={idx <= 0} onClick={() => setMonthKey(months[idx - 1])} className="size-11 rounded-control border border-field bg-white text-ink disabled:opacity-40">←</button>
            <h3 className="text-lg font-bold text-ink" aria-live="polite">{MONTH[m - 1]} {y}</h3>
            <button type="button" aria-label="Next month" disabled={idx >= months.length - 1} onClick={() => setMonthKey(months[idx + 1])} className="size-11 rounded-control border border-field bg-white text-ink disabled:opacity-40">→</button>
          </div>
          <div className="grid grid-cols-7 gap-y-1.5 text-center">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span key={d} className="pb-1 text-xs font-bold uppercase text-slate">{d}</span>
            ))}
            {Array.from({ length: cells }, (_, i) => {
              const n = i - firstDow + 1;
              const inMonth = n >= 1 && n <= days;
              const s = inMonth ? sessions.find((x) => x.y === y && x.m === m && x.d === n) : undefined;
              const on = s?.id === sel.id;
              return (
                <div key={i} className="flex h-11 items-center justify-center">
                  {s ? (
                    <button
                      type="button"
                      onClick={() => pick(s)}
                      aria-pressed={on}
                      aria-label={`${s.long}, ${s.time}${s.full ? ', full' : ''}`}
                      className={`size-[42px] rounded-full text-sm font-bold ${on ? 'bg-ink text-white' : s.full ? 'border border-hairline bg-white text-slate line-through' : 'border-2 border-cyan bg-cyan-soft text-ink'}`}
                    >
                      {n}
                    </button>
                  ) : (
                    <span className={`text-sm ${inMonth ? 'text-slate' : ''}`}>{inMonth ? n : ''}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 border-t border-hairline pt-3 text-xs">
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-full border-2 border-cyan bg-cyan-soft" />Course date</span>
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-full border border-hairline bg-white" />Full</span>
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-full bg-ink" />Selected</span>
          </div>
        </div>

        <div aria-live="polite" className="flex flex-col justify-center gap-3 rounded-card bg-white p-6 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate">Selected date</p>
          <p className="text-xl font-semibold text-ink">{sel.long}</p>
          <p className="text-sm">{sel.time} UK time · {sel.where}</p>
          <Places s={sel} />
          <div className="pt-1"><Action s={sel} /></div>
        </div>
      </div>

      <div className="overflow-hidden rounded-card bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h3 className="text-lg font-bold text-ink">All upcoming dates</h3>
          <span className="text-[13px]">{sessions.length} upcoming {sessions.length === 1 ? 'date' : 'dates'}</span>
        </div>
        <ul>
          {sessions.map((s) => {
            const on = s.id === sel.id;
            return (
              <li key={s.id} className={`flex flex-wrap items-center gap-4 border-b border-[#E6E6E6] px-5 py-4 last:border-0 ${on ? 'bg-cyan-soft shadow-[inset_4px_0_0_#2EC39B]' : 'bg-white'}`}>
                <button type="button" onClick={() => pick(s)} aria-pressed={on} className="min-h-11 flex-1 text-left">
                  <span className="block text-[15px] font-bold text-ink">{s.long}</span>
                  <span className="block text-[13px]">{s.time} UK time · {s.where}</span>
                  <Places s={s} />
                </button>
                <Action s={s} />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
