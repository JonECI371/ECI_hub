import Link from 'next/link';
import Image from 'next/image';
import { currentPerson } from '@/lib/auth';

const BASE_NAV = [
  ['Courses', '/courses'],
  ['Consultancy', '/contact'],
  ['Free tools', '/tools'],
  ['About', '/about'],
] as const;

export async function SiteHeader() {
  const me = await currentPerson();
  const admin = me?.roles.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN');
  const NAV: (readonly [string, string])[] = [...BASE_NAV, me ? ['My account', admin ? '/admin' : '/account'] : ['Log in', '/login']];
  return (
    <>
      <div className="flex h-10 items-center justify-between bg-ink px-4 text-xs text-white/60 md:px-20">
        <div className="flex gap-6">
          <span>support@eci-hub.co.uk</span>
          <span className="hidden sm:inline">+44 (0) 1932 963463</span>
        </div>
        <span className="hidden md:inline">Sunbury-on-Thames and nationwide on-site delivery</span>
      </div>
      <header className="relative flex h-[76px] items-center justify-between bg-ink px-4 md:px-20">
        <Link href="/" className="flex items-center no-underline">
          <Image src="/logo.png" alt="ECI-Hub, Engineering Safer Futures" width={146} height={52} priority className="h-[52px] w-auto" />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-[30px] lg:flex">
          {NAV.map(([label, href]) => (
            <Link key={href} href={href} className="text-sm text-white/80 no-underline hover:text-white">{label}</Link>
          ))}
          <Link href="/courses" className="rounded-chip bg-cyan px-[22px] py-[11px] text-sm font-semibold text-ink no-underline">Book a course</Link>
        </nav>
        {/* Phones and tablets: the menu folds into a disclosure, no script needed. */}
        <details className="group lg:hidden">
          <summary className="flex h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-control border border-white/30 px-3 text-sm font-bold text-white [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Menu</span>
            <span className="hidden group-open:inline">Close</span>
          </summary>
          <nav aria-label="Main" className="absolute inset-x-0 top-full z-20 flex flex-col border-t border-white/10 bg-ink px-4 pb-4">
            {NAV.map(([label, href]) => (
              <Link key={href} href={href} className="flex min-h-11 items-center border-b border-white/10 text-[15px] text-white no-underline">{label}</Link>
            ))}
            <Link href="/courses" className="mt-4 flex min-h-11 items-center justify-center rounded-chip bg-cyan text-[15px] font-semibold text-ink no-underline">Book a course</Link>
          </nav>
        </details>
      </header>
    </>
  );
}

const FOOTER_COLS = [
  ['Training', [['CompEx', '/courses?subject=compex'], ['DSEAR', '/courses?subject=dsear'], ['Process safety', '/courses?subject=process-safety'], ['EUSR', '/courses?subject=eusr']]],
  ['Consultancy', [['Area classification', '/contact'], ['DSEAR assessment', '/contact'], ['Functional safety', '/contact'], ['Design assurance', '/contact']]],
  ['Company', [['About us', '/about'], ['Case studies', '/about'], ['Insights', '/tools'], ['Contact', '/contact']]],
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-ink px-4 pt-14 text-white/65 md:px-20">
      <div className="grid gap-10 pb-12 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div>
          <Image src="/logo.png" alt="ECI-Hub" width={126} height={45} className="mb-5 h-[45px] w-auto" />
          <p className="mb-3 text-[13px] leading-relaxed">ECFIO Engineering Ltd, trading as ECI-Hub.<br />Company number 09147227.</p>
          <p className="text-[13px] leading-relaxed">Summit House, 33 Hanworth Road,<br />Sunbury-on-Thames TW16 5DA</p>
        </div>
        {FOOTER_COLS.map(([head, links]) => (
          <div key={head}>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-cyan">{head}</p>
            <ul className="flex flex-col gap-2.5">
              {links.map(([label, href]) => (
                <li key={label}><Link href={href} className="text-[13px] text-white/70 no-underline hover:text-white">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-4 border-t border-white/10 py-6 text-xs md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/legal/terms" className="text-white/65">Terms &amp; Conditions</Link>
          <Link href="/legal/privacy" className="text-white/65">Privacy notice</Link>
          <Link href="/legal/cookies" className="text-white/65">Cookies</Link>
          <Link href="/legal/accessibility" className="text-white/65">Accessibility statement</Link>
        </div>
        <span className="text-white/50">© {new Date().getFullYear()} ECFIO Engineering Ltd. All rights reserved. · Enabling people, protecting places</span>
      </div>
    </footer>
  );
}
