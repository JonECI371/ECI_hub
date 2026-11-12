import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requirePerson } from '@/lib/auth';
import { accountSummary, myMembership } from '@/lib/booker';
import { money } from '@/lib/format';
import { PO_RULES } from '@/lib/accounts';
import { Chip } from '@/components/ui';
import { PoTable } from '@/components/po-table';
import { poSummary } from '@/lib/purchase-orders';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Account and billing', robots: { index: false } };

const monthName = (ym: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-15T12:00:00Z`));
const dm = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
const STATUS = { OPEN: ['soft', 'Open'], ISSUED: ['grey', 'Invoiced'], OVERDUE: ['bad', 'Overdue'], PAID: ['grey', 'Paid'] } as const;

export default async function Billing() {
  const me = await requirePerson();
  const m = await myMembership(me.id);
  if (!m) redirect('/account');
  const a = m.account;
  const [s, pos] = await Promise.all([accountSummary(a), poSummary(a.id)]);
  const lastDay = (() => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)); })();

  return (
    <>
      <div>
        <p className="mb-1.5 text-xs">{a.company}</p>
        <h1 className="text-[30px] font-extrabold tracking-tight text-ink">Account and billing</h1>
      </div>
      {a.status === 'ON_HOLD' && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">Your account is on hold because an invoice is overdue. New bookings need a card payment until it is paid.</p>}

      <section aria-label="Credit" className="grid gap-4 sm:grid-cols-3">
        {([['Credit limit', money(s.limit), `${a.paymentTermsDays}-day terms`], ['Available', money(s.available), "After this month's bookings"], ['This month', money(s.thisMonth), `Invoiced ${lastDay.getUTCDate()} ${new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(lastDay)}`]] as const).map(([k, v, sub]) => (
          <div key={k} className="rounded-card bg-white p-5 shadow-card">
            <p className="text-sm">{k}</p>
            <p className="mt-1 text-[28px] font-extrabold leading-tight text-ink tabular-nums">{v}</p>
            <p className="text-[13px]">{sub}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-6">
        <section aria-labelledby="st-h" className="overflow-hidden rounded-card bg-white shadow-card">
          <h2 id="st-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">Statements</h2>
          {s.statements.length === 0 ? <p className="px-6 py-6 text-sm">Your first statement appears here once you book on account.</p> : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-[#FAFAFA] text-xs uppercase tracking-[0.06em]"><tr>{['Month', 'Bookings', 'Amount inc. VAT', 'Invoice', 'Status'].map((h) => <th key={h} className="px-6 py-3">{h}</th>)}</tr></thead>
                <tbody>
                  {s.statements.map((st) => {
                    const [tone, label] = STATUS[st.status];
                    return (
                      <tr key={st.id} className="border-t border-hairline">
                        <td className="px-6 py-3 font-bold text-ink">{monthName(st.month)}</td>
                        <td className="px-6 py-3 tabular-nums">{st.bookings}</td>
                        <td className="px-6 py-3 tabular-nums">{money(st.totalPence)}</td>
                        <td className="px-6 py-3">{st.xeroInvoiceNo ?? '-'}</td>
                        <td className="px-6 py-3"><Chip tone={tone}>{st.status === 'ISSUED' && st.dueAt ? `Due ${dm.format(st.dueAt)}` : label}</Chip></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-hairline px-6 py-3 text-[13px]">Invoices are emailed to {a.accountsEmail} at the end of each month. See what is on this month&apos;s statement in <Link href="/account/bookings">Bookings</Link>.</p>
        </section>

        {pos.length > 0 && (
          <section aria-labelledby="po-h" className="overflow-hidden rounded-card bg-white shadow-card">
            <h2 id="po-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">Purchase orders</h2>
            <PoTable rows={pos} />
            <p className="border-t border-hairline px-6 py-3 text-[13px]">Billed is what is on your statements for each PO. Add the PO amount when you book to see how much is left.</p>
          </section>
        )}
        </div>

        <aside className="flex flex-col gap-6">
          <section aria-labelledby="co-h" className="rounded-card bg-white p-6 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="co-h" className="text-lg font-extrabold text-ink">Company details</h2>
              <Link href="/contact?topic=other" className="text-sm">Request a change</Link>
            </div>
            <dl className="flex flex-col gap-2 text-sm">
              {[['Company', a.company], ['Company number', a.companyNumber], ['VAT number', a.vatNumber ?? 'Not given'], ['Invoices sent to', a.accountsEmail], ['PO numbers', PO_RULES[a.poRule as keyof typeof PO_RULES] ?? a.poRule]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-hairline py-1.5 last:border-0"><dt>{k}</dt><dd className="text-right font-semibold text-ink">{v}</dd></div>
              ))}
            </dl>
          </section>
          <p className="rounded-card bg-cyan-soft p-5 text-sm text-ink">Need a higher limit? <Link href="/contact?topic=other">Ask us</Link> and we review it within one working day.</p>
        </aside>
      </div>
    </>
  );
}
