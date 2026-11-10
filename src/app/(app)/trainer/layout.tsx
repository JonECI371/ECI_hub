import Link from 'next/link';
import { requirePerson } from '@/lib/auth';
import { ICONS } from '@/lib/icons';
import { AppShell } from '@/components/app-shell';

export const dynamic = 'force-dynamic';

const TABS = [['/trainer', 'Sessions'], ['/trainer/availability', 'Availability'], ['/trainer/profile', 'Profile']] as const;

/** Trainer app: phone first, with a tab bar at the bottom on small screens. */
export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const me = await requirePerson(['TRAINER'], '/trainer');
  return (
    <AppShell
      label="Trainer"
      me={me}
      roleLabel="Trainer"
      items={[
        { href: '/trainer', label: 'My sessions', icon: ICONS.calendar, exact: true },
        { href: '/trainer/availability', label: 'Availability', icon: ICONS.tasks },
        { href: '/trainer/profile', label: 'Profile and qualifications', icon: ICONS.certificate },
      ]}
    >
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 pb-24 lg:pb-0">{children}</div>
      <nav aria-label="Trainer tabs" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-hairline bg-white lg:hidden print:hidden">
        {TABS.map(([href, label]) => <Link key={href} href={href} className="flex min-h-[56px] items-center justify-center text-sm font-bold text-ink no-underline">{label}</Link>)}
      </nav>
    </AppShell>
  );
}
