import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { ICONS } from '@/lib/icons';
import type { Viewport } from 'next';
import { AppShell } from '@/components/app-shell';
import { SITE_URL } from '@/lib/format';

export const dynamic = 'force-dynamic';
/** Admin is always dark: the page surround, scrollbars and form controls follow, and Safari and Android Chrome tint their bar to match. */
export const viewport: Viewport = { themeColor: '#101114', colorScheme: 'dark' };
const isTestSite = /\/\/(test|staging|localhost)/i.test(SITE_URL);

/** Admin back office: ADMIN and SUPER_ADMIN only, checked on the server. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdmin();
  const [open, pending] = await Promise.all([db.task.count({ where: { status: 'OPEN' } }), db.trainerProfile.count({ where: { status: 'PENDING' } })]);
  return (
    <AppShell
      label="Admin"
      theme="admin"
      strip={isTestSite ? { left: 'Admin', right: 'Test site: changes here affect test bookings', tone: 'test' } : { left: 'Admin', right: 'Live site: changes here affect real customers', tone: 'live' }}
      me={me}
      roleLabel={me.roles.includes('SUPER_ADMIN') ? 'Super Admin' : 'Admin'}
      topbar={
        <form action="/admin/bookings" className="max-w-[460px]">
          <label className="flex h-[42px] items-center gap-2.5 rounded-control border border-field px-3.5">
            <span className="sr-only">Search bookings</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            <input name="q" placeholder="Search bookings, people, references" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
        </form>
      }
      items={[
        { href: '/admin', label: 'Home', icon: ICONS.home, exact: true },
        { href: '/admin/tasks', label: 'Tasks', icon: ICONS.tasks, badge: open },
        { href: '/admin/courses', label: 'Courses', icon: ICONS.courses },
        { href: '/admin/services', label: 'Services', icon: ICONS.certificate },
        { href: '/admin/schedule', label: 'Calendar', icon: ICONS.calendar },
        { href: '/admin/bookings', label: 'Bookings', icon: ICONS.bookings },
        { href: '/admin/people', label: 'People', icon: ICONS.people, badge: pending },
        { href: '/admin/accounts', label: 'Accounts', icon: ICONS.accounts },
        { href: '/admin/settings', label: 'Settings', icon: ICONS.settings },
      ]}
    >
      {children}
    </AppShell>
  );
}
