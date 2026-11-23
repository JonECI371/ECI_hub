// Design system v2 primitives. Every screen is built from these; add new ones here, not inline.
import Link from 'next/link';
import type { DeliveryType } from '@prisma/client';
import { DELIVERY_LABEL } from '@/lib/format';

const ICONS: Record<DeliveryType, string> = {
  ELEARNING: 'M4 5h16v11H4zM2 19h20',
  VIRTUAL_CLASSROOM: 'M2 6h14v12H2zM16 10l6-3v10l-6-3z',
  IN_PERSON: 'M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12zM12 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5',
};
const TINT: Record<DeliveryType, string> = {
  ELEARNING: 'bg-elearn text-ink',
  VIRTUAL_CLASSROOM: 'bg-cyan-tint text-ink',
  IN_PERSON: 'bg-strong text-strong-fg',
};

export function DeliveryChip({ type }: { type: DeliveryType }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-chip px-2.5 py-1 text-xs font-bold ${TINT[type]}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ICONS[type]} />
      </svg>
      {DELIVERY_LABEL[type]}
    </span>
  );
}

export function Chip({ children, tone = 'soft' }: { children: React.ReactNode; tone?: 'soft' | 'grey' | 'warn' | 'bad' }) {
  const t = { soft: 'bg-cyan-soft text-ink border-ok-line', grey: 'bg-elearn text-ink border-elearn', warn: 'bg-warn-bg text-warn-fg border-warn-line', bad: 'bg-bad-bg text-bad-fg border-bad-line' }[tone];
  return <span className={`inline-block rounded-chip border px-2.5 py-1 text-xs font-bold ${t}`}>{children}</span>;
}

type BtnProps = { href?: string; kind?: 'primary' | 'secondary' | 'dark'; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>;
export function Button({ href, kind = 'primary', children, className = '', ...rest }: BtnProps) {
  const k = {
    primary: 'bg-cyan text-on-cyan',
    secondary: 'bg-card text-ink border border-field',
    dark: 'bg-strong text-strong-fg',
  }[kind];
  const cls = `inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-5 text-sm font-bold no-underline ${k} ${className}`;
  return href ? <Link href={href} className={cls}>{children}</Link> : <button className={cls} {...rest}>{children}</button>;
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-card bg-card p-6 shadow-card ${className}`}>{children}</section>;
}

export type Crumb = [label: string, href?: string];

/** Where the person is. By default a thin bar across the top of the page, under the site header, in the same place on every page. The last item is the current page and is not a link. `inline` is for inside the portal's own content area. */
export function Breadcrumbs({ items, variant = 'bar', className = '' }: { items: Crumb[]; variant?: 'bar' | 'inline'; className?: string }) {
  const bar = variant === 'bar';
  return (
    <nav aria-label="Breadcrumb" className={`text-[13px] text-slate ${bar ? 'border-b border-hairline bg-white px-4 py-2.5 md:px-[max(4.1667%,calc((100%_-_1280px)/2))]' : ''} ${className}`}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map(([label, href], i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${label}-${i}`} className="flex items-center gap-1.5">
              {href && !last ? <Link href={href}>{label}</Link> : <span aria-current={last ? 'page' : undefined} className={last ? 'font-semibold text-ink' : undefined}>{label}</span>}
              {!last && <span aria-hidden="true">›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Dark hero band with the zone-hatch motif. Marketing and confirmation pages only. */
export function Hero({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="hero-motif px-4 py-12 md:px-[max(4.1667%,calc((100%_-_1280px)/2))]">
      <p className="mb-3 text-xs font-extrabold uppercase tracking-widest text-cyan">{eyebrow}</p>
      <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-white md:text-5xl">{title}</h1>
      {sub && <p className="max-w-3xl text-lg leading-relaxed text-white/80">{sub}</p>}
    </div>
  );
}

/** Small uppercase label above a section heading. */
export function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink ${className}`}>{children}</p>;
}
