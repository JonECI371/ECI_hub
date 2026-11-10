import Link from 'next/link';
import type { Metadata } from 'next';
import type { AccountStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { ACCOUNT_STATUS, requireAdmin } from '@/lib/admin';
import { money } from '@/lib/format';
import { availableCredit } from '@/lib/credit';
import { Chip } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Accounts', robots: { index: false } };

const STATUSES = Object.keys(ACCOUNT_STATUS) as AccountStatus[];
const input = 'h-11 rounded-control border border-field bg-white px-3 text-sm text-ink';

export default async function Accounts({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireAdmin('/admin/accounts');
  const { q, status } = await searchParams;
  const term = (q ?? '').trim().slice(0, 80);
  const st = STATUSES.includes(status as AccountStatus) ? (status as AccountStatus) : undefined;
  const rows = await db.account.findMany({
    where: { status: st, ...(term ? { OR: [{ company: { contains: term, mode: 'insensitive' } }, { companyNumber: { contains: term, mode: 'insensitive' } }, { accountsEmail: { contains: term, mode: 'insensitive' } }] } : {}) },
    include: { members: { where: { role: 'MAIN_BOOKER' }, include: { person: true } } },
    orderBy: { company: 'asc' },
    take: 200,
  });
  const avail = new Map(await Promise.all(rows.map(async (a) => [a.id, await availableCredit(db, a)] as const)));
  return (
    <>
      <div><p className="mb-1.5 text-xs">Admin › Accounts</p><h1 className="text-[30px] font-extrabold tracking-tight text-ink">Credit accounts</h1></div>
      <form className="flex flex-wrap items-end gap-3" role="search">
        <label className="flex flex-col gap-1 text-xs font-bold">Search<input name="q" defaultValue={q} placeholder="Company, number, accounts email" className={`${input} w-[280px] max-w-full`} /></label>
        <label className="flex flex-col gap-1 text-xs font-bold">Status<select name="status" defaultValue={status ?? ''} className={input}><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{ACCOUNT_STATUS[s][1]}</option>)}</select></label>
        <button type="submit" className="inline-flex min-h-11 items-center rounded-chip bg-ink px-5 text-sm font-bold text-white">Search</button>
        {(q || status) && <Link href="/admin/accounts" className="inline-flex min-h-11 items-center text-sm">Clear</Link>}
      </form>
      <section className="overflow-hidden rounded-card bg-white shadow-card">
        <p aria-live="polite" className="border-b border-hairline px-6 py-3 text-sm font-bold text-ink">{rows.length} {rows.length === 1 ? 'account' : 'accounts'}</p>
        {rows.length === 0 ? <p className="px-6 py-8">No accounts match.</p> : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-[#FAFAFA] text-xs uppercase tracking-[0.06em]"><tr>{['Company', 'Main booker', 'Limit', 'Available', 'Terms', 'Status'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((a) => {
                  const mb = a.members[0]?.person;
                  return (
                    <tr key={a.id} className="border-t border-hairline">
                      <td className="px-4 py-3"><Link href={`/admin/accounts/${a.id}`} className="font-bold">{a.company}</Link><span className="block text-xs">{a.companyNumber}</span></td>
                      <td className="px-4 py-3">{mb ? `${mb.firstName} ${mb.lastName}` : '-'}<span className="block text-xs">{mb?.email}</span></td>
                      <td className="px-4 py-3 tabular-nums">{money(a.creditLimitPence)}</td>
                      <td className="px-4 py-3 tabular-nums">{a.status === 'ACTIVE' || a.status === 'ON_HOLD' ? money(avail.get(a.id) ?? 0) : '-'}</td>
                      <td className="px-4 py-3">{a.paymentTermsDays} days</td>
                      <td className="px-4 py-3"><Chip tone={ACCOUNT_STATUS[a.status][0]}>{ACCOUNT_STATUS[a.status][1]}</Chip></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
