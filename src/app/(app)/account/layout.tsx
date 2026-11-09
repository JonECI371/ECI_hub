import { requirePerson } from '@/lib/auth';
import { ICONS } from '@/lib/icons';
import { AppShell } from '@/components/app-shell';

export const dynamic = 'force-dynamic';

/** Customer portal: delegates and card bookers. */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const me = await requirePerson();
  const isBooker = me.roles.includes('BOOKER');
  return (
    <AppShell
      label="My account"
      me={me}
      roleLabel={isBooker ? 'Booker' : 'Delegate'}
      items={[
        { href: '/account', label: 'Dashboard', icon: ICONS.home, exact: true },
        { href: '/account/bookings', label: 'My bookings', icon: ICONS.bookings },
        { href: '/account/certificates', label: 'Certificates', icon: ICONS.certificate },
        { href: '/account/settings', label: 'Settings', icon: ICONS.settings },
        { href: '/courses', label: 'Book a course', icon: ICONS.courses },
      ]}
    >
      {children}
    </AppShell>
  );
}
