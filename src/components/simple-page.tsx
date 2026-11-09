import Link from 'next/link';

/** A short message page: 404, coming soon, expired links. */
export function SimplePage({ eyebrow, title, children, actions }: { eyebrow: string; title: string; children: React.ReactNode; actions: [string, string, boolean?][] }) {
  return (
    <div className="flex flex-1 justify-center px-4 py-16 md:py-24">
      <section className="w-full max-w-[600px] rounded-card bg-white p-8 shadow-card md:p-10">
        <p className="mb-2.5 text-xs font-extrabold uppercase tracking-[0.1em] text-ink">{eyebrow}</p>
        <h1 className="mb-3 text-[32px] font-extrabold leading-tight tracking-tight text-ink">{title}</h1>
        <div className="mb-7 leading-relaxed">{children}</div>
        <div className="flex flex-wrap gap-3">
          {actions.map(([label, href, secondary]) => (
            <Link key={href} href={href} className={`inline-flex min-h-11 items-center rounded-chip px-5 font-bold no-underline ${secondary ? 'border border-field bg-white text-ink' : 'bg-cyan text-ink'}`}>{label}</Link>
          ))}
        </div>
      </section>
    </div>
  );
}
