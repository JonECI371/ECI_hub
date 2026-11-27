'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SELECTED_DATE_EVENT, type SelectedDate } from '@/components/date-picker';

export type Choice = { id: string; label: string; full: boolean };

const btn = 'inline-flex min-h-[52px] items-center justify-center rounded-chip px-5 text-center text-[15px] font-semibold no-underline';

/**
 * The booking button in the side panel. It follows the date chosen in the date picker (calendar or list), so the
 * button goes straight to booking that date. Until a date is chosen it uses the same default the picker starts on.
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
  return (
    <div className="flex flex-col gap-2">
      {c.full ? (
        <Link href={`/waitlist/${c.id}`} className={`${btn} border border-field bg-white text-ink`}>Join the waitlist for {c.label}</Link>
      ) : (
        <Link href={`/book/${c.id}`} className={`${btn} bg-cyan text-ink`}>Book {c.label}</Link>
      )}
      <p className="text-center text-[13px]">Not this date? <a href="#dates">Choose another</a></p>
    </div>
  );
}
