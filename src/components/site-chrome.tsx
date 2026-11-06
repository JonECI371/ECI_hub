import Link from 'next/link';

const NAV = [
  ['Courses', '/courses'],
  ['Consultancy', '/contact'],
  ['Free tools', '/tools'],
  ['About', '/about'],
  ['Log in', '/login'],
] as const;

export function SiteHeader() {
  return (
    <>
      <div className="flex h-10 items-center justify-between bg-ink px-4 text-xs text-white/65 md:px-20">
        <span>support@eci-hub.co.uk · +44 (0) 1932 963463</span>
        <span className="hidden md:inline">Sunbury-on-Thames and on-site across the UK</span>
      </div>
      <header className="flex h-[76px] items-center justify-between bg-ink px-4 md:px-20">
        <Link href="/" className="text-xl font-extrabold text-white no-underline">ECI-Hub</Link>
        <nav aria-label="Main" className="flex items-center gap-6">
          {NAV.map(([label, href]) => (
            <Link key={href} href={href} className="hidden text-sm text-white/80 no-underline hover:text-white md:inline">{label}</Link>
          ))}
          <Link href="/courses" className="rounded-control bg-cyan px-4 py-2.5 text-sm font-bold text-ink no-underline">Book a course</Link>
        </nav>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto flex flex-col gap-4 bg-ink px-4 py-8 text-xs text-white/65 md:flex-row md:justify-between md:px-20">
      <div className="flex flex-wrap gap-6">
        <Link href="/legal/terms" className="text-white/65">Terms &amp; Conditions</Link>
        <Link href="/legal/privacy" className="text-white/65">Privacy notice</Link>
        <Link href="/legal/cookies" className="text-white/65">Cookies</Link>
        <Link href="/legal/accessibility" className="text-white/65">Accessibility statement</Link>
      </div>
      <span className="text-white/50">© {new Date().getFullYear()} ECFIO Engineering Ltd · Company number 09147227</span>
    </footer>
  );
}
