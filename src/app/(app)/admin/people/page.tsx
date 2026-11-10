import Link from 'next/link';
import type { Metadata } from 'next';
import type { Prisma, Role } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { assignBlock } from '@/lib/trainers';
import { Chip } from '@/components/ui';
import { addStaff } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'People', robots: { index: false } };

const PER_PAGE = 30;
const FILTERS: [string, string][] = [['', 'Everyone'], ['staff', 'Staff'], ['TRAINER', 'Trainers'], ['pending', 'Trainers awaiting approval'], ['BOOKER', 'Bookers'], ['DELEGATE', 'Delegates']];
const ROLE_LABEL: Record<Role, string> = { DELEGATE: 'Delegate', BOOKER: 'Booker', TRAINER: 'Trainer', ADMIN: 'Admin', SUPER_ADMIN: 'Super Admin' };
const input = 'h-11 rounded-control border border-field bg-white px-3 text-sm text-ink';

export default async function People({ searchParams }: { searchParams: Promise<{ q?: string; show?: string; page?: string; msg?: string }> }) {
  const me = await requireAdmin('/admin/people');
  const isSuper = me.roles.includes('SUPER_ADMIN');
  const { q, show = '', page, msg } = await searchParams;
  const term = (q ?? '').trim().slice(0, 80);
  const p = Math.max(1, Number(page) || 1);
  const where: Prisma.PersonWhereInput = {
    ...(term ? { OR: [{ email: { contains: term, mode: 'insensitive' } }, { firstName: { contains: term, mode: 'insensitive' } }, { lastName: { contains: term, mode: 'insensitive' } }, { employer: { contains: term, mode: 'insensitive' } }] } : {}),
    ...(show === 'staff' ? { roles: { hasSome: ['ADMIN', 'SUPER_ADMIN'] as Role[] } } : {}),
    ...(show === 'pending' ? { trainerProfile: { status: 'PENDING' } } : {}),
    ...(['TRAINER', 'BOOKER'].includes(show) ? { roles: { has: show as Role } } : {}),
    ...(show === 'DELEGATE' ? { NOT: { roles: { hasSome: ['ADMIN', 'SUPER_ADMIN', 'TRAINER', 'BOOKER'] as Role[] } } } : {}),
  };
  const [rows, total, pending] = await Promise.all([
    db.person.findMany({ where, include: { trainerProfile: true, _count: { select: { attendances: true, bookingsMade: true } } }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], skip: (p - 1) * PER_PAGE, take: PER_PAGE }),
    db.person.count({ where }),
    db.trainerProfile.count({ where: { status: 'PENDING' } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const qs = (extra: Record<string, string | number | undefined>) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ q: term || undefined, show: show || undefined, ...extra })) if (v) u.set(k, String(v)); return u.toString(); };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-1.5 text-xs">Admin › People</p><h1 className="text-[30px] font-extrabold tracking-tight text-ink">People</h1></div>
      </div>
      {msg === 'invalid' && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">Enter a first name, a valid email and a role.</p>}
      {pending > 0 && show !== 'pending' && (
        <Link href="/admin/people?show=pending" className="flex items-center justify-between gap-3 rounded-control bg-warn-bg px-4 py-3 text-sm font-semibold text-warn-fg no-underline">
          <span>{pending} {pending === 1 ? 'trainer is' : 'trainers are'} awaiting approval</span><span aria-hidden="true">→</span>
        </Link>
      )}

      <form className="flex flex-wrap items-end gap-3" role="search">
        <label className="flex flex-col gap-1 text-xs font-bold">Search<input name="q" defaultValue={term} placeholder="Name, email or employer" className={`${input} w-[260px] max-w-full`} /></label>
        <label className="flex flex-col gap-1 text-xs font-bold">Show<select name="show" defaultValue={show} className={input}>{FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <button type="submit" className="inline-flex min-h-11 items-center rounded-chip bg-ink px-5 text-sm font-bold text-white">Search</button>
      </form>

      <section className="overflow-hidden rounded-card bg-white shadow-card">
        <p aria-live="polite" className="border-b border-hairline px-6 py-3 text-sm font-bold text-ink">{total} {total === 1 ? 'person' : 'people'}</p>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#FAFAFA] text-xs uppercase tracking-[0.06em]"><tr>{['Name', 'Email', 'Employer', 'Roles', 'Bookings', 'Trainer'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => {
                const block = r.roles.includes('TRAINER') ? assignBlock(r) : null;
                return (
                  <tr key={r.id} className="border-t border-hairline">
                    <td className="px-4 py-3"><Link href={`/admin/people/${r.id}`} className="font-bold">{r.firstName} {r.lastName === '-' ? '' : r.lastName}</Link></td>
                    <td className="px-4 py-3">{r.email}</td>
                    <td className="px-4 py-3">{r.employer ?? '-'}</td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{r.roles.filter((x) => x !== 'DELEGATE' || r.roles.length === 1).map((x) => <Chip key={x} tone={x === 'SUPER_ADMIN' || x === 'ADMIN' ? 'soft' : 'grey'}>{ROLE_LABEL[x]}</Chip>)}</div></td>
                    <td className="px-4 py-3 tabular-nums">{r._count.bookingsMade + r._count.attendances}</td>
                    <td className="px-4 py-3">{r.roles.includes('TRAINER') ? (block ? <Chip tone={block === 'Awaiting approval' ? 'warn' : 'bad'}>{block}</Chip> : <Chip>Approved</Chip>) : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-4 text-sm">
          {p > 1 ? <Link href={`/admin/people?${qs({ page: p - 1 })}`}>← Previous</Link> : <span />}
          <span>Page {p} of {pages}</span>
          {p < pages ? <Link href={`/admin/people?${qs({ page: p + 1 })}`}>Next →</Link> : <span />}
        </nav>
      )}

      {isSuper && (
        <section className="rounded-card bg-white p-6 shadow-card" aria-labelledby="add-h">
          <h2 id="add-h" className="mb-1 text-lg font-extrabold text-ink">Add a staff member or trainer</h2>
          <p className="mb-4 text-sm">They log in with their email code. Admins and trainers also set up an authenticator app at first log-in. New trainers start as awaiting approval.</p>
          <form action={addStaff} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <label className="flex flex-col gap-1 text-xs font-bold">First name<input name="firstName" required className={input} /></label>
            <label className="flex flex-col gap-1 text-xs font-bold">Last name<input name="lastName" className={input} /></label>
            <label className="flex flex-col gap-1 text-xs font-bold">Email<input name="email" type="email" required className={input} /></label>
            <label className="flex flex-col gap-1 text-xs font-bold">Role<select name="role" className={input}><option value="ADMIN">Admin</option><option value="TRAINER">Trainer</option><option value="SUPER_ADMIN">Super Admin</option></select></label>
            <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-chip bg-cyan px-4 text-sm font-bold text-ink">Add person</button>
          </form>
        </section>
      )}
    </>
  );
}
