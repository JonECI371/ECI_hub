import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePerson } from '@/lib/auth';
import { myMembership } from '@/lib/booker';
import { Chip } from '@/components/ui';
import { invite, remove } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Team', robots: { index: false } };

const MSG: Record<string, [string, boolean]> = {
  invited: ['Invite sent for approval. We check new bookers within one working day, then email them a sign-in link.', true],
  removed: ['Done. They can no longer book on the account.', true],
  invalid: ['Enter their name and a valid email address.', false],
};
const input = 'box-border h-11 w-full rounded-control border border-field bg-white px-3 text-sm text-ink';
const label = 'flex flex-col gap-1 text-sm font-bold text-ink';
const dmy = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/London' });

export default async function Team({ searchParams }: { searchParams: Promise<{ msg?: string; detail?: string }> }) {
  const me = await requirePerson();
  const m = await myMembership(me.id);
  if (!m) redirect('/account');
  const { msg, detail } = await searchParams;
  const notice: [string, boolean] | null = msg === 'rule' ? [detail ?? 'That is not allowed.', false] : msg ? MSG[msg] ?? null : null;
  const isMain = m.role === 'MAIN_BOOKER';
  const [members, attended] = await Promise.all([
    db.accountMember.findMany({ where: { accountId: m.accountId, status: { not: 'REMOVED' } }, include: { person: true }, orderBy: [{ role: 'asc' }, { person: { firstName: 'asc' } }] }),
    db.attendee.findMany({ where: { booking: { accountId: m.accountId, status: { in: ['CONFIRMED', 'COMPLETED'] } }, personId: { not: null } }, select: { personId: true }, distinct: ['personId'] }),
  ]);
  const people = await db.person.findMany({ where: { id: { in: attended.map((a) => a.personId!) } }, include: { certificates: { include: { course: true }, orderBy: { expiresAt: 'asc' } } }, orderBy: { lastName: 'asc' } });

  return (
    <>
      <div>
        <p className="mb-1.5 text-xs">{m.account.company}</p>
        <h1 className="text-[30px] font-extrabold tracking-tight text-ink">Team</h1>
      </div>
      {notice && <p role={notice[1] ? 'status' : 'alert'} className={`rounded-control px-4 py-3 text-sm font-semibold ${notice[1] ? 'bg-cyan-soft text-ink' : 'bg-bad-bg text-bad-fg'}`}>{notice[0]}</p>}

      <section aria-labelledby="bk-h" className="overflow-hidden rounded-card bg-white shadow-card">
        <h2 id="bk-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">People who can book</h2>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[#FAFAFA] text-xs uppercase tracking-[0.06em]"><tr>{['Name', 'Email', 'Role', 'Status', ''].map((h, i) => <th key={i} className="px-6 py-3">{h}</th>)}</tr></thead>
            <tbody>
              {members.map((x) => (
                <tr key={x.id} className="border-t border-hairline">
                  <td className="px-6 py-3 font-bold text-ink">{x.person.firstName} {x.person.lastName === '-' ? '' : x.person.lastName}</td>
                  <td className="px-6 py-3">{x.person.email}</td>
                  <td className="px-6 py-3">{x.role === 'MAIN_BOOKER' ? 'Main booker' : 'Booker'}</td>
                  <td className="px-6 py-3"><Chip tone={x.status === 'ACTIVE' ? 'soft' : 'warn'}>{x.status === 'ACTIVE' ? 'Active' : 'Waiting for ECI approval'}</Chip></td>
                  <td className="px-6 py-3 text-right">
                    {isMain && x.role !== 'MAIN_BOOKER' && (
                      <form action={remove}><input type="hidden" name="memberId" value={x.id} /><button type="submit" className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-4 text-sm font-bold text-ink">{x.status === 'ACTIVE' ? 'Remove' : 'Cancel invite'}</button></form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isMain ? (
          <details className="border-t border-hairline px-6 py-4">
            <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-chip bg-cyan px-5 text-sm font-bold text-ink">Invite a booker</summary>
            <form action={invite} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
              <label className={label}>Name<input name="name" required className={input} /></label>
              <label className={label}>Work email<input name="email" type="email" required className={input} /></label>
              <label className={label}>Job title <span className="font-normal">(optional)</span><input name="jobTitle" className={input} /></label>
              <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-chip bg-ink px-5 text-sm font-bold text-white">Send invite</button>
            </form>
            <p className="mt-3 text-[13px]">New bookers are checked by ECI-Hub before they can book on account.</p>
          </details>
        ) : <p className="border-t border-hairline px-6 py-3 text-[13px]">Ask your main booker to add or remove bookers.</p>}
      </section>

      <section aria-labelledby="tm-h" className="overflow-hidden rounded-card bg-white shadow-card">
        <h2 id="tm-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">People trained</h2>
        {people.length === 0 ? <p className="px-6 py-6 text-sm">People appear here once they have been booked on a course on the account.</p> : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-[#FAFAFA] text-xs uppercase tracking-[0.06em]"><tr>{['Person', 'Certificates', 'Next expiry'].map((h) => <th key={h} className="px-6 py-3">{h}</th>)}</tr></thead>
              <tbody>
                {people.map((p) => {
                  const next = p.certificates.find((c) => c.expiresAt && c.expiresAt > new Date());
                  const soon = next?.expiresAt && next.expiresAt.getTime() - Date.now() < 90 * 86400000;
                  return (
                    <tr key={p.id} className="border-t border-hairline align-top">
                      <td className="px-6 py-3"><span className="block font-bold text-ink">{p.firstName} {p.lastName === '-' ? '' : p.lastName}</span><span className="text-xs">{p.email}</span></td>
                      <td className="px-6 py-3">{p.certificates.length ? p.certificates.map((c) => c.course.title).join(', ') : 'None yet'}</td>
                      <td className="px-6 py-3">{next ? <>{next.course.title}, {dmy.format(next.expiresAt!)} {soon && <Chip tone="warn">Renew soon</Chip>}</> : '-'}</td>
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
