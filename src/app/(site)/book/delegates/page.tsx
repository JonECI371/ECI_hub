import Link from 'next/link';
import type { Metadata } from 'next';
import { Breadcrumbs, Chip } from '@/components/ui';
import { bookingForDelegates, delegateState } from '@/lib/delegates';
import { registrationLink } from '@/lib/registration-link';
import { fmtSessionDates, fmtTime } from '@/lib/format';
import { assignDelegate, setBookerAttends } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Delegate details', robots: { index: false } };

const MSG: Record<string, [string, boolean]> = {
  linked: ['Link emailed. They can complete their details from the email.', true],
  invalid: ['Enter a first name, last name and a valid email address.', false],
  duplicate: ['That person is already on this booking.', false],
  error: ['That place cannot be changed here.', false],
  self: ['You are now one of the delegates, using your own details for place 1.', true],
  removed: ['You are no longer a delegate. Place 1 is free for someone else.', true],
  nofree: ['Every place already has someone named. Change one of the delegates first.', false],
  registered: ['You have already registered, so you cannot be removed here. Contact us if you need to change this.', false],
};
const input = 'box-border h-11 w-full rounded-control border border-field bg-white px-3 text-[15px] text-ink';
const btn = 'inline-flex min-h-11 items-center justify-center rounded-chip px-4 text-sm font-bold no-underline';
const pad = 'px-4 md:px-[max(4.1667%,calc((100%_-_1536px)/2))]';

export default async function Delegates({ searchParams }: { searchParams: Promise<{ ref?: string; msg?: string }> }) {
  const { ref, msg } = await searchParams;
  const b = ref ? await bookingForDelegates(ref) : null;
  if (!b) {
    return (
      <div className="flex flex-1 justify-center px-4 py-16">
        <section className="w-full max-w-[560px] rounded-card bg-white p-9 shadow-card">
          <h1 className="mb-3 text-[28px] font-extrabold text-ink">We could not find that booking</h1>
          <p className="mb-6 leading-relaxed">Log in to see your bookings and add delegate details.</p>
          <Link href="/login" className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-5 font-bold text-ink no-underline">Log in</Link>
        </section>
      </div>
    );
  }
  const c = b.course;
  const all = b.attendees.filter((a) => a.status !== 'CANCELLED');
  const live = [...all.filter((a) => a.personId === b.bookerId), ...all.filter((a) => a.personId !== b.bookerId)];
  const bookerIsDelegate = live.some((a) => a.personId === b.bookerId);
  const hasFree = live.some((a) => !a.personId);
  const bookerState = live.find((a) => a.personId === b.bookerId);
  const states = live.map((a) => delegateState(a, b.bookerId));
  const done = states.filter((s) => s.done).length;
  const notice = msg ? MSG[msg] : null;
  const when = b.session ? `${fmtSessionDates(b.session.startsAt, b.session.endsAt)} · ${fmtTime(b.session.startsAt)} to ${fmtTime(b.session.endsAt)} UK time` : 'Self-paced';

  return (
    <>
    <Breadcrumbs items={[['Home', '/'], ['Courses', '/courses'], [c.title, `/courses/${c.slug}`], ['Book'], ...(b.method === 'ACCOUNT' ? [] : [['Pay'] as [string]]), ['Delegate details']]} />
    <div className={`${pad} flex flex-col gap-6 pb-16 pt-6`}>
      <div>
        <h1 className="text-[32px] font-extrabold tracking-tight text-ink">Delegate details</h1>
        <p className="mt-1 max-w-[720px] text-[15px]">{c.title} · {when} · Booking {b.reference}. Add each person&apos;s details now, or email them a link to do it themselves. We remind anyone still incomplete 5 days before the course.</p>
      </div>
      <section className="rounded-card bg-white p-5 shadow-card md:p-6" aria-labelledby="by-h">
        <h2 id="by-h" className="mb-3 text-lg font-extrabold text-ink">Booked by</h2>
        <p className="font-semibold text-ink">{b.booker.firstName} {b.booker.lastName === '-' ? '' : b.booker.lastName}</p>
        <p className="text-sm">{b.booker.email}{b.booker.mobile ? ` · ${b.booker.mobile}` : ''}{b.account ? ` · ${b.account.company}` : b.booker.employer ? ` · ${b.booker.employer}` : ''}</p>
        {bookerIsDelegate ? (
          <form action={setBookerAttends} className="mt-4 flex flex-wrap items-center gap-3">
            <input type="hidden" name="ref" value={b.reference} /><input type="hidden" name="on" value="0" />
            <p className="text-sm">You are one of the delegates (place 1 below).</p>
            {!bookerState?.registration && <button type="submit" className={`${btn} border border-field bg-white text-ink`}>I am not attending</button>}
          </form>
        ) : (
          <form action={setBookerAttends} className="mt-4 flex flex-wrap items-center gap-3">
            <input type="hidden" name="ref" value={b.reference} /><input type="hidden" name="on" value="1" />
            <p className="text-sm">Are you one of the delegates?</p>
            {hasFree ? <button type="submit" className={`${btn} bg-cyan text-ink`}>Yes, use my details for place 1</button> : <p className="text-sm font-semibold">Every place is named already.</p>}
          </form>
        )}
      </section>
      <div>
        <div className="mb-1 flex justify-between text-sm font-semibold text-ink"><span>{done} of {live.length} complete</span></div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={live.length} aria-valuenow={done} aria-label="Delegate details complete" className="h-2.5 overflow-hidden rounded-full bg-hairline">
          <div className="h-full bg-cyan" style={{ width: `${live.length ? (100 * done) / live.length : 0}%` }} />
        </div>
      </div>
      {notice && <p role={notice[1] ? 'status' : 'alert'} className={`rounded-control px-4 py-3 text-sm font-semibold ${notice[1] ? 'bg-cyan-soft text-ink' : 'bg-bad-bg text-bad-fg'}`}>{notice[0]}</p>}

      <ul className="flex flex-col gap-4">
        {live.map((a, i) => {
          const st = states[i];
          const own = a.personId === b.bookerId;
          const who = a.person ? `${a.person.firstName} ${a.person.lastName === '-' ? '' : a.person.lastName}`.trim() : null;
          return (
            <li key={a.id} className="rounded-card bg-white p-5 shadow-card md:p-6" data-testid={`delegate-${st.key}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-extrabold text-ink">{`Place ${i + 1}: ${own ? 'You' : who ?? 'not named yet'}`}</h2>
                <Chip tone={st.tone}>{own && !st.done ? 'Details needed' : st.label}</Chip>
              </div>
              {a.person && !own && <p className="mb-3 text-sm">{a.person.email}</p>}
              {st.done ? (
                <div className="flex flex-wrap items-center gap-3">
                  {st.key === 'ENTERED' && <p className="text-sm">You entered these details. We emailed them a copy to check.</p>}
                  <Link href={`${registrationLink(a.id)}&for=1`} className={`${btn} border border-field bg-white text-ink`}>View or update</Link>
                </div>
              ) : own ? (
                <Link href={registrationLink(a.id)} className={`${btn} bg-cyan text-ink`}>Complete my registration</Link>
              ) : (
                <form action={assignDelegate} className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="ref" value={b.reference} />
                  <input type="hidden" name="attendeeId" value={a.id} />
                  <label className="flex flex-col gap-1 text-sm font-bold text-ink">First name<input name="firstName" defaultValue={a.person?.firstName ?? ''} required className={input} /></label>
                  <label className="flex flex-col gap-1 text-sm font-bold text-ink">Last name<input name="lastName" defaultValue={a.person && a.person.lastName !== '-' ? a.person.lastName : ''} required className={input} /></label>
                  <label className="flex flex-col gap-1 text-sm font-bold text-ink sm:col-span-2">Email<input name="email" type="email" defaultValue={a.person?.email ?? ''} required className={input} /></label>
                  {st.key === 'LINK_SENT' && <p className="text-sm sm:col-span-2">We emailed them a link. You can resend it, or fill their details in yourself.</p>}
                  <div className="flex flex-wrap gap-3 sm:col-span-2">
                    <button type="submit" name="intent" value="now" className={`${btn} bg-cyan text-ink`}>Fill in their details now</button>
                    <button type="submit" name="intent" value="link" className={`${btn} border border-field bg-white text-ink`}>{st.key === 'LINK_SENT' ? 'Resend their link' : 'Email them a link'}</button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Link href="/account" className={`${btn} bg-cyan text-ink`}>Go to my dashboard</Link>
        <Link href={`/book/outcome?ref=${b.reference}`} className={`${btn} border border-field bg-white text-ink`}>Back to my booking</Link>
      </div>
    </div>
    </>
  );
}
