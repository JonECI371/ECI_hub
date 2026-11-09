import Link from 'next/link';
import Image from 'next/image';
import type { Person } from '@prisma/client';
import { SideNav, type NavItem } from '@/components/side-nav';

const initials = (p: Person) => `${p.firstName[0] ?? ''}${p.lastName[0] && p.lastName !== '-' ? p.lastName[0] : ''}`.toUpperCase();

/** Signed-in area: dark side menu on desktop, a menu button on phones, and a top bar with the person. */
export function AppShell({ label, items, me, roleLabel, children, topbar }: { label: string; items: NavItem[]; me: Person; roleLabel: string; children: React.ReactNode; topbar?: React.ReactNode }) {
  const user = (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-cyan text-[13px] font-extrabold text-ink">{initials(me)}</span>
      <span className="hidden flex-col leading-tight sm:flex">
        <span className="text-sm font-bold text-ink">{me.firstName} {me.lastName === '-' ? '' : me.lastName}</span>
        <span className="text-xs">{roleLabel}</span>
      </span>
      <form action="/logout" method="post">
        <button type="submit" className="ml-2 min-h-11 px-2 text-sm text-ink underline decoration-cyan decoration-2 underline-offset-[3px]">Log out</button>
      </form>
    </div>
  );
  return (
    <div className="flex min-h-screen flex-1">
      <nav aria-label={label} className="hidden w-[248px] shrink-0 flex-col bg-ink pb-6 lg:flex">
        <Link href="/" className="block px-6 pb-[26px] pt-[22px]"><Image src="/logo.png" alt="ECI-Hub home" width={129} height={46} className="h-[46px] w-auto" /></Link>
        <p className="mb-2 px-6 text-[11px] font-bold uppercase tracking-[0.1em] text-white/55">{label}</p>
        <SideNav items={items} />
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[68px] items-center gap-4 border-b border-hairline bg-white px-4 lg:px-8">
          <details className="group relative lg:hidden">
            <summary className="flex h-11 cursor-pointer list-none items-center rounded-control border border-field px-3 text-sm font-bold text-ink [&::-webkit-details-marker]:hidden">Menu</summary>
            <nav aria-label={label} className="absolute left-0 top-12 z-30 w-[260px] rounded-card bg-ink py-3 shadow-lift">
              <SideNav items={items} />
            </nav>
          </details>
          <div className="min-w-0 flex-1">{topbar}</div>
          {user}
        </div>
        <main className="flex flex-1 flex-col gap-6 px-4 pb-12 pt-7 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
