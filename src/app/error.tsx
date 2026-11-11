'use client';

import Link from 'next/link';

/** Shown instead of a raw error. Never shows technical detail to the visitor. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-1 justify-center px-4 py-16">
      <section className="w-full max-w-[560px] rounded-card bg-white p-9 shadow-card" role="alert">
        <h1 className="mb-3 text-[28px] font-extrabold text-ink">Something went wrong</h1>
        <p className="mb-2 leading-relaxed">That page did not load properly. Nothing you entered has been lost or charged. Try again, and if it keeps happening call us on +44 (0) 1932 963463.</p>
        {error.digest && <p className="mb-6 text-xs">Reference for our team: {error.digest}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-5 font-bold text-ink">Try again</button>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-5 font-bold text-ink no-underline">Go to the home page</Link>
        </div>
      </section>
    </div>
  );
}
