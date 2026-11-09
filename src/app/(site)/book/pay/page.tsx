import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { fmtSessionDates, fmtTime, gbp } from '@/lib/format';
import { holdLive } from '@/lib/booking';
import { DeliveryChip, Chip } from '@/components/ui';
import { HoldTimer } from '@/components/hold-timer';
import { checkoutBookingId, testPayment } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payment', robots: { index: false } };

export default async function PayPage() {
  const bid = await checkoutBookingId();
  if (!bid) redirect('/courses');
  const b = await db.booking.findUnique({ where: { id: bid }, include: { course: { include: { subject: true } }, session: true, attendees: true } });
  if (!b) redirect('/courses');
  if (b.status === 'CONFIRMED') redirect(`/book/outcome?ref=${b.reference}`);
  if (!holdLive(b)) redirect('/book/outcome?state=expired');

  const testMode = process.env.PAYMENTS_MODE !== 'stripe';
  return (
    <div className="flex flex-col gap-8 px-4 pb-16 pt-8 md:px-20 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div>
          <Link href={b.sessionId ? `/book/${b.sessionId}` : `/book/course/${b.course.slug}`} className="text-sm">← Change details</Link>
          <h1 className="mt-3 text-[32px] font-extrabold tracking-tight text-ink">Payment</h1>
        </div>
        <HoldTimer expiresAt={b.holdExpiresAt!.toISOString()} />
        <section className="rounded-card bg-white p-6 shadow-card md:p-8" aria-labelledby="pay-h">
          <h2 id="pay-h" className="mb-4 text-[22px] font-extrabold text-ink">Pay {gbp(b.totalPence)}</h2>
          {testMode ? (
            <>
              <p className="mb-5 rounded-control bg-warn-bg px-4 py-3 text-sm text-warn-fg">
                <strong>Test mode:</strong> no card is charged. Card, Apple Pay and Google Pay through Stripe replace these buttons before go-live.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <form action={testPayment} className="flex-1">
                  <input type="hidden" name="result" value="ok" />
                  <button type="submit" className="inline-flex min-h-[56px] w-full items-center justify-center rounded-chip bg-cyan px-6 text-base font-bold text-ink">Pay {gbp(b.totalPence)} (test)</button>
                </form>
                <form action={testPayment}>
                  <input type="hidden" name="result" value="fail" />
                  <button type="submit" className="inline-flex min-h-[56px] w-full items-center justify-center rounded-chip border border-field bg-white px-6 text-sm font-bold text-ink">Try a failed payment</button>
                </form>
              </div>
            </>
          ) : (
            <p>Card payments are being connected.</p>
          )}
          <p className="mt-4 text-[13px]">Secure payment by Stripe. We never see your card details.</p>
        </section>
      </div>
      <aside aria-label="Your booking" className="w-full overflow-hidden rounded-card bg-white shadow-card lg:w-[380px] lg:shrink-0">
        <p className="bg-ink px-6 py-4 font-bold text-white">Your booking · {b.reference}</p>
        <div className="flex flex-col gap-3 p-6">
          <div className="flex flex-wrap gap-1.5"><DeliveryChip type={b.course.deliveryType} /><Chip>{b.course.subject.name}</Chip></div>
          <h3 className="text-lg font-bold text-ink">{b.course.title}</h3>
          <p className="text-sm">{b.session ? `${fmtSessionDates(b.session.startsAt, b.session.endsAt)} · ${fmtTime(b.session.startsAt)} UK time` : 'eLearning · start any time'}</p>
          <dl className="mt-2 flex flex-col gap-2 border-t border-hairline pt-4 text-sm">
            <div className="flex justify-between"><dt>Places</dt><dd>{b.places}</dd></div>
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{gbp(b.subtotalPence)}</dd></div>
            <div className="flex justify-between"><dt>VAT ({b.course.vatRatePercent}%)</dt><dd>{gbp(b.vatPence)}</dd></div>
            <div className="flex justify-between border-t border-hairline pt-3 text-base font-extrabold text-ink"><dt>Total</dt><dd>{gbp(b.totalPence)}</dd></div>
          </dl>
          {b.attendees.some((a) => !a.personId) && <p className="text-[13px]">You can add the remaining attendees from your dashboard after booking.</p>}
        </div>
      </aside>
    </div>
  );
}
