import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePerson } from '@/lib/auth';
import { fmtTime } from '@/lib/format';
import { attendeeState, bookingsIMade, myPlaces } from '@/lib/portal';
import { accountSummary, myMembership, teamExpiries } from '@/lib/booker';
import { money } from '@/lib/format';
import { statementText } from '@/lib/credit';
import { fmtSessionDates } from '@/lib/format';
import { SITE_URL } from '@/lib/format';
import { leaveWaitlist } from './waitlist-actions';
import { registrationLink } from '@/lib/registration-link';
import { Chip, DeliveryChip } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dashboard', robots: { index: false } };

const TZ = 'Europe/London';
const dow = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: TZ });
const dm = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: TZ });
const longDay = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
const dmy = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ });

const btn = 'inline-flex min-h-11 items-center justify-center rounded-chip px-4 text-sm font-bold no-underline';

export default async function Dashboard() {
  const me = await requirePerson();
  const m = await myMembership(me.id);
  const [places, made, certs, summary, expiring, waits, madeForOthers, teamUpcoming] = await Promise.all([
    myPlaces(me.id),
    bookingsIMade(me.id, m ? [m.accountId] : []),
    db.certificate.findMany({ where: { personId: me.id }, include: { course: true }, orderBy: { issuedAt: 'desc' } }),
    m ? accountSummary(m.account) : null,
    m ? teamExpiries(m.accountId) : [],
    db.waitlistEntry.findMany({ where: { personId: me.id, session: { startsAt: { gt: new Date() }, status: { not: 'CANCELLED' } } }, include: { session: { include: { course: true } } }, orderBy: { createdAt: 'asc' } }),
    db.booking.findMany({ where: { bookerId: me.id, status: 'CONFIRMED', ...(m ? { accountId: null } : {}), OR: [{ session: { startsAt: { gt: new Date() } } }, { sessionId: null }], attendees: { some: { personId: { not: me.id } } } }, include: { course: true, session: true, attendees: { where: { status: { not: 'CANCELLED' } }, include: { person: true } } }, orderBy: { createdAt: 'desc' }, take: 10 }),
    m ? db.booking.findMany({ where: { accountId: m.accountId, status: 'CONFIRMED', OR: [{ session: { startsAt: { gt: new Date() } } }, { sessionId: null }] }, include: { course: true, session: true, attendees: { where: { status: { not: 'CANCELLED' } }, include: { registration: true, enrolment: true } } }, orderBy: { session: { startsAt: 'asc' } }, take: 12 }) : [],
  ]);
  const rows = places.map((a) => ({ a, st: attendeeState(a, a.booking.course) }));
  const action = rows.find((r) => r.st.needsRegistration);
  const attention = made.flatMap((b) => {
    const missing = b.attendees.filter((x) => !x.personId).length;
    const unreg = b.attendees.filter((x) => x.personId && x.personId !== me.id && !x.registration);
    const items: { b: typeof b; text: string; cta: string }[] = [];
    if (missing) items.push({ b, text: `${missing} ${missing === 1 ? 'place has' : 'places have'} no attendee yet`, cta: 'Add attendees' });
    if (unreg.length) items.push({ b, text: `${unreg.map((x) => x.person!.firstName).join(', ')} ${unreg.length === 1 ? "hasn't" : "haven't"} registered`, cta: 'View booking' });
    return items;
  });

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1.5 text-xs">{m ? `${m.role === 'MAIN_BOOKER' ? 'Main booker' : 'Booker'} · ${m.account.company} · Credit account` : 'My account'}</p>
          <h1 className="text-[30px] font-extrabold tracking-tight text-ink">Hello, {me.firstName}</h1>
        </div>
        {m && <Link href="/courses" className={`${btn} bg-cyan text-ink`}>Book a course</Link>}
      </div>

      {m && m.account.status === 'ON_HOLD' && (
        <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">Your account is on hold because an invoice is overdue. New bookings need a card payment until it is paid. Questions? Call +44 (0) 1932 963463.</p>
      )}

      {summary && (
        <section aria-label="Account summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {([
            ['Available credit', money(summary.available), `of ${money(summary.limit)} limit`],
            ['Booked this month', money(summary.thisMonth), statementText().replace(/^Added to your \w+ statement, invoiced on (.*)\.$/, 'On your $1 statement')],
            ['Upcoming places', String(summary.upcomingPlaces), `Across ${summary.upcomingSessions} ${summary.upcomingSessions === 1 ? 'session' : 'sessions'}`],
            ['Need your attention', String(attention.length), 'Attendee details or registrations'],
          ] as const).map(([k, v, sub]) => (
            <div key={k} className="rounded-card bg-white p-5 shadow-card">
              <p className="text-sm">{k}</p>
              <p className="mt-1 text-[28px] font-extrabold leading-tight text-ink tabular-nums">{v}</p>
              <p className="text-[13px]">{sub}</p>
            </div>
          ))}
        </section>
      )}

      {action && (
        <section aria-labelledby="action-h" className="flex flex-col gap-4 rounded-card bg-warn-bg p-6 text-warn-fg md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em]">Action needed</p>
            <h2 id="action-h" className="mb-1 text-lg font-extrabold text-ink">Complete your registration for {action.a.booking.course.title}</h2>
            <p className="text-sm">{action.a.booking.session ? `${longDay.format(action.a.booking.session.startsAt)}. ` : ''}Takes about 3 minutes.</p>
          </div>
          <Link href={registrationLink(action.a.id)} className={`${btn} shrink-0 bg-ink text-white hover:text-white`}>Complete registration</Link>
        </section>
      )}

      {waits.length > 0 && (
        <section aria-labelledby="wl-h" className="overflow-hidden rounded-card bg-white shadow-card">
          <h2 id="wl-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">Your waitlist</h2>
          <ul>
            {waits.map((w) => {
              const offered = !!w.offerToken && !!w.offerExpiresAt && w.offerExpiresAt > new Date();
              const hours = offered ? Math.max(1, Math.ceil((w.offerExpiresAt!.getTime() - Date.now()) / 3600000)) : 0;
              return (
                <li key={w.id} className={`flex flex-col gap-3 border-b border-hairline px-6 py-4 last:border-0 md:flex-row md:items-center md:justify-between ${offered ? 'bg-cyan-soft' : ''}`}>
                  <div>
                    {offered && <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-ink">A place is waiting for you</p>}
                    <p className="font-bold text-ink">{w.session.course.title}</p>
                    <p className="text-sm">{fmtSessionDates(w.session.startsAt, w.session.endsAt)}, {fmtTime(w.session.startsAt)} · {w.places} {w.places === 1 ? 'place' : 'places'}</p>
                    <p className="text-sm">{offered ? `Claim it within ${hours} ${hours === 1 ? 'hour' : 'hours'}, then it goes to the next person.` : `You are on the waitlist. We email you if a place comes up.`}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {offered && <a href={`${SITE_URL}/waitlist/claim/${w.offerToken}`} className={`${btn} bg-cyan text-ink`}>Claim my place</a>}
                    <form action={leaveWaitlist}><input type="hidden" name="entryId" value={w.id} /><button type="submit" className={`${btn} border border-field bg-white text-ink`}>Leave the waitlist</button></form>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {madeForOthers.length > 0 && (
        <section aria-labelledby="mfo-h" className="overflow-hidden rounded-card bg-white shadow-card">
          <h2 id="mfo-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">Booked for others</h2>
          <ul>
            {madeForOthers.map((b) => (
              <li key={b.id} className="flex flex-col gap-2 border-b border-hairline px-6 py-4 last:border-0 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-bold text-ink">{b.course.title}{b.session ? ` · ${dm.format(b.session.startsAt)}` : ''}</p>
                  <p className="text-sm">{b.attendees.filter((a) => a.person && a.personId !== me.id).map((a) => `${a.person!.firstName} ${a.person!.lastName}`).join(', ') || 'Names to follow'}</p>
                </div>
                <Link href={`/account/bookings/${b.reference}`} className={`${btn} shrink-0 border border-field bg-white text-ink`}>View booking</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {attention.length > 0 && (
        <section aria-labelledby="att-h" className="overflow-hidden rounded-card bg-white shadow-card">
          <h2 id="att-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">Needs your attention</h2>
          <ul>
            {attention.map((x, i) => (
              <li key={i} className="flex flex-col gap-3 border-b border-hairline px-6 py-4 last:border-0 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-bold text-ink">{x.b.course.title}{x.b.session ? ` · ${dm.format(x.b.session.startsAt)}` : ''}</p>
                  <p className="text-sm">{x.text}</p>
                </div>
                <Link href={`/account/bookings/${x.b.reference}`} className={`${btn} shrink-0 border border-field bg-white text-ink`}>{x.cta}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {m && (
        <section aria-labelledby="tb-h" className="overflow-hidden rounded-card bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
            <h2 id="tb-h" className="text-lg font-extrabold text-ink">Upcoming bookings</h2>
            <Link href="/account/bookings" className="text-sm">All bookings →</Link>
          </div>
          {teamUpcoming.length === 0 ? <p className="px-6 py-6 text-sm">No upcoming bookings on the account. <Link href="/courses">Book a course</Link></p> : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-[#FAFAFA] text-xs uppercase tracking-[0.06em]"><tr>{['Date', 'Course', 'Type', 'People', 'Status'].map((h) => <th key={h} className="px-6 py-3">{h}</th>)}</tr></thead>
                <tbody>
                  {teamUpcoming.map((b) => {
                    const missing = b.attendees.filter((a) => !a.personId).length;
                    const named = b.attendees.filter((a) => a.personId);
                    const reg = named.filter((a) => a.registration || a.enrolment?.enrolledAt).length;
                    const status: ['soft' | 'warn', string] = missing ? ['warn', `${missing} ${missing === 1 ? 'attendee' : 'attendees'} missing`] : reg < named.length ? ['warn', `${reg} of ${named.length} registered`] : ['soft', b.course.deliveryType === 'ELEARNING' ? 'Enrolled' : 'Ready'];
                    return (
                      <tr key={b.id} className="border-t border-hairline">
                        <td className="whitespace-nowrap px-6 py-3 font-bold text-ink">{b.session ? `${dow.format(b.session.startsAt)} ${dm.format(b.session.startsAt)}` : 'Any time'}</td>
                        <td className="px-6 py-3"><Link href={`/account/bookings/${b.reference}`} className="font-bold">{b.course.title}</Link></td>
                        <td className="px-6 py-3"><DeliveryChip type={b.course.deliveryType} /></td>
                        <td className="px-6 py-3 tabular-nums">{b.places}</td>
                        <td className="px-6 py-3"><Chip tone={status[0]}>{status[1]}</Chip></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {m && (
        <section aria-labelledby="te-h" className="overflow-hidden rounded-card bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
            <h2 id="te-h" className="text-lg font-extrabold text-ink">Team certificates expiring</h2>
            <Link href="/account/team" className="text-sm">Whole team →</Link>
          </div>
          {expiring.length === 0 ? <p className="px-6 py-6 text-sm">Nothing expires in the next 6 months.</p> : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-[#FAFAFA] text-xs uppercase tracking-[0.06em]"><tr>{['Person', 'Certificate', 'Expires', ''].map((h, i) => <th key={i} className="px-6 py-3">{h}</th>)}</tr></thead>
                <tbody>
                  {expiring.map((c) => (
                    <tr key={c.id} className="border-t border-hairline">
                      <td className="px-6 py-3 font-bold text-ink">{c.person.firstName} {c.person.lastName}</td>
                      <td className="px-6 py-3">{c.course.title}</td>
                      <td className="px-6 py-3 tabular-nums">{dmy.format(c.expiresAt!)}</td>
                      <td className="px-6 py-3 text-right"><Link href={`/courses/${c.course.slug}#dates`} className={`${btn} border border-field bg-white text-ink`}>Book renewal</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {!(m && rows.length === 0) && (
      <section aria-labelledby="up-h" className="overflow-hidden rounded-card bg-white shadow-card">
        <div className="border-b border-hairline px-6 py-4">
          <h2 id="up-h" className="text-lg font-extrabold text-ink">{m ? 'Your own places' : 'Upcoming'}</h2>
          <p className="text-sm">Everything you are booked on, with what you need for each.</p>
        </div>
        {rows.length === 0 ? (
          <p className="px-6 py-8">Nothing booked yet. <Link href="/courses">Find a course</Link></p>
        ) : (
          <ul>
            {rows.map(({ a, st }) => {
              const b = a.booking;
              const c = b.course;
              const s = b.session;
              const venueOk = c.deliveryType === 'IN_PERSON' && s?.venue && (!c.subject.approvalRequired || a.registration?.approval === 'APPROVED');
              return (
                <li key={a.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-5 gap-y-3 border-b border-hairline px-6 py-5 last:border-0 md:grid-cols-[72px_minmax(0,1fr)_auto]">
                  <div>
                    <p className="text-[13px]">{s ? dow.format(s.startsAt) : 'Any'}</p>
                    <p className="text-lg font-extrabold leading-tight text-ink">{s ? dm.format(s.startsAt) : 'time'}</p>
                  </div>
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap gap-1.5"><DeliveryChip type={c.deliveryType} /><Chip>{c.subject.name}</Chip></div>
                    <p className="font-bold text-ink">{c.title}</p>
                    <p className="text-[13px]">
                      {s
                        ? `${fmtTime(s.startsAt)} to ${fmtTime(s.endsAt)} UK time · ${c.deliveryType === 'IN_PERSON' ? (venueOk ? `${s.venue!.name}, ${s.venue!.address}, ${s.venue!.postcode}` : 'Venue address follows approval') : c.meetingPlatform === 'ZOOM' ? 'Zoom' : 'Microsoft Teams'}`
                        : `Self-paced${a.enrolment?.deadline ? ` · finish by ${dmy.format(a.enrolment.deadline)}` : ''}`}
                    </p>
                    <div className="mt-2"><Chip tone={st.tone}>{st.label}</Chip></div>
                  </div>
                  <div className="col-start-2 flex flex-wrap items-start gap-2 md:col-start-auto md:justify-end">
                    {st.needsRegistration && <Link href={registrationLink(a.id)} className={`${btn} bg-cyan text-ink`}>Complete registration</Link>}
                    {!st.needsRegistration && s?.joinUrl && c.deliveryType === 'VIRTUAL_CLASSROOM' && <a href={s.joinUrl} className={`${btn} bg-cyan text-ink`}>Join on {c.meetingPlatform === 'ZOOM' ? 'Zoom' : 'Teams'}</a>}
                    {venueOk && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s!.venue!.address} ${s!.venue!.postcode}`)}`} className={`${btn} border border-field bg-white text-ink`}>Directions</a>}
                    <Link href={`/account/bookings/${b.reference}`} className={`${btn} border border-field bg-white text-ink`}>Details</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      )}

      <section aria-labelledby="cert-h" className="overflow-hidden rounded-card bg-white shadow-card">
        <h2 id="cert-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">My certificates</h2>
        {certs.length === 0 ? (
          <p className="px-6 py-6 text-sm">Certificates appear here after your course.</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-[#FAFAFA] text-xs uppercase tracking-[0.06em]"><tr><th className="px-6 py-3">Certificate</th><th className="px-6 py-3">Awarded</th><th className="px-6 py-3">Valid until</th></tr></thead>
              <tbody>
                {certs.map((c) => {
                  const soon = c.expiresAt && c.expiresAt.getTime() - Date.now() < 90 * 86400000;
                  return (
                    <tr key={c.id} className="border-t border-hairline">
                      <td className="px-6 py-3 font-bold text-ink">{c.course.title}</td>
                      <td className="px-6 py-3 tabular-nums">{dmy.format(c.issuedAt)}</td>
                      <td className="px-6 py-3 tabular-nums">{c.expiresAt ? dmy.format(c.expiresAt) : 'Does not expire'} {soon && <Chip tone="warn">Renew soon</Chip>}</td>
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
