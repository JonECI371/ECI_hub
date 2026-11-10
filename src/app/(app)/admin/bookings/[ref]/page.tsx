import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { gbp } from '@/lib/format';
import { STATUS_LABEL } from '@/lib/admin-bookings';
import { Chip, DeliveryChip } from '@/components/ui';
import { adminCancelBooking } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Booking', robots: { index: false } };

const MSG: Record<string, [string, boolean]> = {
  cancelled: ['Booking cancelled. Everyone on it has been emailed, and freed places have gone to the waitlist.', true],
  confirm: ['Give a reason and tick the box to confirm the cancellation.', false],
  notconfirmed: ['Only a confirmed booking can be cancelled.', false],
};
const dt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
const TONE = { CONFIRMED: 'soft', PAYMENT_PENDING: 'warn', COMPLETED: 'grey', CANCELLED: 'grey' } as const;
const ATT: Record<string, string> = { DETAILS_MISSING: 'Details missing', INVITED: 'Registration not done', REGISTERED: 'Registered', APPROVED: 'Approved', ATTENDED: 'Attended', NO_SHOW: 'No show', CERTIFIED: 'Certified', CANCELLED: 'Cancelled' };
const card = 'rounded-card bg-white p-6 shadow-card';
const PAY: Record<string, string> = { succeeded: 'Paid', refunded: 'Refunded', refunded_test: 'Refunded (test mode)', partially_refunded: 'Part refunded' };

export default async function AdminBooking({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ msg?: string }> }) {
  await requireAdmin('/admin/bookings');
  const { ref } = await params;
  const { msg } = await searchParams;
  const b = await db.booking.findUnique({
    where: { reference: decodeURIComponent(ref) },
    include: { booker: true, account: true, course: true, session: true, payments: true, attendees: { include: { person: true, registration: true } } },
  });
  if (!b) notFound();
  const history = await db.auditLog.findMany({ where: { recordType: 'Booking', recordId: b.id }, orderBy: { createdAt: 'desc' }, take: 20 });
  const notice = msg ? MSG[msg] : null;
  const paid = b.payments.filter((p) => p.status === 'succeeded').reduce((n, p) => n + p.amountPence - p.refundedPence, 0);

  return (
    <>
      <div>
        <p className="mb-1.5 text-xs"><Link href="/admin/bookings">Bookings</Link> › {b.reference}</p>
        <h1 className="text-[30px] font-extrabold tracking-tight text-ink">{b.reference}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm"><Chip tone={TONE[b.status]}>{STATUS_LABEL[b.status]}</Chip><DeliveryChip type={b.course.deliveryType} /></div>
      </div>
      {notice && <p role={notice[1] ? 'status' : 'alert'} className={`rounded-control px-4 py-3 text-sm font-semibold ${notice[1] ? 'bg-cyan-soft text-ink' : 'bg-bad-bg text-bad-fg'}`}>{notice[0]}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <section className={card} aria-labelledby="sum-h">
            <h2 id="sum-h" className="mb-3 text-lg font-extrabold text-ink">Booking</h2>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[140px_1fr]">
              <dt>Course</dt><dd className="font-bold text-ink"><Link href={`/admin/courses/${b.courseId}${b.sessionId ? `?session=${b.sessionId}` : ''}`}>{b.course.title}</Link></dd>
              <dt>Date</dt><dd className="font-bold text-ink">{b.session ? dt.format(b.session.startsAt) : 'Start any time (eLearning)'}</dd>
              <dt>Booked by</dt><dd className="font-bold text-ink"><Link href={`/admin/people/${b.bookerId}`}>{b.booker.firstName} {b.booker.lastName}</Link> <span className="font-normal">{b.booker.email}</span></dd>
              {b.account && <><dt>Account</dt><dd className="font-bold text-ink">{b.account.company}</dd></>}
              <dt>Places</dt><dd className="font-bold text-ink">{b.places}</dd>
              <dt>Total</dt><dd className="font-bold text-ink">{gbp(b.totalPence)} <span className="font-normal">({b.method === 'CARD' ? 'card' : 'on account'}{b.poNumber ? `, PO ${b.poNumber}` : ''})</span></dd>
              <dt>Booked</dt><dd className="font-bold text-ink">{dt.format(b.createdAt)}</dd>
            </dl>
          </section>

          <section className="overflow-hidden rounded-card bg-white shadow-card" aria-labelledby="att-h">
            <h2 id="att-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">Attendees</h2>
            <ul>
              {b.attendees.map((a, i) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-hairline px-6 py-3 text-sm last:border-0">
                  <span>{a.person ? <Link href={`/admin/people/${a.person.id}`} className="font-bold">{a.person.firstName} {a.person.lastName}</Link> : <span className="text-warn-fg">Place {i + 1}: name to follow</span>}</span>
                  <span>{ATT[a.status] ?? a.status}{a.registration?.approval === 'PENDING' ? ' · approval pending' : ''}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="overflow-hidden rounded-card bg-white shadow-card" aria-labelledby="pay-h">
            <h2 id="pay-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">Payments</h2>
            {b.payments.length === 0 ? <p className="px-6 py-6 text-sm">{b.method === 'ACCOUNT' ? 'On account: billed on the monthly statement.' : 'No payment yet.'}</p> : (
              <ul>{b.payments.map((p) => <li key={p.id} className="flex flex-wrap justify-between gap-2 border-b border-hairline px-6 py-3 text-sm last:border-0"><span className="font-bold text-ink">{gbp(p.amountPence)} · {PAY[p.status] ?? p.status}</span><span>{p.refundedPence ? `${gbp(p.refundedPence)} refunded · ` : ''}{dt.format(p.createdAt)}</span></li>)}</ul>
            )}
          </section>

          <section className="overflow-hidden rounded-card bg-white shadow-card" aria-labelledby="hist-h">
            <h2 id="hist-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">History</h2>
            {history.length === 0 ? <p className="px-6 py-6 text-sm">No changes recorded.</p> : (
              <ul>{history.map((h) => <li key={h.id} className="flex flex-wrap justify-between gap-2 border-b border-hairline px-6 py-2.5 text-sm last:border-0"><span className="font-semibold text-ink">{h.action.toLowerCase().replace(/_/g, ' ')}</span><span>{dt.format(h.createdAt)}</span></li>)}</ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          {b.status === 'CONFIRMED' && (
            <section className={card} aria-labelledby="cx-h">
              <h2 id="cx-h" className="mb-1 text-lg font-extrabold text-ink">Cancel this booking</h2>
              <p className="mb-4 text-sm">Admins can cancel at any time, inside or outside the customer&apos;s cut-off. Everyone on the booking is emailed, and freed places go to the waitlist.</p>
              <form action={adminCancelBooking} className="flex flex-col gap-3">
                <input type="hidden" name="ref" value={b.reference} />
                <label className="flex flex-col gap-1 text-sm font-bold text-ink">Reason (included in the email)
                  <textarea name="reason" required maxLength={200} rows={3} className="rounded-control border border-field bg-white px-3 py-2 text-sm font-normal" />
                </label>
                {b.method === 'ACCOUNT' && (
                  <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="refund" defaultChecked className="h-5 w-5" />Take {gbp(b.totalPence)} off the company statement</label>
                )}
                {b.method === 'CARD' && paid > 0 && (
                  <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="refund" defaultChecked className="h-5 w-5" />Refund {gbp(paid)} to the card</label>
                )}
                <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="confirm" required className="h-5 w-5" />I want to cancel {b.reference}</label>
                <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-chip bg-bad-fg px-4 text-sm font-bold text-white">Cancel booking</button>
              </form>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
