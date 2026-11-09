'use client';

import { useState } from 'react';

/** Copies text to the clipboard, e.g. an enrolment pack to paste into a provider platform. */
export function CopyButton({ text, label = 'Copy all' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState('ok');
        } catch {
          setState('fail');
        }
        setTimeout(() => setState('idle'), 2000);
      }}
      className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-4 text-sm font-bold text-ink"
    >
      <span aria-live="polite">{state === 'ok' ? 'Copied' : state === 'fail' ? 'Copy failed' : label}</span>
    </button>
  );
}
