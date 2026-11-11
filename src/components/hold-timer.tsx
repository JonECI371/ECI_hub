'use client';

import { useEffect, useState } from 'react';

/** Counts down the place hold. */
export function HoldTimer({ expiresAt }: { expiresAt: string }) {
  const end = new Date(expiresAt).getTime();
  const [left, setLeft] = useState(() => Math.max(0, end - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, end - Date.now())), 1000);
    return () => clearInterval(t);
  }, [end]);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  if (left === 0) return <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">Your hold has ended. Go back and start again to check places.</p>;
  return (
    <p className="rounded-control bg-cyan-soft px-4 py-3 text-sm text-ink">
      Your places are held for <strong className="tabular-nums">{m}:{String(s).padStart(2, '0')}</strong>.
      {m < 2 && <span className="sr-only" aria-live="polite"> Less than two minutes left.</span>}
    </p>
  );
}
