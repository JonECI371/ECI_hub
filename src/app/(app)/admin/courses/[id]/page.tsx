import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { fmtSessionDates, fmtTime, gbp } from '@/lib/format';
import { placesLeft } from '@/lib/sessions';
import { attendeeState } from '@/lib/portal';
import { offerFreedPlaces } from '@/lib/waitlist';
import { Chip, DeliveryChip } from '@/components/ui';
import { addSession, cancelSession, updateSession } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Course', robots: { index: false } };

const MSG: Record<string, [string, boolean]> = {
  saved: ['Course saved.', true], sessionadded: ['Session added.', true], updated: ['Session updated.', true], cancelled: ['Session cancelled. Everyone booked has been emailed and refunds recorded.', true],
  badsession: ['Check the date and times: the session must start in the future and end after it starts.', false], confirmname: ['Type the course name exactly to cancel the session.', false],
};
const btn = 'inline-flex min-h-11 items-center justify-center rounded-chip px-4 text-sm font-bold';
const input = 'h-11 rounded-control border border-field bg-white px-3 text-sm text-ink';
const short = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });

export default async function AdminCourse({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ session?: string; msg?: string }> }) {
  await requireAdmin('/admin/courses');
  const { id } = await params;
  const { session: sid, msg } = await searchParams;
  const c = await db.course.findUnique({ where: { id }, include: { subject: true, defaultVenue: true } });
  if (!c) notFound();
  const sessions = await db.session.findMany({ where: { courseId: id, OR: [{ endsAt: { gt: new Date(Date.now() - 30 * 86400000) } }] }, include: { trainer: true, venue: true }, orderBy: { startsAt: 'asc' } });
  const left = await placesLeft(sessions);
  const selected = sessions.find((s) => s.id === sid) ?? sessions.find((s) => s.startsAt > new Date()) ?? null;
  if (selected) await offerFreedPlaces(selected.id); // pass on any expired waitlist offers
  const [attendees, waitlist, trainers, venues] = await Promise.all([
    db.attendee.findMany({
      where: { booking: { courseId: id, sessionId: c.deliveryType === 'ELEARNING' ? null : selected?.id ?? '__none__', status: { in: ['CONFIRMED', 'COMPLETED'] } } },
      include: { person: true, registration: true, enrolment: true, booking: { include: { booker: true, account: true } } },
      orderBy: { booking: { createdAt: 'asc' } },
    }),
    selected ? db.waitlistEntry.findMany({ where: { sessionId: selected.id }, include: { person: true }, orderBy: { position: 'asc' } }) : Promise.resolve([]),
    db.person.findMany({ where: { roles: { has: 'TRAINER' } }, orderBy: { firstName: 'asc' } }),
    db.venue.findMany({ orderBy: { name: 'asc' } }),
  ]);
  const notice = msg ? MSG[msg] : null;
  const live = attendees.filter((a) => a.status !== 'CANCELLED');

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1.5 text-xs"><Link href="/admin/courses">Courses</Link> / {c.subject.name}</p>
          <h1 className="text-[30px] font-extrabold tracking-tight text-ink">{c.title}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5"><Chip tone={c.status === 'PUBLISHED' ? 'soft' : 'warn'}>{c.status === 'PUBLISHED' ? 'Published' : c.status === 'DRAFT' ? 'Draft' : 'Withdrawn'}</Chip><Chip>{c.subject.name}</Chip><DeliveryChip type={c.deliveryType} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.status === 'PUBLISHED' && <Link href={`/courses/${c.slug}`} className={`${btn} border border-field bg-white text-ink no-underline`}>View page</Link>}
          <Link href={`/admin/courses/${c.id}/edit`} className={`${btn} bg-cyan text-ink no-underline`}>Edit course</Link>
        </div>
      </div>
      {notice && <p role="status" className={`rounded-control px-4 py-3 text-sm font-semibold ${notice[1] ? 'bg-cyan-soft text-ink' : 'bg-bad-bg text-bad-fg'}`}>{notice[0]}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {c.deliveryType !== 'ELEARNING' && (
            <section className="overflow-hidden rounded-card bg-white shadow-card" aria-labelledby="sess-h">
              <h2 id="sess-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">Sessions</h2>
              {sessions.length === 0 ? <p className="px-6 py-6 text-sm">No sessions yet. Add one below.</p> : (
                <ul>
                  {sessions.map((s) => {
                    const booked = s.capacity - (left.get(s.id) ?? 0);
                    const on = s.id === selected?.id;
                    return (
                      <li key={s.id} className={`border-b border-hairline last:border-0 ${on ? 'bg-cyan-soft shadow-[inset_4px_0_0_#2EC39B]' : ''}`}>
                        <Link href={`/admin/courses/${c.id}?session=${s.id}`} aria-current={on ? 'true' : undefined} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-ink no-underline">
                          <span><span className="block font-bold">{short.format(s.startsAt)} · {fmtTime(s.startsAt)}</span><span className="text-[13px]">{s.trainer ? `${s.trainer.firstName} ${s.trainer.lastName}` : 'No trainer'}{s.venue ? ` · ${s.venue.name}` : ''}</span></span>
                          <span className="flex items-center gap-2 text-sm"><span className="tabular-nums">{booked} of {s.capacity}</span><Chip tone={s.status === 'PUBLISHED' ? 'soft' : s.status === 'CANCELLED' ? 'bad' : 'grey'}>{s.status === 'PUBLISHED' ? 'Published' : s.status.charAt(0) + s.status.slice(1).toLowerCase()}</Chip></span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              <details className="border-t border-hairline px-6 py-4">
                <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold text-ink">+ Add a session</summary>
                <form action={addSession} className="mt-3 grid gap-3 sm:grid-cols-3">
                  <input type="hidden" name="courseId" value={c.id} />
                  <label className="flex flex-col gap-1 text-xs font-bold">Date<input type="date" name="date" required className={input} /></label>
                  <label className="flex flex-col gap-1 text-xs font-bold">Starts (UK time)<input type="time" name="start" defaultValue="09:00" required className={input} /></label>
                  <label className="flex flex-col gap-1 text-xs font-bold">Ends<input type="time" name="end" defaultValue={c.durationText.toLowerCase().includes('half') ? '12:30' : '16:30'} required className={input} /></label>
                  <label className="flex flex-col gap-1 text-xs font-bold">Days<input type="number" name="days" min={1} max={10} defaultValue={/(\d+) days/.exec(c.durationText)?.[1] ?? 1} className={input} /></label>
                  <label className="flex flex-col gap-1 text-xs font-bold">Places<input type="number" name="capacity" min={1} defaultValue={c.placesPerSession ?? 12} className={input} /></label>
                  <label className="flex flex-col gap-1 text-xs font-bold">Trainer<select name="trainerId" className={input}><option value="">Not yet</option>{trainers.map((t) => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}</select></label>
                  {c.deliveryType === 'IN_PERSON' && <label className="flex flex-col gap-1 text-xs font-bold sm:col-span-2">Venue<select name="venueId" defaultValue={c.defaultVenueId ?? ''} className={input}><option value="">Course default</option>{venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>}
                  <label className="flex min-h-11 items-center gap-2 text-sm text-ink sm:col-span-2"><input type="checkbox" name="publish" defaultChecked className="size-5 accent-ink" />Publish now (shows on the website)</label>
                  <button type="submit" className={`${btn} bg-cyan text-ink sm:col-start-3`}>Add session</button>
                </form>
              </details>
            </section>
          )}

          <section className="overflow-hidden rounded-card bg-white shadow-card" aria-labelledby="del-h">
            <h2 id="del-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">
              {c.deliveryType === 'ELEARNING' ? 'Learners' : 'Delegates'} ({live.length}){selected && c.deliveryType !== 'ELEARNING' && <span className="ml-2 text-sm font-normal">{fmtSessionDates(selected.startsAt, selected.endsAt)}</span>}
            </h2>
            {live.length === 0 ? <p className="px-6 py-6 text-sm">Nobody booked yet.</p> : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-[#FAFAFA] text-xs uppercase tracking-[0.06em]"><tr>{['Delegate', 'Booking', 'Payment', 'Registration', 'Needs'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
                  <tbody>
                    {live.map((a) => {
                      const st = attendeeState(a, { ...c, subject: c.subject });
                      const ans = (a.registration?.answers ?? {}) as Record<string, string>;
                      const needs = [ans.dietary && `Diet: ${ans.dietary}`, ans.accessNeeds && `Access: ${ans.accessNeeds}`].filter(Boolean).join(' · ');
                      return (
                        <tr key={a.id} className="border-t border-hairline align-top">
                          <td className="px-4 py-3">{a.person ? <><span className="block font-bold text-ink">{a.person.firstName} {a.person.lastName}</span><span className="text-xs">{a.person.email}</span></> : <span className="text-warn-fg">Attendee details missing</span>}</td>
                          <td className="px-4 py-3"><Link href={`/admin/bookings?q=${a.booking.reference}`}>{a.booking.reference}</Link><span className="block text-xs">{a.booking.account ? `Account · ${a.booking.account.company}` : `${a.booking.booker.firstName} ${a.booking.booker.lastName}`}</span></td>
                          <td className="px-4 py-3">{a.booking.method === 'CARD' ? 'Card' : 'On account'}</td>
                          <td className="px-4 py-3"><Chip tone={st.tone}>{st.label}</Chip></td>
                          <td className="px-4 py-3 text-xs">{needs || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {selected && (
            <section className="overflow-hidden rounded-card bg-white shadow-card" aria-labelledby="wl-h">
              <h2 id="wl-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">Waitlist ({waitlist.length})</h2>
              {waitlist.length === 0 ? <p className="px-6 py-6 text-sm">Nobody waiting.</p> : (
                <ol>
                  {waitlist.map((w, i) => (
                    <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-6 py-3 last:border-0">
                      <span><span className="font-bold text-ink">{i + 1}. {w.person.firstName} {w.person.lastName}</span> <span className="text-xs">{w.person.email} · {w.places} {w.places === 1 ? 'place' : 'places'}</span></span>
                      {w.offerExpiresAt && w.offerExpiresAt > new Date() ? <Chip tone="warn">Offered, until {fmtTime(w.offerExpiresAt)} {short.format(w.offerExpiresAt)}</Chip> : <Chip tone="grey">Waiting</Chip>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-6 xl:sticky xl:top-6">
          {selected && c.deliveryType !== 'ELEARNING' && (
            <section className="rounded-card bg-white p-6 shadow-card" aria-labelledby="sel-h">
              <h2 id="sel-h" className="mb-1 text-lg font-extrabold text-ink">This session</h2>
              <p className="mb-4 text-sm">{fmtSessionDates(selected.startsAt, selected.endsAt)}, {fmtTime(selected.startsAt)} to {fmtTime(selected.endsAt)}</p>
              {selected.status !== 'CANCELLED' ? (
                <div className="flex flex-col gap-4">
                  <form action={updateSession} className="flex items-end gap-2">
                    <input type="hidden" name="sessionId" value={selected.id} /><input type="hidden" name="op" value="trainer" />
                    <label className="flex flex-1 flex-col gap-1 text-xs font-bold">Trainer<select name="trainerId" defaultValue={selected.trainerId ?? ''} className={input}><option value="">No trainer</option>{trainers.map((t) => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}</select></label>
                    <button type="submit" className={`${btn} border border-field bg-white text-ink`}>Save</button>
                  </form>
                  <form action={updateSession} className="flex items-end gap-2">
                    <input type="hidden" name="sessionId" value={selected.id} /><input type="hidden" name="op" value="capacity" />
                    <label className="flex flex-1 flex-col gap-1 text-xs font-bold">Places<input type="number" name="capacity" min={1} defaultValue={selected.capacity} className={input} /></label>
                    <button type="submit" className={`${btn} border border-field bg-white text-ink`}>Save</button>
                  </form>
                  {c.deliveryType === 'VIRTUAL_CLASSROOM' && (
                    <div className="rounded-control bg-page p-3 text-sm">
                      <p className="mb-2 font-bold text-ink">Teams meeting</p>
                      {selected.joinUrl ? <p className="mb-2">Invites sent. <a href={selected.joinUrl} target="_blank" rel="noopener noreferrer">Open the Teams link</a></p> : <p className="mb-2">No meeting yet. It is created when the session is published and someone books.</p>}
                      <form action={updateSession}>
                        <input type="hidden" name="sessionId" value={selected.id} /><input type="hidden" name="op" value="teams" />
                        <button type="submit" className={`${btn} w-full border border-field bg-white text-ink`}>{selected.joinUrl ? 'Resend and update invites' : 'Create Teams meeting now'}</button>
                      </form>
                    </div>
                  )}
                  <form action={updateSession}>
                    <input type="hidden" name="sessionId" value={selected.id} /><input type="hidden" name="op" value={selected.status === 'PUBLISHED' ? 'unpublish' : 'publish'} />
                    <button type="submit" className={`${btn} w-full ${selected.status === 'PUBLISHED' ? 'border border-field bg-white text-ink' : 'bg-cyan text-ink'}`}>{selected.status === 'PUBLISHED' ? 'Hide from website' : 'Publish session'}</button>
                  </form>
                  <details>
                    <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-bad-fg">Cancel this session…</summary>
                    <form action={cancelSession} className="mt-2 flex flex-col gap-2">
                      <input type="hidden" name="sessionId" value={selected.id} />
                      <p className="text-sm">All bookings on this date are cancelled, card payments refunded and everyone emailed. This cannot be undone.</p>
                      <label className="flex flex-col gap-1 text-xs font-bold">Type the course name to confirm<input name="confirm" autoComplete="off" className={input} /></label>
                      <button type="submit" className={`${btn} bg-bad-fg text-white`}>Cancel session</button>
                    </form>
                  </details>
                </div>
              ) : <p className="text-sm">This session was cancelled.</p>}
            </section>
          )}
          <section className="rounded-card bg-white p-6 shadow-card" aria-labelledby="det-h">
            <h2 id="det-h" className="mb-3 text-lg font-extrabold text-ink">Course details</h2>
            <dl className="flex flex-col gap-2 text-sm">
              {[
                ['Duration', c.durationText], ['Price', c.pricePence ? `${gbp(c.pricePence)} + VAT per place` : 'Price on request'], ['Places', c.placesPerSession ? `${c.placesPerSession} per session` : 'Unlimited'],
                ['Where', c.deliveryType === 'ELEARNING' ? c.provider ?? 'Provider platform' : c.deliveryType === 'VIRTUAL_CLASSROOM' ? (c.meetingPlatform === 'ZOOM' ? 'Zoom' : 'Microsoft Teams') : c.defaultVenue?.name ?? 'Client site'],
                ['Cancellation cut-off', `${c.subject.changeCutoffHours} hours`], ['Registration approval', c.subject.approvalRequired ? 'On' : 'Off'],
              ].map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-b border-hairline pb-2"><dt>{k}</dt><dd className="text-right font-semibold text-ink">{v}</dd></div>)}
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}
