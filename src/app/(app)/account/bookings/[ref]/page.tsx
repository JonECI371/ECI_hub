import Link from 'next/link';
import { notFound } from 'next/navigation';
import { managesBooking } from '@/lib/booker';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePerson } from '@/lib/auth';
import { fmtSessionDates, fmtTime, gbp } from '@/lib/format';
import { placesLeft } from '@/lib/sessions';
import { attendeeState, cutoffWords, withinCutoff } from '@/lib/portal';
import { registrationLink } from '@/lib/registration-link';
import { Chip, DeliveryChip } from '@/components/ui';
import { cancelBooking, changeDate, sendReminders, setAttendee } from '../actions';
import { loadPolicy, policyLines, steer } from '@/lib/cancellation-policy';
import { cancellationOutcome } from '@/lib/cancellation-text';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Booking', robots: { index: false } };

const MSG: Record<string, [string, boolean]> = {
  added: ['Attendee added. They have been emailed their joining details and registration link.', true],
  swapped: ['Attendee changed. The new person has been emailed.', true],
  reminded: ['Reminders sent.', true],
  none: ['Everyone has already registered.', true],
  changed: ['Date changed. Everyone on the booking has been emailed.', true],
  requested: ['Request sent. Our team will reply by email.', true],
  cancelled: ['Booking cancelled and the places released. Everyone on the booking has been emailed. Our team will confirm any refund or charge by email.', true],
  cutoff: ['That change is no longer possible: the cut-off has passed.', false],
  nodate: ['That date no longer has enough places. Choose another.', false],
  invalid: ['Enter a name and a valid email address.', false],
  duplicate: ['That person is already on this booking.', false],
  error: ['Something went wrong. Try again.', false],
};

const longDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
const btn = 'inline-flex min-h-11 items-center justify-center rounded-chip px-4 text-sm font-bold';
const input = 'box-border h-11 w-full rounded-control border border-field bg-white px-3 text-[15px] text-ink';

export default async function BookingDetail({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ msg?: string }> }) {
  const me = await requirePerson();
  const { ref } = await params;
  const { msg } = await searchParams;
  const b = await db.booking.findUnique({
    where: { reference: ref },
    include: {
      booker: true,
      account: true,
      addedTo: true,
      addedPlaces: { where: { status: { in: ['CONFIRMED', 'PAYMENT_PENDING'] } }, orderBy: { createdAt: 'asc' } },
      course: { include: { subject: true } },
      session: { include: { venue: true } },
      attendees: { include: { person: true, registration: true, enrolment: true }, orderBy: { id: 'asc' } },
    },
  });
  if (!b || b.status === 'PAYMENT_PENDING') notFound();
  const isBooker = await managesBooking(me.id, b);
  const mine = b.attendees.find((a) => a.personId === me.id);
  if (!isBooker && !mine) notFound();

  const c = b.course;
  const s = b.session;
  const live = b.status === 'CONFIRMED';
  const policy = await loadPolicy();
  const spare = s ? (await placesLeft([s])).get(s.id) ?? 0 : 0;
  const sg = s ? steer(policy, s.startsAt, b.totalPence) : null;
  const outcome = cancellationOutcome(b);
  const canCancel = isBooker && live && (c.deliveryType === 'ELEARNING' ? !b.attendees.some((a) => a.enrolment?.enrolledAt) : !!s && s.startsAt > new Date());
  const enrolled = b.attendees.some((a) => a.enrolment?.enrolledAt);
  const canChange = isBooker && live && withinCutoff(s, c.subject, enrolled);
  const cut = cutoffWords(c.subject.changeCutoffHours);
  const others = isBooker && live && s && c.deliveryType !== 'ELEARNING'
    ? await db.session.findMany({ where: { courseId: c.id, status: 'PUBLISHED', startsAt: { gt: new Date() }, id: { not: s.id } }, orderBy: { startsAt: 'asc' }, take: 8 })
    : [];
  const left = await placesLeft(others);
  const choices = others.filter((o) => (left.get(o.id) ?? 0) >= b.places);
  const visible = isBooker ? b.attendees : b.attendees.filter((a) => a.personId === me.id);
  const notice = msg ? MSG[msg] : null;
  const noticeWords = !sg || sg.hoursNotice === Infinity ? '' : sg.hoursNotice < 48 ? `${Math.floor(sg.hoursNotice)} hours' notice` : `${Math.floor(sg.hoursNotice / 24)} days' notice`;
  const cancelBlock = (
    <details className="rounded-control border border-hairline p-4">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="block font-bold text-ink">Cancel booking</span>
        <span className="text-sm">Any refund depends on how much notice you give. Our team confirms it by email.</span>
      </summary>
      <form action={cancelBooking} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="ref" value={b.reference} />
        <p className="text-sm">All {b.places} {b.places === 1 ? 'place' : 'places'} will be cancelled now and the places released. Attendees get an email to say so. This cannot be undone.</p>
        {sg && <p className={`rounded-control px-4 py-3 text-sm ${sg.chargePercent === 0 ? 'bg-cyan-soft text-ink' : 'bg-warn-bg text-warn-fg'}`}>You would be giving {noticeWords}. {sg.chargePercent === 0 ? 'Under our policy that is a full refund.' : sg.chargePercent >= 100 ? `Under our policy the full ${gbp(b.totalPence)} would be charged.` : `Under our policy ${sg.chargePercent}% would be charged and the rest refunded.`} Our team confirms the outcome by email, and can often move you to another date instead. Questions: +44 (0) 1932 963463.</p>}
        <details className="text-sm"><summary className="cursor-pointer font-bold text-ink">Our cancellation policy</summary><ul className="mt-2 list-disc pl-5">{policyLines(policy).map((l) => <li key={l}>{l}</li>)}</ul><p className="mt-2"><Link href="/legal/terms#cancellations-and-refunds">Read the full terms</Link></p></details>
        <label className="flex flex-col gap-1 text-sm font-bold text-ink">Reason
          <select name="reason" required className={input} defaultValue="">
            <option value="" disabled>Choose a reason</option>
            <option>Date no longer suits</option><option>Attendee left the company</option><option>Booked in error</option><option>Other</option>
          </select>
        </label>
        <button type="submit" className={`${btn} bg-bad-fg text-white`}>Cancel booking</button>
      </form>
    </details>
  );

  const where = c.deliveryType === 'ELEARNING'
    ? `Online, via ${c.provider ?? 'the learning platform'}`
    : c.deliveryType === 'VIRTUAL_CLASSROOM'
      ? c.meetingPlatform === 'ZOOM' ? 'Zoom' : 'Microsoft Teams'
      : s?.venue ? (c.subject.approvalRequired && !b.attendees.some((a) => a.registration?.approval === 'APPROVED') ? `${s.venue.name} (full address after approval)` : `${s.venue.name}, ${s.venue.address}, ${s.venue.postcode}`) : 'Venue to be confirmed';

  return (
    <>
      <div>
        <p className="mb-1.5 text-xs"><Link href="/account/bookings">My bookings</Link> › {b.reference}</p>
        <h1 className="text-[30px] font-extrabold tracking-tight text-ink">Booking {b.reference}</h1>
      </div>
      {notice && <p role="status" className={`rounded-control px-4 py-3 text-sm font-semibold ${notice[1] ? 'bg-cyan-soft text-ink' : 'bg-bad-bg text-bad-fg'}`}>{notice[0]}</p>}

      <section className="rounded-card bg-white p-6 shadow-card">
        <div className="mb-2 flex flex-wrap gap-1.5"><DeliveryChip type={c.deliveryType} /><Chip>{c.subject.name}</Chip>{!live && <Chip tone="grey">{b.status === 'CANCELLED' ? 'Cancelled' : 'Completed'}</Chip>}</div>
        {b.addedTo && <p className="mb-2 text-sm">Places added to booking <Link href={`/account/bookings/${b.addedTo.reference}`} className="font-bold">{b.addedTo.reference}</Link>.</p>}
        {b.addedPlaces.length > 0 && <p className="mb-2 text-sm">Added places: {b.addedPlaces.map((x, i) => <span key={x.id}>{i > 0 && ', '}<Link href={`/account/bookings/${x.reference}`} className="font-bold">{x.reference}</Link> ({x.places} {x.places === 1 ? 'place' : 'places'}{x.status === 'PAYMENT_PENDING' ? ', awaiting payment' : ''})</span>)}</p>}
        <h2 className="mb-1 text-[22px] font-extrabold text-ink">{c.title}</h2>
        <p className="mb-5 text-[15px]">{s ? `${fmtSessionDates(s.startsAt, s.endsAt)} · ${fmtTime(s.startsAt)} to ${fmtTime(s.endsAt)} UK time` : `Self-paced${c.daysToComplete ? ` · ${c.daysToComplete} days to complete after registration` : ''}`}</p>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs font-bold uppercase tracking-[0.08em]">Booking reference</dt><dd className="text-ink">{b.reference}</dd></div>
          <div><dt className="text-xs font-bold uppercase tracking-[0.08em]">Booked by</dt><dd className="text-ink">{b.booker.firstName} {b.booker.lastName}{b.account ? `, ${b.account.company}` : ''}</dd></div>
          <div><dt className="text-xs font-bold uppercase tracking-[0.08em]">Booked on</dt><dd className="text-ink">{longDate.format(b.createdAt)}</dd></div>
          {isBooker && <div><dt className="text-xs font-bold uppercase tracking-[0.08em]">Paid</dt><dd className="text-ink">{b.method === 'CARD' ? `${gbp(b.totalPence)} by card` : `${gbp(b.totalPence)} on account`}{outcome && <span className="mt-1 block font-bold">{outcome}</span>}</dd></div>}
          <div className="sm:col-span-2"><dt className="text-xs font-bold uppercase tracking-[0.08em]">Where</dt><dd className="text-ink">{where}{s?.joinUrl && c.deliveryType === 'VIRTUAL_CLASSROOM' && live && <> · <a href={s.joinUrl}>Join link</a></>}</dd></div>
        </dl>
      </section>

      <section className="overflow-hidden rounded-card bg-white shadow-card" aria-labelledby="att-h">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-6 py-4">
          <h2 id="att-h" className="text-lg font-extrabold text-ink">Attendees ({visible.filter((a) => a.status !== 'CANCELLED').length})</h2>
          {isBooker && live && b.attendees.some((a) => a.person && !a.registration && a.personId !== me.id) && (
            <form action={sendReminders}><input type="hidden" name="ref" value={b.reference} /><button type="submit" className={`${btn} border border-field bg-white text-ink`}>Send registration reminder</button></form>
          )}
        </div>
        <ul>
          {visible.map((a, i) => {
            const st = attendeeState(a, c);
            return (
              <li key={a.id} className="flex flex-col gap-3 border-b border-hairline px-6 py-4 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-ink">{a.person ? `${a.person.firstName} ${a.person.lastName === '-' ? '' : a.person.lastName}` : `Place ${i + 1}`}</p>
                    <p className="text-sm">{a.person?.email ?? 'No attendee yet'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={st.tone}>{st.label}</Chip>
                    {st.needsRegistration && a.personId === me.id && live && <Link href={registrationLink(a.id)} className={`${btn} bg-cyan text-ink no-underline`}>Complete registration</Link>}
                  </div>
                </div>
                {isBooker && live && !a.personId && (
                  <form action={setAttendee} className="grid gap-3 rounded-control bg-page p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <input type="hidden" name="ref" value={b.reference} /><input type="hidden" name="attendeeId" value={a.id} />
                    <label className="flex flex-col gap-1 text-sm font-bold text-ink">Full name<input name="name" required className={input} /></label>
                    <label className="flex flex-col gap-1 text-sm font-bold text-ink">Email<input name="email" type="email" required className={input} /></label>
                    <button type="submit" className={`${btn} bg-cyan text-ink`}>Add attendee</button>
                  </form>
                )}
                {isBooker && canChange && a.personId && a.status !== 'CANCELLED' && (
                  <details className="text-sm">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center text-ink underline decoration-cyan decoration-2 underline-offset-[3px]">Send someone else instead</summary>
                    <form action={setAttendee} className="mt-2 grid gap-3 rounded-control bg-page p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <input type="hidden" name="ref" value={b.reference} /><input type="hidden" name="attendeeId" value={a.id} />
                      <label className="flex flex-col gap-1 text-sm font-bold text-ink">Full name<input name="name" required className={input} /></label>
                      <label className="flex flex-col gap-1 text-sm font-bold text-ink">Email<input name="email" type="email" required className={input} /></label>
                      <button type="submit" className={`${btn} border border-field bg-white text-ink`}>Swap attendee</button>
                    </form>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {isBooker && live && (
        <section className="rounded-card bg-white p-6 shadow-card" aria-labelledby="manage-h">
          <h2 id="manage-h" className="mb-4 text-lg font-extrabold text-ink">Manage this booking</h2>
          {c.deliveryType !== 'ELEARNING' && s && s.startsAt > new Date() && spare > 0 && <p className="mb-4"><Link href={`/book/${s.id}?add=${b.reference}`} className={`${btn} border border-field bg-white text-ink no-underline`}>Add places</Link><span className="ml-3 text-sm">More people for the same date, paid for separately and shown under this booking.</span></p>}
          {!canChange ? (
            <div className="flex flex-col gap-4">{canCancel && cancelBlock}<p className="text-sm">{s ? `Date changes close ${cut} before the start, so the date can no longer be changed online.` : 'This course has started, so it can no longer be cancelled online.'} Need help? <Link href="/contact">Contact us</Link>.</p></div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {s && (
                <details className="rounded-control border border-hairline p-4">
                  <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <span className="block font-bold text-ink">{c.deliveryType === 'IN_PERSON' ? 'Request a date change' : 'Change date'}</span>
                    <span className="text-sm">{c.deliveryType === 'IN_PERSON' ? 'Our team reviews date change requests for in-person courses and replies by email.' : `Change to another date up to ${cut} before the start, if there are places.`}</span>
                  </summary>
                  <form action={changeDate} className="mt-4 flex flex-col gap-3">
                    <input type="hidden" name="ref" value={b.reference} />
                    {choices.length === 0 && c.deliveryType !== 'IN_PERSON' ? (
                      <p className="text-sm">No other dates are available. <Link href="/contact?topic=team">Contact us</Link> for additional dates or an in-house course.</p>
                    ) : (
                      <fieldset className="flex flex-col gap-2">
                        <legend className="mb-1 text-sm font-bold text-ink">New date for all {b.places} {b.places === 1 ? 'attendee' : 'attendees'}</legend>
                        {choices.map((o) => (
                          <label key={o.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-hairline px-3 text-sm">
                            <input type="radio" name="sessionId" value={o.id} required={c.deliveryType !== 'IN_PERSON'} className="accent-ink" />
                            <span className="flex-1 text-ink">{fmtSessionDates(o.startsAt, o.endsAt)}, {fmtTime(o.startsAt)}</span>
                            <span>{left.get(o.id)} places left</span>
                          </label>
                        ))}
                      </fieldset>
                    )}
                    {(choices.length > 0 || c.deliveryType === 'IN_PERSON') && (
                    <label className="flex flex-col gap-1 text-sm font-bold text-ink">Reason for the change <span className="font-normal">(optional)</span><textarea name="reason" className="min-h-[72px] rounded-control border border-field px-3 py-2 font-normal" /></label>
                    )}
                    {(choices.length > 0 || c.deliveryType === 'IN_PERSON') && <button type="submit" className={`${btn} bg-cyan text-ink`}>{c.deliveryType === 'IN_PERSON' ? 'Send request' : 'Confirm new date'}</button>}
                  </form>
                </details>
              )}
              {canCancel && cancelBlock}
            </div>
          )}
        </section>
      )}
    </>
  );
}
