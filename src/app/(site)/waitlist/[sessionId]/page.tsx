import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { currentPerson, verify } from '@/lib/auth';
import { fmtSessionDates, fmtTime } from '@/lib/format';
import { queuePosition } from '@/lib/waitlist';
import { DeliveryChip, Chip } from '@/components/ui';
import { joinWaitlistAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Join the waitlist', robots: { index: false } };

const input = 'box-border h-[46px] w-full rounded-control border border-field bg-white px-3.5 text-[15px] text-ink';

export default async function WaitlistJoin({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ w?: string; error?: string }> }) {
  const { sessionId } = await params;
  const { w, error } = await searchParams;
  const s = await db.session.findUnique({ where: { id: sessionId }, include: { course: { include: { subject: true } } } });
  if (!s || s.course.status !== 'PUBLISHED' || s.startsAt <= new Date()) notFound();
  const me = await currentPerson();
  const joined = verify<{ eid: string; exp: number }>(w);
  const entry = joined ? await db.waitlistEntry.findUnique({ where: { id: joined.eid } }) : null;
  const pos = entry ? await queuePosition(entry.id) : null;

  const summary = (
    <aside aria-label="Session" className="w-full overflow-hidden rounded-card bg-white shadow-card lg:w-[360px] lg:shrink-0">
      <p className="bg-ink px-6 py-4 font-bold text-white">Waitlist</p>
      <div className="flex flex-col gap-3 p-6">
        <div className="flex flex-wrap gap-1.5"><DeliveryChip type={s.course.deliveryType} /><Chip>{s.course.subject.name}</Chip></div>
        <h3 className="text-lg font-bold text-ink">{s.course.title}</h3>
        <p className="text-sm">{fmtSessionDates(s.startsAt, s.endsAt)} · {fmtTime(s.startsAt)} to {fmtTime(s.endsAt)} UK time</p>
        {entry && <dl className="flex flex-col gap-2 border-t border-hairline pt-3 text-sm"><div className="flex justify-between"><dt>Places wanted</dt><dd>{entry.places}</dd></div><div className="flex justify-between font-bold text-ink"><dt>Position</dt><dd>{pos}</dd></div></dl>}
      </div>
    </aside>
  );

  if (entry) {
    return (
      <>
        <div className="hero-motif px-4 pb-10 pt-12 md:px-20">
          <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-cyan">Waitlist</p>
          <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-white md:text-[44px]">You&apos;re number {pos} on the waitlist</h1>
          <p className="text-[17px] text-white/80">This date is full. Nothing has been charged.</p>
        </div>
        <div className="flex flex-col gap-8 px-4 py-10 md:px-20 lg:flex-row lg:items-start">
          <section className="flex-1 rounded-card bg-white p-6 shadow-card md:p-8">
            <h2 className="mb-5 text-[22px] font-extrabold text-ink">What happens next</h2>
            <ol className="grid gap-5 md:grid-cols-3">
              {[['We email you', 'If a place comes up, you get an email with a one-click link.'], ['Claim within 24 hours', 'Click the link and pay to confirm. No code to type.'], ['Leave any time', 'Use the link in your offer email, or ignore it.']].map(([h, d], i) => (
                <li key={h}><p className="mb-2 text-xl font-bold text-cyan">{String(i + 1).padStart(2, '0')}</p><h3 className="mb-1 font-bold text-ink">{h}</h3><p className="text-sm">{d}</p></li>
              ))}
            </ol>
            <Link href={`/courses/${s.course.slug}#dates`} className="mt-6 inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-5 font-bold text-ink no-underline">See other dates</Link>
          </section>
          {summary}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-8 px-4 pb-16 pt-8 md:px-20 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div>
          <Link href={`/courses/${s.course.slug}#dates`} className="text-sm">← Back to dates</Link>
          <h1 className="mt-3 text-[32px] font-extrabold tracking-tight text-ink">Join the waitlist</h1>
          <p className="mt-1 text-[15px]">If a place comes up, we email you a link to claim it. You have 24 hours to pay and confirm. Nothing is charged now.</p>
        </div>
        {error && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 font-semibold text-bad-fg">Enter your name and a valid email address.</p>}
        <form action={joinWaitlistAction} className="grid gap-4 rounded-card bg-white p-6 shadow-card sm:grid-cols-2 md:p-8">
          <input type="hidden" name="sessionId" value={s.id} />
          <label className="flex flex-col gap-1.5 text-sm font-bold text-ink">Full name<input name="name" required autoComplete="name" defaultValue={me ? `${me.firstName} ${me.lastName}` : ''} className={input} /></label>
          <label className="flex flex-col gap-1.5 text-sm font-bold text-ink">Email<input name="email" type="email" required autoComplete="email" defaultValue={me?.email} readOnly={!!me} className={input} /></label>
          <label className="flex flex-col gap-1.5 text-sm font-bold text-ink">Places wanted<input name="places" type="number" min={1} max={20} defaultValue={1} className={input} /></label>
          <div className="flex items-end"><button type="submit" className="inline-flex min-h-[46px] w-full items-center justify-center rounded-chip bg-cyan px-5 font-bold text-ink">Join the waitlist</button></div>
        </form>
      </div>
      {summary}
    </div>
  );
}
