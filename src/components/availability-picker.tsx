'use client';

import { useState } from 'react';

/** Month grid: tap the days you can work. Days you are already assigned are marked. */
export function AvailabilityPicker({ year, month, today, initial, assigned }: { year: number; month: number; today: string; initial: string[]; assigned: string[] }) {
  const [days, setDays] = useState<Set<string>>(new Set(initial));
  const firstDow = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const iso = (d: number) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const toggle = (k: string) => { const n = new Set(days); if (n.has(k)) n.delete(k); else n.add(k); setDays(n); };
  return (
    <div>
      {[...days].map((d) => <input key={d} type="hidden" name="day" value={d} />)}
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => <span key={i} className="text-xs font-bold">{w}</span>)}
        {Array.from({ length: firstDow }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const k = iso(i + 1);
          const past = k < today;
          const on = days.has(k);
          const busy = assigned.includes(k);
          return (
            <button key={k} type="button" disabled={past} aria-pressed={on} aria-label={`${i + 1}${busy ? ', assigned' : ''}${on ? ', available' : ''}`} onClick={() => toggle(k)}
              className={`flex aspect-square min-h-11 flex-col items-center justify-center rounded-control text-sm font-bold ${busy ? 'bg-ink text-white' : on ? 'bg-cyan text-ink' : 'border border-field bg-white text-ink'} disabled:opacity-35`}>
              {i + 1}
            </button>
          );
        })}
      </div>
      <p className="mt-3 flex flex-wrap gap-4 text-xs"><span><span className="mr-1 inline-block size-3 rounded-sm bg-cyan align-middle" />Available</span><span><span className="mr-1 inline-block size-3 rounded-sm bg-ink align-middle" />Assigned</span></p>
      <p aria-live="polite" className="mt-2 text-sm font-bold text-ink">{days.size} {days.size === 1 ? 'day' : 'days'} selected</p>
    </div>
  );
}
