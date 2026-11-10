import { requirePerson } from '@/lib/auth';
import { myMembership } from '@/lib/booker';
import { ICONS } from '@/lib/icons';
import { AppShell } from '@/components/app-shell';

export const dynamic = 'force-dynamic';

/** Customer portal: delegates, card bookers, and bookers on a company credit account. */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const me = await requirePerson();
  const isBooker = me.roles.includes('BOOKER');
  const m = await myMembership(me.id);
  return (
    <AppShell
      label={m ? m.account.company : 'My account'}
      me={me}
      roleLabel={m ? `${m.role === 'MAIN_BOOKER' ? 'Main booker' : 'Booker'} · ${m.account.company}` : isBooker ? 'Booker' : 'Delegate'}
      items={[
        { href: '/account', label: 'Dashboard', icon: ICONS.home, exact: true },
        { href: '/account/bookings', label: m ? 'Bookings' : 'My bookings', icon: ICONS.bookings },
        ...(m ? [{ href: '/account/team', label: 'Team', icon: ICONS.people }, { href: '/account/billing', label: 'Account and billing', icon: ICONS.accounts }] : []),
        { href: '/account/certificates', label: 'Certificates', icon: ICONS.certificate },
        { href: '/account/settings', label: 'Settings', icon: ICONS.settings },
        { href: '/courses', label: 'Book a course', icon: ICONS.courses },
      ]}
    >
      {children}
    </AppShell>
  );
}
