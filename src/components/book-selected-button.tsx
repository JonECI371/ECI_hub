'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SELECTED_DATE_EVENT, type SelectedDate } from '@/components/date-picker';

export type Choice = { id: string; label: string; long: string; time: string; where: string; full: boolean; places: { text: string; low: boolean } | null };

const btn = 'inline-flex min-h-[52px] items-center justify-center rounded-chip px-5 text-center text-[15px] font-semibold no-underline';

/**
 * The side panel for the date chosen in the date picker: the one place that says which date it is, how many places are
 * left, and the Book button. On a phone the button is a bar fixed to the bottom of the screen.
 */
export function BookSelectedButton({ choices, initialId }: { choices: Choice[]; initialId?: string }) {
  const first = choices.find((c) => c.id === initialId) ?? choices.find((c) => !c.full) ?? choices[0];
  const [id, setId] = useState(first.id);
  useEffect(() => {
    const w = window as unknown as { __eciSelectedDate?: SelectedDate };
    if (w.__eciSelectedDate && choices.some((c) => c.id === w.__eciSelectedDate!.id)) setId(w.__eciSelectedDate.id);
    const on = (e: Event) => { const d = (e as CustomEvent<SelectedDate>).detail; if (choices.some((c) => c.id === d.id)) setId(d.id); };
    window.addEventListener(SELECTED_DATE_EVENT, on);
    return () => window.removeEventListener(SELECTED_DATE_EVENT, on);
  }, [choices]);
  const c = choices.find((x) => x.id === id) ?? first;
  const href = c.full ? `/waitlist/${c.id}` : `/book/${c.id}`;
  const text = c.full ? `Join the waitlist for ${c.label}` : `Book ${c.label}`;
  const look = c.full ? 'border border-field bg-white text-ink' : 'bg-cyan text-ink';
  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite" className="rounded-control bg-page px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate">Your date</p>
        <p className="text-base font-bold text-ink">{c.long}</p>
        <p className="text-sm">{c.time} UK time · {c.where}</p>
        {c.full ? <p className="text-[13px] font-semibold text-slate">Full</p> : c.places && <p className={`text-[13px] ${c.places.low ? 'font-semibold text-warn-fg' : 'text-slate'}`}>{c.places.text}</p>}
      </div>
      <Link href={href} className={`${btn} ${look} hidden lg:inline-flex`}>{text}</Link>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-white px-4 pb-[max(12px,env(safe-area-inset-bottom,0px))] pt-3 shadow-card lg:hidden">
        <Link href={href} className={`${btn} ${look} w-full`}>{text}</Link>
      </div>
      <p className="text-center text-[13px]">Not this date? <a href="#dates">Choose another</a></p>
    </div>
  );
}
