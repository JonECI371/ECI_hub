'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';

type Result = { slug: string; title: string; meta: string };

/** Home page course finder: results appear as you type. */
export function CourseSearch() {
  const id = useId();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/courses/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: { results: Result[] }) => {
          setResults(d.results);
          setSearched(true);
        })
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  return (
    <div className="relative mt-9 max-w-[560px]">
      <label htmlFor={id} className="mb-2 block text-[13px] text-white/70">Find a course</label>
      <input
        id={id}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Try CompEx, water hygiene, DSEAR"
        autoComplete="off"
        aria-controls={`${id}-results`}
        className="h-[52px] w-full rounded-chip border-0 bg-white px-4 text-[15px] text-ink"
      />
      <div id={`${id}-results`} aria-live="polite">
        {searched && (
          <div className="absolute inset-x-0 top-[86px] z-10 overflow-hidden rounded-control border border-field bg-white shadow-[0_12px_32px_rgba(0,0,0,0.25)]">
            {results.length === 0 ? (
              <p className="px-4 py-3.5 text-sm text-slate">No courses match &ldquo;{q.trim()}&rdquo;. <Link href="/courses">See all courses</Link></p>
            ) : (
              <ul>
                {results.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/courses/${r.slug}`} className="flex min-h-11 justify-between gap-3 border-b border-hairline px-4 py-3.5 text-sm text-ink no-underline last:border-0 hover:bg-page">
                      <span className="font-semibold">{r.title}</span>
                      <span className="shrink-0 text-[13px] text-slate">{r.meta}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
