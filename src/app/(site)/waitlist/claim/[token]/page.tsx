import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { fmtSessionDates, fmtTime, gbp } from '@/lib/format';
import { pricing } from '@/lib/booking';
import { offerFreedPlaces } from '@/lib/waitlist';
import { DeliveryChip, Chip } from '@/components/ui';
import { claimOffer, declineOffer } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Claim your place', robots: { index: false } };

const until = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' });

export default async function Claim({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const e = await db.waitlistEntry.findUnique({ where: { offerToken: token }, include: { session: { include: { course: { include: { subject: true } } } } } });
  const live = e && e.offerExpiresAt && e.offerExpiresAt > new Date();

  if (!e || !live) {
    // Pass an expired offer on to the next person straight away.
    if (e) await offerFreedPlaces(e.sessionId);
    const slug = e?.session.course.slug;
    return (
      <>
        <div className="bg-ink px-4 pb-10 pt-12 md:px-20">
          <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-[#FFB59A]">Offer ended</p>
          <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-white md:text-[44px]">This place has gone to the next person</h1>
          <p className="text-[17px] text-white/80">{e?.offerExpiresAt ? `The 24-hour window ended at ${until.format(e.offerExpiresAt).replace(' at', ' on')}. ` : ''}You can still book another date.</p>
        </div>
        <div className="flex flex-wrap gap-3 px-4 py-10 md:px-20">
          <Link href={slug ? `/courses/${slug}#dates` : '/courses'} className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-5 font-bold text-ink no-underline">See other dates</Link>
          {e && <Link href={`/waitlist/${e.sessionId}`} className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-5 font-bold text-ink no-underline">Join the waitlist again</Link>}
        </div>
      </>
    );
  }

  const s = e.session;
  const c = s.course;
  const money = pricing(c.pricePence, c.vatRatePercent, e.places);
  const hours = Math.max(1, Math.round((e.offerExpiresAt!.getTime() - Date.now()) / 3600000));
  return (
    <>
      <div className="hero-motif px-4 pb-10 pt-12 md:px-20">
        <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-cyan">A place has come up</p>
        <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-white md:text-[44px]">Your {e.places === 1 ? 'place is' : 'places are'} ready to claim</h1>
        <p className="text-[17px] text-white/80">Held for you until {until.format(e.offerExpiresAt!)} ({hours} {hours === 1 ? 'hour' : 'hours'} left). After that it goes to the next person.</p>
      </div>
      <div className="flex flex-col gap-8 px-4 py-10 md:px-20 lg:flex-row lg:items-start">
        <section className="flex-1 rounded-card bg-white p-6 shadow-card md:p-8">
          <h2 className="mb-2 text-[22px] font-extrabold text-ink">Confirm and pay</h2>
          <p className="mb-5 text-sm">You came here from the link in your email, so there is no code to enter.</p>
          {error && <p role="alert" className="mb-4 rounded-control bg-bad-bg px-4 py-3 font-semibold text-bad-fg">We could not hold the place. Try again, or call us on +44 (0) 1932 963463.</p>}
          <form action={claimOffer}>
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="inline-flex min-h-[56px] w-full items-center justify-center rounded-chip bg-cyan px-6 text-base font-bold text-ink">Pay {gbp(money.totalPence)} and confirm</button>
          </form>
          <form action={declineOffer} className="mt-4">
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="min-h-11 text-sm text-ink underline decoration-cyan decoration-2 underline-offset-[3px]">I no longer want this place</button>
          </form>
        </section>
        <aside aria-label="The place on offer" className="w-full overflow-hidden rounded-card bg-white shadow-card lg:w-[360px] lg:shrink-0">
          <p className="bg-ink px-6 py-4 font-bold text-white">The place on offer</p>
          <div className="flex flex-col gap-3 p-6">
            <div className="flex flex-wrap gap-1.5"><DeliveryChip type={c.deliveryType} /><Chip>{c.subject.name}</Chip></div>
            <h3 className="text-lg font-bold text-ink">{c.title}</h3>
            <p className="text-sm">{fmtSessionDates(s.startsAt, s.endsAt)} · {fmtTime(s.startsAt)} to {fmtTime(s.endsAt)} UK time</p>
            <dl className="flex flex-col gap-2 border-t border-hairline pt-3 text-sm"><div className="flex justify-between"><dt>Places</dt><dd>{e.places}</dd></div><div className="flex justify-between font-bold text-ink"><dt>Price inc. VAT</dt><dd>{gbp(money.totalPence)}</dd></div></dl>
          </div>
        </aside>
      </div>
    </>
  );
}
