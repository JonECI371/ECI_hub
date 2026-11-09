import Link from 'next/link';
import type { Metadata } from 'next';
import type { TaskType } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAdmin, TASK_LABEL } from '@/lib/admin';
import { fmtSessionDates, fmtTime } from '@/lib/format';
import { placesLeft } from '@/lib/sessions';
import { CopyButton } from '@/components/copy-button';
import { decideDateChange, decideRegistration, markDone, markEnrolled } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tasks', robots: { index: false } };

const MSG: Record<string, [string, boolean]> = {
  done: ['Task done.', true], enrolled: ['Marked enrolled. The learner has been emailed.', true], approved: ['Registration approved. The delegate has been emailed with the venue details.', true],
  returned: ['Registration returned. The delegate has been asked to update it.', true], moved: ['Booking moved. The booker has been emailed.', true], declined: ['Request declined. The booker has been emailed.', true],
  note: ['Say what needs changing before returning a registration.', false], nodate: ['That date no longer has enough places.', false], gone: ['That task has already been dealt with.', false],
};
const btn = 'inline-flex min-h-11 items-center justify-center rounded-chip px-4 text-sm font-bold';
const dmy = (d: Date | null) => (d ? d.toLocaleDateString('en-GB', { timeZone: 'Europe/London' }) : 'Not given');

function age(d: Date) {
  const h = Math.floor((Date.now() - d.getTime()) / 3600000);
  return h < 1 ? 'Just now' : h < 24 ? `${h} ${h === 1 ? 'hour' : 'hours'}` : `${Math.floor(h / 24)} ${Math.floor(h / 24) === 1 ? 'day' : 'days'}`;
}

export default async function Tasks({ searchParams }: { searchParams: Promise<{ type?: string; msg?: string }> }) {
  await requireAdmin('/admin/tasks');
  const { type, msg } = await searchParams;
  const filter = type && type in TASK_LABEL ? (type as TaskType) : undefined;
  const [tasks, counts] = await Promise.all([
    db.task.findMany({ where: { status: 'OPEN', type: filter }, orderBy: { createdAt: 'asc' }, take: 100 }),
    db.task.groupBy({ by: ['type'], where: { status: 'OPEN' }, _count: true }),
  ]);
  const attendeeIds = tasks.filter((t) => t.recordType === 'Attendee').map((t) => t.recordId);
  const bookingIds = tasks.filter((t) => t.recordType === 'Booking').map((t) => t.recordId);
  const [attendees, bookings] = await Promise.all([
    db.attendee.findMany({ where: { id: { in: attendeeIds } }, include: { person: true, registration: true, booking: { include: { account: true, course: true, session: true } } } }),
    db.booking.findMany({ where: { id: { in: bookingIds } }, include: { booker: true, course: true, session: true } }),
  ]);
  const aById = new Map(attendees.map((a) => [a.id, a]));
  const bById = new Map(bookings.map((b) => [b.id, b]));
  const altSessions = await db.session.findMany({ where: { courseId: { in: bookings.map((b) => b.courseId) }, status: 'PUBLISHED', startsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' } });
  const left = await placesLeft(altSessions);
  const total = counts.reduce((n, c) => n + c._count, 0);
  const notice = msg ? MSG[msg] : null;
  const pill = (on: boolean) => `inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm no-underline ${on ? 'bg-ink font-bold text-white hover:text-white' : 'border border-hairline bg-white font-semibold text-ink'}`;

  return (
    <>
      <div>
        <p className="mb-1.5 text-xs">Admin › Tasks · oldest first</p>
        <h1 className="text-[30px] font-extrabold tracking-tight text-ink">Tasks</h1>
      </div>
      {notice && <p role="status" className={`rounded-control px-4 py-3 text-sm font-semibold ${notice[1] ? 'bg-cyan-soft text-ink' : 'bg-bad-bg text-bad-fg'}`}>{notice[0]}</p>}
      <nav aria-label="Task types" className="flex flex-wrap gap-2">
        <Link href="/admin/tasks" className={pill(!filter)} aria-current={!filter ? 'true' : undefined}>All <span className="text-xs opacity-75">{total}</span></Link>
        {counts.map((c) => (
          <Link key={c.type} href={`/admin/tasks?type=${c.type}`} className={pill(filter === c.type)} aria-current={filter === c.type ? 'true' : undefined}>{TASK_LABEL[c.type]} <span className="text-xs opacity-75">{c._count}</span></Link>
        ))}
      </nav>

      {tasks.length === 0 && <p className="rounded-card bg-white p-8 shadow-card">Nothing to do here. Done tasks leave the list.</p>}

      <ul className="flex flex-col gap-4">
        {tasks.map((t) => {
          const a = aById.get(t.recordId);
          const b = bById.get(t.recordId);
          const hidden = (
            <>
              <input type="hidden" name="taskId" value={t.id} />
              <input type="hidden" name="filter" value={filter ?? ''} />
            </>
          );
          let body: React.ReactNode = <p className="text-sm">{t.detail}</p>;
          let actions: React.ReactNode = <form action={markDone}>{hidden}<button type="submit" className={`${btn} bg-cyan text-ink`}>Mark done</button></form>;

          if (t.type === 'ELEARNING_ENROLMENT' && a?.person) {
            const ans = (a.registration?.answers ?? {}) as Record<string, string>;
            const scheme = (a.person.schemeIds ?? {}) as Record<string, string>;
            const pack: [string, string][] = [
              ['Name', `${a.person.firstName} ${a.person.lastName}`], ['Date of birth', dmy(a.person.dateOfBirth)], ['Email', a.person.email], ['Mobile', a.person.mobile ?? 'Not given'],
              ['Employer', a.person.employer ?? a.booking.account?.company ?? 'Not given'], ['Scheme ID', scheme.eusr ?? scheme.compex ?? ans.eusrId ?? ans.compexId ?? 'None'],
              ['Photo and ID', `${a.registration?.fileKeys.length ?? 0} files`],
            ];
            body = (
              <>
                <p className="mb-3 text-sm">{a.booking.method === 'CARD' ? 'Paid by card' : `On account (${a.booking.account?.company})`} · registration {a.registration ? 'complete' : 'not yet submitted'} · enrol on the provider platform, then mark enrolled. The learner is emailed automatically.</p>
                <div className="rounded-control bg-page p-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em]">Enrolment pack · {a.booking.course.provider ?? 'Provider'}</p>
                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">{pack.map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-b border-hairline py-1"><dt>{k}</dt><dd className="text-right font-semibold text-ink">{v}</dd></div>)}</dl>
                </div>
              </>
            );
            actions = (
              <>
                <CopyButton text={pack.map(([k, v]) => `${k}: ${v}`).join('\n')} />
                <form action={markEnrolled}>{hidden}<button type="submit" disabled={!a.registration} className={`${btn} bg-cyan text-ink disabled:opacity-50`}>Mark enrolled</button></form>
              </>
            );
          }

          if (t.type === 'REGISTRATION_APPROVAL' && a?.person && a.registration) {
            const ans = (a.registration.answers ?? {}) as Record<string, string>;
            body = (
              <>
                <p className="mb-3 text-sm">{a.booking.account?.company ?? a.person.employer ?? 'No employer given'} · {a.registration.fileKeys.length ? `${a.registration.fileKeys.length} files uploaded` : 'no files'}. This course checks registrations before day one.</p>
                <dl className="grid gap-x-6 gap-y-2 rounded-control bg-page p-4 text-sm sm:grid-cols-2">
                  {[['Date of birth', dmy(a.person.dateOfBirth)], ['Mobile', a.person.mobile ?? 'Not given'], ...Object.entries(ans).map(([k, v]) => [k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()), v || '-'])].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 border-b border-hairline py-1"><dt>{k}</dt><dd className="text-right font-semibold text-ink">{v}</dd></div>
                  ))}
                </dl>
              </>
            );
            actions = (
              <>
                <details className="w-full sm:w-auto">
                  <summary className={`${btn} cursor-pointer list-none border border-field bg-white text-ink [&::-webkit-details-marker]:hidden`}>Ask for changes</summary>
                  <form action={decideRegistration} className="mt-2 flex flex-col gap-2 sm:w-[360px]">
                    {hidden}<input type="hidden" name="decision" value="return" />
                    <label className="text-sm font-bold text-ink">What needs changing?<textarea name="note" required className="mt-1 min-h-[72px] w-full rounded-control border border-field px-3 py-2 font-normal" /></label>
                    <button type="submit" className={`${btn} border border-field bg-white text-ink`}>Send back to delegate</button>
                  </form>
                </details>
                <form action={decideRegistration}>{hidden}<input type="hidden" name="decision" value="approve" /><button type="submit" className={`${btn} bg-cyan text-ink`}>Approve</button></form>
              </>
            );
          }

          if (t.type === 'DATE_CHANGE' && b) {
            const pref = (t.payload as { sessionId?: string } | null)?.sessionId;
            const options = altSessions.filter((s) => s.courseId === b.courseId && s.id !== b.sessionId && (left.get(s.id) ?? 0) >= b.places);
            body = <p className="text-sm">{b.booker.firstName} {b.booker.lastName} · {b.places} {b.places === 1 ? 'place' : 'places'} · now {b.session ? `${fmtSessionDates(b.session.startsAt, b.session.endsAt)}` : 'no date'} · {t.detail}</p>;
            actions = (
              <>
                <form action={decideDateChange}>{hidden}<input type="hidden" name="decision" value="decline" /><button type="submit" className={`${btn} border border-field bg-white text-ink`}>Decline</button></form>
                <form action={decideDateChange} className="flex flex-wrap gap-2">
                  {hidden}<input type="hidden" name="decision" value="approve" />
                  <label className="sr-only" htmlFor={`s-${t.id}`}>New date</label>
                  <select id={`s-${t.id}`} name="sessionId" defaultValue={pref ?? options[0]?.id} required className="h-11 rounded-control border border-field bg-white px-3 text-sm">
                    {options.map((s) => <option key={s.id} value={s.id}>{fmtSessionDates(s.startsAt, s.endsAt)}, {fmtTime(s.startsAt)} ({left.get(s.id)} left)</option>)}
                  </select>
                  <button type="submit" disabled={!options.length} className={`${btn} bg-cyan text-ink disabled:opacity-50`}>Move booking</button>
                </form>
              </>
            );
          }

          return (
            <li key={t.id} className="rounded-card bg-white p-6 shadow-card">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em]">{TASK_LABEL[t.type]}</p>
                  <h2 className="text-lg font-extrabold text-ink">{t.title}</h2>
                  {a && <p className="text-sm">{a.booking.course.title}{a.booking.session ? `, ${fmtSessionDates(a.booking.session.startsAt, a.booking.session.endsAt)}` : ''} · <Link href={`/admin/bookings?q=${a.booking.reference}`}>{a.booking.reference}</Link></p>}
                </div>
                <span className="text-[13px]">{age(t.createdAt)}</span>
              </div>
              {body}
              <div className="mt-4 flex flex-wrap items-start justify-end gap-2">{actions}</div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
