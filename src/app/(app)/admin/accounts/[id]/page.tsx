import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { ACCOUNT_STATUS, requireAdmin } from '@/lib/admin';
import { money } from '@/lib/format';
import { availableCredit } from '@/lib/credit';
import { PO_RULES, creditDefaults } from '@/lib/accounts';
import { monthLabel } from '@/lib/billing';
import { Chip } from '@/components/ui';
import { setAccountStatus, setInvoiceNo, statementPaid, updateTerms } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Account', robots: { index: false } };

const MSG: Record<string, [string, boolean]> = {
  paid: ['Statement marked paid. Credit is restored, and any hold lifts once nothing else is overdue.', true], saved: ['Saved.', true],
  closed: ['Account closed. Bookers can no longer book on account.', true], reopened: ['Account reopened.', true],
  invalid: ['Check the values and try again.', false],
};
const dmy = (d: Date | null) => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : '-');
const ST = { OPEN: ['soft', 'Open'], ISSUED: ['warn', 'Invoiced'], OVERDUE: ['bad', 'Overdue'], PAID: ['grey', 'Paid'] } as const;
const card = 'rounded-card bg-white p-6 shadow-card';
const input = 'h-11 rounded-control border border-field bg-white px-3 text-sm text-ink';
const btn = 'inline-flex min-h-11 items-center justify-center rounded-chip px-4 text-sm font-bold';

export default async function AccountRecord({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const me = await requireAdmin('/admin/accounts');
  const { id } = await params;
  const { msg } = await searchParams;
  const a = await db.account.findUnique({
    where: { id },
    include: { members: { where: { status: { not: 'REMOVED' } }, include: { person: true }, orderBy: { role: 'asc' } }, statements: { include: { lines: true }, orderBy: { month: 'desc' }, take: 24 } },
  });
  if (!a) notFound();
  const [available, defaults, bookings] = await Promise.all([
    availableCredit(db, a),
    creditDefaults(),
    db.booking.findMany({ where: { accountId: a.id }, include: { course: true, session: true }, orderBy: { createdAt: 'desc' }, take: 15 }),
  ]);
  const notice: [string, boolean] | null = msg === 'needsuper' ? [`Limits above ${money(defaults.defaultLimitPence)} need a Super Admin.`, false] : msg ? MSG[msg] ?? null : null;
  const [tone, label] = ACCOUNT_STATUS[a.status];
  const total = (s: (typeof a.statements)[number]) => s.lines.reduce((n, l) => n + l.netPence + l.vatPence, 0);

  return (
    <>
      <div>
        <p className="mb-1.5 text-xs"><Link href="/admin/accounts">Accounts</Link> › {a.company}</p>
        <h1 className="text-[30px] font-extrabold tracking-tight text-ink">{a.company}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><Chip tone={tone}>{label}</Chip><span>{a.companyNumber} · {a.industry ?? 'Industry not given'}</span></div>
      </div>
      {notice && <p role={notice[1] ? 'status' : 'alert'} className={`rounded-control px-4 py-3 text-sm font-semibold ${notice[1] ? 'bg-cyan-soft text-ink' : 'bg-bad-bg text-bad-fg'}`}>{notice[0]}</p>}

      <section aria-label="Credit" className="grid gap-4 sm:grid-cols-3">
        {([['Credit limit', money(a.creditLimitPence)], ['Available', money(available)], ['Terms', `${a.paymentTermsDays} days`]] as const).map(([k, v]) => (
          <div key={k} className="rounded-card bg-white p-5 shadow-card"><p className="text-sm">{k}</p><p className="mt-1 text-[28px] font-extrabold text-ink tabular-nums">{v}</p></div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="st-h" className="overflow-hidden rounded-card bg-white shadow-card">
            <h2 id="st-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">Statements</h2>
            {a.statements.length === 0 ? <p className="px-6 py-6 text-sm">No statements yet.</p> : (
              <ul>
                {a.statements.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-6 py-3 text-sm last:border-0">
                    <div>
                      <p className="font-bold text-ink">{monthLabel(s.month)} · {money(total(s))} <Chip tone={ST[s.status][0]}>{ST[s.status][1]}</Chip></p>
                      <p className="text-xs">{s.lines.length} {s.lines.length === 1 ? 'line' : 'lines'}{s.issuedAt ? ` · issued ${dmy(s.issuedAt)}` : ''}{s.dueAt ? ` · due ${dmy(s.dueAt)}` : ''}{s.paidAt && s.status === 'PAID' ? ` · paid ${dmy(s.paidAt)}` : ''}{s.xeroInvoiceNo ? ` · ${s.xeroInvoiceNo}` : ''}</p>
                    </div>
                    {(s.status === 'ISSUED' || s.status === 'OVERDUE') && (
                      <div className="flex flex-wrap items-end gap-2">
                        <form action={setInvoiceNo} className="flex items-end gap-2">
                          <input type="hidden" name="statementId" value={s.id} />
                          <label className="flex flex-col gap-1 text-xs font-bold">Xero invoice no.<input name="invoiceNo" defaultValue={s.xeroInvoiceNo ?? ''} className={`${input} w-32`} /></label>
                          <button type="submit" className={`${btn} border border-field bg-white text-ink`}>Save</button>
                        </form>
                        <form action={statementPaid}><input type="hidden" name="statementId" value={s.id} /><button type="submit" className={`${btn} bg-cyan text-ink`}>Mark paid</button></form>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="bk-h" className="overflow-hidden rounded-card bg-white shadow-card">
            <h2 id="bk-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">Recent bookings</h2>
            {bookings.length === 0 ? <p className="px-6 py-6 text-sm">No bookings yet.</p> : (
              <ul>{bookings.map((b) => <li key={b.id} className="flex flex-wrap justify-between gap-2 border-b border-hairline px-6 py-3 text-sm last:border-0"><span><Link href={`/admin/bookings/${b.reference}`} className="font-bold">{b.reference}</Link> · {b.course.title}{b.session ? ` · ${dmy(b.session.startsAt)}` : ''}{b.poNumber ? ` · ${b.poNumber}` : ''}</span><span>{money(b.totalPence)} · {b.status.toLowerCase().replace('_', ' ')}</span></li>)}</ul>
            )}
          </section>

          <section aria-labelledby="mb-h" className="overflow-hidden rounded-card bg-white shadow-card">
            <h2 id="mb-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">Bookers</h2>
            <ul>{a.members.map((m) => <li key={m.id} className="flex flex-wrap justify-between gap-2 border-b border-hairline px-6 py-3 text-sm last:border-0"><span><Link href={`/admin/people/${m.personId}`} className="font-bold">{m.person.firstName} {m.person.lastName}</Link> · {m.person.email}</span><span>{m.role === 'MAIN_BOOKER' ? 'Main booker' : 'Booker'} · {m.status === 'ACTIVE' ? 'active' : 'waiting for approval'}</span></li>)}</ul>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          {(a.status === 'ACTIVE' || a.status === 'ON_HOLD' || a.status === 'CLOSED') && (
            <section className={card} aria-labelledby="terms-h">
              <h2 id="terms-h" className="mb-3 text-lg font-extrabold text-ink">Credit terms</h2>
              <form action={updateTerms} className="flex flex-col gap-3">
                <input type="hidden" name="accountId" value={a.id} />
                <label className="flex flex-col gap-1 text-sm font-bold text-ink">Credit limit (£)<input name="limit" inputMode="numeric" defaultValue={a.creditLimitPence / 100} className={input} /></label>
                {!me.roles.includes('SUPER_ADMIN') && <p className="-mt-2 text-xs">Up to {money(defaults.defaultLimitPence)}; a Super Admin can set more.</p>}
                <label className="flex flex-col gap-1 text-sm font-bold text-ink">Payment terms (days)<input name="terms" type="number" min={0} max={120} defaultValue={a.paymentTermsDays} className={input} /></label>
                <label className="flex flex-col gap-1 text-sm font-bold text-ink">PO numbers<select name="poRule" defaultValue={a.poRule} className={input}>{Object.entries(PO_RULES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <button type="submit" className={`${btn} bg-cyan text-ink`}>Save terms</button>
              </form>
            </section>
          )}
          <section className={card} aria-labelledby="co-h">
            <h2 id="co-h" className="mb-3 text-lg font-extrabold text-ink">Company</h2>
            <dl className="flex flex-col gap-2 text-sm">
              {[['VAT number', a.vatNumber ?? 'Not given'], ['Registered address', a.registeredAddress], ['Invoice address', a.invoiceAddress ?? 'Same as registered'], ['Accounts contact', `${a.accountsName}, ${a.accountsEmail}`], ['Website', a.website ?? '-'], ['Accounts phone', a.accountsPhone ?? '-'], ['Xero contact', a.xeroContactId ? 'Linked' : 'Not sent to Xero yet']].map(([k, v]) => (
                <div key={k} className="border-b border-hairline pb-2 last:border-0"><dt className="text-xs">{k}</dt><dd className="font-semibold text-ink">{v}</dd></div>
              ))}
            </dl>
          </section>
          {(a.status === 'ACTIVE' || a.status === 'CLOSED') && (
            <form action={setAccountStatus} className={card}>
              <input type="hidden" name="accountId" value={a.id} /><input type="hidden" name="to" value={a.status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE'} />
              <p className="mb-3 text-sm">{a.status === 'ACTIVE' ? 'Closing stops new on-account bookings. Existing bookings and statements are kept.' : 'Reopening lets bookers book on account again.'}</p>
              <button type="submit" className={`${btn} border border-field bg-white text-ink`}>{a.status === 'ACTIVE' ? 'Close account' : 'Reopen account'}</button>
            </form>
          )}
        </aside>
      </div>
    </>
  );
}
