import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { currentPerson } from '@/lib/auth';
import { fmtSessionDates, fmtTime, gbp } from '@/lib/format';
import { holdLive } from '@/lib/booking';
import { registrationLink } from '@/lib/registration-link';
import { delegateState, delegatesPath } from '@/lib/delegates';
import { Breadcrumbs, DeliveryChip, Chip, type Crumb } from '@/components/ui';
import { checkoutBookingId } from '../actions';
import { statementText } from '@/lib/credit';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your booking', robots: { index: false } };

type Search = Promise<{ ref?: string; state?: string; pofail?: string }>;

function Steps({ items }: { items: [string, string][] }) {
  return (
    <section className="rounded-card bg-white p-6 shadow-card md:p-8">
      <h2 className="mb-5 text-[22px] font-extrabold text-ink">What happens next</h2>
      <ol className="grid gap-5 md:grid-cols-3">
        {items.map(([t, d], i) => (
          <li key={t}>
            <p className="mb-2 text-xl font-bold text-cyan">{String(i + 1).padStart(2, '0')}</p>
            <h3 className="mb-1 font-bold text-ink">{t}</h3>
            <p className="text-sm leading-relaxed">{d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Message({ eyebrow, title, children, tone = 'ok', crumbs }: { eyebrow: string; title: string; children: React.ReactNode; tone?: 'ok' | 'bad'; crumbs?: Crumb[] }) {
  return (
    <div className={`${tone === 'ok' ? 'hero-motif' : 'bg-ink'} px-4 pb-10 pt-12 md:px-[max(4.1667%,calc((100%_-_1536px)/2))]`}>
      {crumbs && <Breadcrumbs tone="dark" className="mb-3" items={crumbs} />}
      <p className={`mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] ${tone === 'ok' ? 'text-cyan' : 'text-[#FFB59A]'}`}>{eyebrow}</p>
      <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-white md:text-[44px]">{title}</h1>
      <div className="max-w-[720px] text-[17px] leading-relaxed text-white/80">{children}</div>
    </div>
  );
}

export default async function Outcome({ searchParams }: { searchParams: Search }) {
  const { ref, state, pofail } = await searchParams;
  const bid = await checkoutBookingId();
  const me = await currentPerson();

  if (state === 'failed' && bid) {
    const b = await db.booking.findUnique({ where: { id: bid }, include: { course: true } });
    const live = b && holdLive(b);
    return (
      <>
        <Message eyebrow="Payment not taken" title="Your payment didn't go through" tone="bad">
          <p>Your card was declined. Nothing has been charged{live ? ' and your places are still held' : ''}.</p>
        </Message>
        <div className="flex flex-col gap-4 px-4 py-10 md:px-[max(4.1667%,calc((100%_-_1536px)/2))]">
          <p>Try another card, or Apple Pay or Google Pay. If it keeps failing, call us on +44 (0) 1932 963463.</p>
          <div className="flex flex-wrap gap-3">
            <Link href={live ? '/book/pay' : b ? `/courses/${b.course.slug}` : '/courses'} className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-5 font-bold text-ink no-underline">Try again</Link>
            <Link href="/contact" className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-5 font-bold text-ink no-underline">Contact us</Link>
          </div>
        </div>
      </>
    );
  }

  const b = ref
    ? await db.booking.findUnique({
        where: { reference: ref },
        include: { booker: true, course: { include: { subject: true } }, session: { include: { venue: true } }, attendees: { include: { registration: true } } },
      })
    : null;
  // Only the browser that made the booking, or the booker when signed in, can see it.
  const allowed = b && (b.id === bid || b.bookerId === me?.id);
  if (!b || !allowed || b.status !== 'CONFIRMED') {
    return (
      <>
        <Message eyebrow="Booking" title={state === 'expired' ? 'Your hold has ended' : 'We could not find that booking'} tone="bad">
          <p>{state === 'expired' ? 'Places are held for 5 minutes. Nothing has been charged. Start again to check what is still available.' : 'Log in to see your bookings.'}</p>
        </Message>
        <div className="flex flex-wrap gap-3 px-4 py-10 md:px-[max(4.1667%,calc((100%_-_1536px)/2))]">
          <Link href="/courses" className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-5 font-bold text-ink no-underline">Choose a course</Link>
          <Link href="/login" className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-5 font-bold text-ink no-underline">Log in</Link>
        </div>
      </>
    );
  }

  const c = b.course;
  const elearn = c.deliveryType === 'ELEARNING';
  const mine = b.attendees.find((a) => a.personId === b.bookerId && !a.registration);
  const regLink = mine ? registrationLink(mine.id) : null;
  const dateWord = b.session ? fmtSessionDates(b.session.startsAt, b.session.endsAt).split(' ').slice(1, 3).join(' ') : '';
  const steps: [string, string][] = elearn
    ? [
        ['Complete registration', `${c.subject.name} needs a few details from you. It takes about 3 minutes.`],
        ['We enrol you', 'Usually within 1 working day.'],
        ['Your login arrives', `From the learning platform, by email.${c.daysToComplete ? ` You then have ${c.daysToComplete} days to finish.` : ''}`],
      ]
    : c.deliveryType === 'VIRTUAL_CLASSROOM'
      ? [
          [`${c.meetingPlatform === 'ZOOM' ? 'Zoom' : 'Teams'} invite`, `A calendar invite for ${dateWord} arrives by email. Same link for everyone on the session.`],
          ['Reminders', 'We email you the day before and an hour before the start.'],
          ['Your certificate', `Issued once you complete the course${c.validityYears ? `, valid for ${c.validityYears} years` : ''}.`],
        ]
      : [
          ['Joining instructions', c.subject.approvalRequired ? 'Each attendee completes registration. The venue address follows once it is approved.' : 'Each attendee gets a registration form and joining instructions with the venue address.'],
          ['Trainer notified', 'Your trainer sees the class list, plus any dietary or access needs.'],
          ['Your certificate', `Issued once you complete the course${c.validityYears ? `, valid for ${c.validityYears} years` : ''}.`],
        ];
  const others = b.attendees.filter((a) => a.status !== 'CANCELLED' && a.personId !== b.bookerId);
  const othersTodo = others.filter((a) => !delegateState(a, b.bookerId).done).length;
  const missing = b.attendees.filter((a) => !a.personId).length;

  return (
    <>
      <Message crumbs={[['Home', '/'], ['Courses', '/courses'], [c.title, `/courses/${c.slug}`], ['Book'], ...(b.method === 'ACCOUNT' ? [] : [['Pay'] as Crumb]), ['Confirmed']]} eyebrow="Booking confirmed" title={elearn ? `You're enrolled, ${b.booker.firstName}` : b.places > 1 ? `${b.places} places booked on ${c.title}` : `You're booked, ${b.booker.firstName}`}>
        {Number(pofail) > 0 && <p className="rounded-control border border-warn-line bg-warn-bg p-3 text-warn-fg">Your booking is confirmed, but {Number(pofail) === 1 ? '1 of your PO files was' : `${Number(pofail)} of your PO files were`} not saved. Please email {Number(pofail) === 1 ? 'it' : 'them'} to us, quoting your booking reference.</p>}
        <p>Reference <strong className="text-white">{b.reference}</strong>. {b.method === 'ACCOUNT' ? `Confirmed on account. Your confirmation is on its way to ${b.booker.email}.` : `Your receipt is on its way to ${b.booker.email}.`}</p>
      </Message>
      <div className="flex flex-col gap-8 px-4 py-10 md:px-[max(4.1667%,calc((100%_-_1536px)/2))] lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {regLink && (
            <section className="flex flex-col gap-4 rounded-card bg-cyan-soft p-6 md:flex-row md:items-center md:justify-between md:p-8">
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-ink">{othersTodo > 0 ? 'Your own details · 2 minutes' : 'One more thing · 2 minutes'}</p>
                <h2 className="mb-1 text-[22px] font-extrabold text-ink">Complete your registration now</h2>
                <p className="text-[15px]">We have filled in what we know.</p>
              </div>
              <Link href={regLink} className="inline-flex min-h-[52px] shrink-0 items-center justify-center rounded-chip bg-ink px-6 font-bold text-white no-underline hover:text-white">Complete registration</Link>
            </section>
          )}
          {othersTodo > 0 && (
            <section className="flex flex-col gap-4 rounded-card bg-cyan-soft p-6 md:flex-row md:items-center md:justify-between md:p-8">
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-ink">{othersTodo} of {others.length} still to do</p>
                <h2 className="mb-1 text-[22px] font-extrabold text-ink">Add your delegates&apos; details</h2>
                <p className="text-[15px]">Fill each person in now, or email them a link. We remind anyone still incomplete 5 days before.</p>
              </div>
              <Link href={delegatesPath(b.reference)} className="inline-flex min-h-[52px] shrink-0 items-center justify-center rounded-chip bg-ink px-6 font-bold text-white no-underline hover:text-white">Delegate details</Link>
            </section>
          )}
          <Steps items={steps} />
          <div className="flex flex-wrap gap-3">
            <Link href="/account" className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-5 font-bold text-ink no-underline">Go to my dashboard</Link>
            <Link href="/courses" className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-5 font-bold text-ink no-underline">Book another course</Link>
          </div>
        </div>
        <aside aria-label="Your booking" className="w-full overflow-hidden rounded-card bg-white shadow-card lg:w-[380px] lg:shrink-0">
          <p className="bg-ink px-6 py-4 font-bold text-white">Your booking</p>
          <div className="flex flex-col gap-3 p-6">
            <div className="flex flex-wrap gap-1.5"><DeliveryChip type={c.deliveryType} /><Chip>{c.subject.name}</Chip></div>
            <h3 className="text-lg font-bold text-ink">{c.title}</h3>
            <p className="text-sm">{b.session ? `${fmtSessionDates(b.session.startsAt, b.session.endsAt)} · ${fmtTime(b.session.startsAt)} to ${fmtTime(b.session.endsAt)} UK time` : `Self-paced${c.daysToComplete ? ` · ${c.daysToComplete} days to complete once your login arrives` : ''}`}</p>
            <dl className="mt-2 flex flex-col gap-2 border-t border-hairline pt-4 text-sm">
              <div className="flex justify-between"><dt>Places</dt><dd>{b.places}</dd></div>
              {b.poNumber && <div className="flex justify-between"><dt>PO number</dt><dd>{b.poNumber}</dd></div>}
              <div className="flex justify-between font-extrabold text-ink"><dt>{b.method === 'ACCOUNT' ? 'On account' : 'Paid by card'}</dt><dd>{gbp(b.totalPence)}</dd></div>
              {b.method === 'ACCOUNT' && <p className="text-[13px] font-normal">{statementText()}</p>}
            </dl>
          </div>
        </aside>
      </div>
    </>
  );
}
