'use client';
import { usePathname } from 'next/navigation';
import { Breadcrumbs, type Crumb } from '@/components/ui';

const ACCOUNT: Record<string, string> = { bookings: 'My bookings', team: 'Team', billing: 'Account and billing', certificates: 'Certificates', settings: 'Settings' };
const TRAINER: Record<string, string> = { availability: 'My availability', profile: 'Profile and qualifications' };

/** Breadcrumb trail for the customer portal and the trainer app, worked out from the address so every page in them has one. */
export function PortalCrumbs({ area }: { area: 'account' | 'trainer' }) {
  const parts = (usePathname() ?? '').split('/').filter(Boolean).slice(1);
  const root: Crumb = area === 'account' ? ['My account', '/account'] : ['My sessions', '/trainer'];
  const names = area === 'account' ? ACCOUNT : TRAINER;
  let items: Crumb[] = [root];
  if (parts[0] && names[parts[0]]) {
    items.push([names[parts[0]], `/${area}/${parts[0]}`]);
    if (area === 'account' && parts[0] === 'bookings' && parts[1]) items.push([parts[1]]);
  } else if (area === 'trainer' && parts[0] === 'sessions' && parts[1]) items.push(['Attendance']);
  items = items.map((c, i) => (i === items.length - 1 ? [c[0]] : c));
  return <Breadcrumbs variant="inline" items={items} className="mb-1" />;
}
