import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePerson } from '@/lib/auth';
import { fmtTime } from '@/lib/format';
import { attendeeState, bookingsIMade, myPlaces } from '@/lib/portal';
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
  const [places, made, certs] = await Promise.all([
    myPlaces(me.id),
    bookingsIMade(me.id),
    db.certificate.findMany({ where: { personId: me.id }, include: { course: true }, orderBy: { issuedAt: 'desc' } }),
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
      <div>
        <p className="mb-1.5 text-xs">My account</p>
        <h1 className="text-[30px] font-extrabold tracking-tight text-ink">Hello, {me.firstName}</h1>
      </div>

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

      <section aria-labelledby="up-h" className="overflow-hidden rounded-card bg-white shadow-card">
        <div className="border-b border-hairline px-6 py-4">
          <h2 id="up-h" className="text-lg font-extrabold text-ink">Upcoming</h2>
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
