'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string; icon: string; badge?: number; exact?: boolean };

/** Side menu links; highlights the current section. Icons are stroke paths (24px viewBox). */
export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <ul className="flex flex-col">
      {items.map((it) => {
        const on = it.exact ? path === it.href : path === it.href || path.startsWith(`${it.href}/`);
        return (
          <li key={it.href}>
            <Link
              href={it.href}
              aria-current={on ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-3 px-6 py-[11px] text-sm no-underline hover:text-white ${on ? 'bg-cyan/15 text-white shadow-[inset_3px_0_0_#2EC39B]' : 'text-white/75'}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={it.icon} /></svg>
              {it.label}
              {it.badge ? <span className="ml-auto rounded-full bg-cyan px-[7px] py-0.5 text-[11px] font-extrabold text-ink">{it.badge}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
