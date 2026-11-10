import Link from 'next/link';
import type { Metadata } from 'next';
import type { TaskType } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAdmin, TASK_LABEL } from '@/lib/admin';
import { fmtSessionDates, fmtTime } from '@/lib/format';
import { placesLeft } from '@/lib/sessions';
import { CopyButton } from '@/components/copy-button';
import { uploadCertificate, decideAccount, decideBookerTask, decideDateChange, decideRegistration, markDone, markEnrolled } from './actions';
import { PO_RULES, creditDefaults } from '@/lib/accounts';
import { money } from '@/lib/format';
import { companiesHouseConfigured, companiesHouseLink, type CompanyCheck } from '@/lib/integrations/companies-house';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tasks', robots: { index: false } };

const MSG: Record<string, [string, boolean]> = {
  done: ['Task done.', true], enrolled: ['Marked enrolled. The learner has been emailed.', true], approved: ['Registration approved. The delegate has been emailed with the venue details.', true],
  returned: ['Registration returned. The delegate has been asked to update it.', true], moved: ['Booking moved. The booker has been emailed.', true], declined: ['Request declined. The booker has been emailed.', true],
  note: ['Say what needs changing before returning a registration.', false],
  accountapproved: ['Account approved. The bookers have been emailed a sign-in link.', true], accountdeclined: ['Application declined. The main booker has been emailed.', true],
  certified: ['Certificate issued. The delegate and their booker have been emailed.', true], badcert: ['Attach a PDF, JPEG, PNG or WebP of 10MB or less, and the issue date.', false],
  bookerapproved: ['Booker approved. They and the main booker have been emailed.', true], bookerdeclined: ['Booker declined. The main booker has been emailed.', true],
  badlimit: ['Enter a credit limit in pounds.', false], reason: ['Give a reason before declining an application.', false], nodate: ['That date no longer has enough places.', false], gone: ['That task has already been dealt with.', false],
};
const btn = 'inline-flex min-h-11 items-center justify-center rounded-chip px-4 text-sm font-bold';
const dmy = (d: Date | null) => (d ? d.toLocaleDateString('en-GB', { timeZone: 'Europe/London' }) : 'Not given');

function age(d: Date) {
  const h = Math.floor((Date.now() - d.getTime()) / 3600000);
  return h < 1 ? 'Just now' : h < 24 ? `${h} ${h === 1 ? 'hour' : 'hours'}` : `${Math.floor(h / 24)} ${Math.floor(h / 24) === 1 ? 'day' : 'days'}`;
}

export default async function Tasks({ searchParams }: { searchParams: Promise<{ type?: string; msg?: string; detail?: string }> }) {
  const me = await requireAdmin('/admin/tasks');
  const { type, msg, detail } = await searchParams;
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
  const accountIds = tasks.filter((t) => t.recordType === 'Account').map((t) => t.recordId);
  const [accounts, credit] = await Promise.all([
    db.account.findMany({ where: { id: { in: accountIds } }, include: { members: { include: { person: true } } } }),
    creditDefaults(),
  ]);
  const accById = new Map(accounts.map((x) => [x.id, x]));
  const certSessionIds = tasks.filter((t) => t.type === 'CERTIFICATE_UPLOAD' && t.recordType === 'Session').map((t) => t.recordId);
  const certAttendeeIds = tasks.filter((t) => t.type === 'CERTIFICATE_UPLOAD' && t.recordType === 'Attendee').map((t) => t.recordId);
  const certPeople = await db.attendee.findMany({
    where: { status: { in: ['ATTENDED', 'CERTIFIED'] }, OR: [{ id: { in: certAttendeeIds } }, { booking: { sessionId: { in: certSessionIds }, status: { in: ['CONFIRMED', 'COMPLETED'] } } }] },
    include: { person: true, booking: { include: { course: true, session: true } } },
  });
  const months = tasks.filter((t) => t.recordType === 'Month').map((t) => t.recordId);
  const monthStatements = await db.statement.findMany({ where: { month: { in: months }, status: { not: 'OPEN' }, lines: { some: {} } }, include: { account: true, lines: true }, orderBy: { account: { company: 'asc' } } });
  const memberIds = tasks.filter((t) => t.recordType === 'AccountMember').map((t) => t.recordId);
  const members = new Map((await db.accountMember.findMany({ where: { id: { in: memberIds } }, include: { person: true, account: { include: { members: { where: { role: 'MAIN_BOOKER' }, include: { person: true } } } } } })).map((x) => [x.id, x]));
  const isSuper = me.roles.includes('SUPER_ADMIN');
  const aById = new Map(attendees.map((a) => [a.id, a]));
  const bById = new Map(bookings.map((b) => [b.id, b]));
  const altSessions = await db.session.findMany({ where: { courseId: { in: bookings.map((b) => b.courseId) }, status: 'PUBLISHED', startsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' } });
  const left = await placesLeft(altSessions);
  const total = counts.reduce((n, c) => n + c._count, 0);
  const notice: [string, boolean] | null = msg === 'rule' ? [detail ?? 'That change is not allowed.', false] : msg ? MSG[msg] : null;
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
                <p className="mb-3 text-sm">{a.booking.method === 'CARD' ? 'Paid by card' : `On account (${a.booking.account?.company})`} · registration {a.registration ? 'complete' : 'not yet submitted'} · {(t.payload as { packSent?: boolean } | null)?.packSent ? `pack emailed to ${a.booking.course.providerEmail ?? 'the provider'}; mark enrolled once they confirm.` : 'enrol on the provider platform, then mark enrolled.'} The learner is emailed automatically.</p>
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

          const acc = accById.get(t.recordId);
          if (t.type === 'ACCOUNT_APPLICATION' && acc) {
            const ch = acc.companiesHouse as CompanyCheck | Record<string, never>;
            const main = acc.members.find((m) => m.role === 'MAIN_BOOKER')?.person;
            const nameMatch = 'name' in ch && ch.name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(limited|ltd|plc)$/, '') === acc.company.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(limited|ltd|plc)$/, '');
            const requested = acc.creditRequestedPence ?? credit.defaultLimitPence;
            const suggested = isSuper ? requested : Math.min(requested, credit.defaultLimitPence);
            body = (
              <>
                <div className={`mb-3 rounded-control px-4 py-3 text-sm ${'status' in ch && ch.status === 'found' && ch.companyStatus === 'active' && nameMatch ? 'bg-cyan-soft text-ink' : 'bg-warn-bg text-warn-fg'}`}>
                  <strong>Companies House: </strong>
                  {'status' in ch && ch.status === 'found' ? <>{ch.name} · {ch.companyStatus}{ch.incorporated ? ` · since ${ch.incorporated.slice(0, 4)}` : ''} · {ch.address}{!nameMatch && ' · name does not match the application'}</>
                    : 'status' in ch && ch.status === 'not_found' ? 'No company found with this number.'
                    : 'status' in ch && ch.status === 'error' ? 'The automatic check failed. Check by hand.'
                    : companiesHouseConfigured() ? 'Not checked yet.' : 'Automatic check not set up. Check by hand.'}
                  {' '}<a href={companiesHouseLink(acc.companyNumber)} target="_blank" rel="noreferrer">Open on Companies House</a>
                </div>
                <dl className="grid gap-x-6 gap-y-2 rounded-control bg-page p-4 text-sm sm:grid-cols-2">
                  {[['Company', acc.company], ['Company number', acc.companyNumber], ['VAT number', acc.vatNumber ?? 'Not given'], ['Industry', acc.industry ?? '-'], ['Registered address', acc.registeredAddress], ['Website', acc.website ?? 'Not given'],
                    ['Main booker', main ? `${main.firstName} ${main.lastName}, ${main.jobTitle ?? ''} (${main.email}, ${main.mobile ?? 'no phone'})` : '-'],
                    ['Other bookers', acc.members.filter((m) => m.role !== 'MAIN_BOOKER').map((m) => `${m.person.firstName} ${m.person.lastName} (${m.person.email})`).join('; ') || 'None'],
                    ['Accounts contact', `${acc.accountsName} (${acc.accountsEmail})`], ['Invoice address', acc.invoiceAddress ?? 'Same as registered'],
                    ['Credit requested', money(requested)], ['PO numbers', PO_RULES[acc.poRule as keyof typeof PO_RULES] ?? acc.poRule], ['Delegates a year', acc.expectedDelegates ? String(acc.expectedDelegates) : 'Not given']].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 border-b border-hairline py-1"><dt>{k}</dt><dd className="text-right font-semibold text-ink">{v}</dd></div>
                  ))}
                </dl>
                {!isSuper && requested > credit.defaultLimitPence && <p className="mt-3 text-sm font-semibold text-warn-fg">They asked for more than the {money(credit.defaultLimitPence)} default. You can approve up to {money(credit.defaultLimitPence)}; a Super Admin can approve more.</p>}
              </>
            );
            actions = (
              <>
                <details className="w-full sm:w-auto">
                  <summary className={`${btn} cursor-pointer list-none border border-field bg-white text-ink [&::-webkit-details-marker]:hidden`}>Decline</summary>
                  <form action={decideAccount} className="mt-2 flex flex-col gap-2 sm:w-[360px]">
                    {hidden}<input type="hidden" name="decision" value="decline" />
                    <label className="text-sm font-bold text-ink">Reason (sent to the main booker)<textarea name="reason" required className="mt-1 min-h-[72px] w-full rounded-control border border-field px-3 py-2 font-normal" /></label>
                    <button type="submit" className={`${btn} border border-field bg-white text-ink`}>Decline application</button>
                  </form>
                </details>
                <form action={decideAccount} className="flex flex-wrap items-end gap-2">
                  {hidden}<input type="hidden" name="decision" value="approve" />
                  <label className="flex flex-col gap-1 text-xs font-bold">Credit limit (£)<input name="limit" inputMode="numeric" defaultValue={suggested / 100} required className="h-11 w-28 rounded-control border border-field bg-white px-3 text-sm" /></label>
                  <label className="flex flex-col gap-1 text-xs font-bold">Terms (days)<input name="terms" type="number" min={0} max={120} defaultValue={credit.termsDays} className="h-11 w-20 rounded-control border border-field bg-white px-3 text-sm" /></label>
                  <label className="flex flex-col gap-1 text-xs font-bold">PO numbers<select name="poRule" defaultValue={acc.poRule} className="h-11 rounded-control border border-field bg-white px-3 text-sm">{Object.entries(PO_RULES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                  <button type="submit" className={`${btn} bg-cyan text-ink`}>Approve account</button>
                </form>
              </>
            );
          }

          const mem = members.get(t.recordId);
          if (t.type === 'BOOKER_APPROVAL' && mem) {
            const main = mem.account.members[0]?.person;
            const domain = (e: string) => e.split('@')[1]?.toLowerCase();
            const sameDomain = main && domain(main.email) === domain(mem.person.email);
            body = (
              <>
                <dl className="grid gap-x-6 gap-y-2 rounded-control bg-page p-4 text-sm sm:grid-cols-2">
                  {[['Name', `${mem.person.firstName} ${mem.person.lastName === '-' ? '' : mem.person.lastName}`], ['Email', mem.person.email], ['Job title', mem.person.jobTitle ?? 'Not given'], ['Account', `${mem.account.company} (${mem.account.status.toLowerCase().replace('_', ' ')})`], ['Invited by', main ? `${main.firstName} ${main.lastName}, main booker` : '-']].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 border-b border-hairline py-1"><dt>{k}</dt><dd className="text-right font-semibold text-ink">{v}</dd></div>
                  ))}
                </dl>
                {!sameDomain && <p className="mt-3 text-sm font-semibold text-warn-fg">Their email domain is different from the main booker&apos;s. Check they work for {mem.account.company}.</p>}
              </>
            );
            actions = (
              <>
                <form action={decideBookerTask}>{hidden}<input type="hidden" name="decision" value="decline" /><button type="submit" className={`${btn} border border-field bg-white text-ink`}>Decline</button></form>
                <form action={decideBookerTask}>{hidden}<input type="hidden" name="decision" value="approve" /><button type="submit" className={`${btn} bg-cyan text-ink`}>Approve booker</button></form>
              </>
            );
          }

          if (t.type === 'MONTH_END_BILLING' && t.recordType === 'Month') {
            const sts = monthStatements.filter((x) => x.month === t.recordId);
            const total = sts.reduce((n, x) => n + x.lines.reduce((m, l) => m + l.netPence + l.vatPence, 0), 0);
            body = (
              <>
                <p className="mb-3 text-sm">{sts.length} {sts.length === 1 ? 'statement' : 'statements'} closed, {money(total)} including VAT. Download the file, then in Xero go to Business, Invoices, Import, and upload it. Xero creates the invoices as drafts for you to approve and send.</p>
                {sts.length > 0 && (
                  <div className="relative overflow-x-auto rounded-control bg-page">
                    <table className="w-full min-w-[480px] text-left text-sm">
                      <thead className="text-xs uppercase tracking-[0.06em]"><tr>{['Account', 'Lines', 'Total inc. VAT', 'Due'].map((h) => <th key={h} className="px-4 py-2">{h}</th>)}</tr></thead>
                      <tbody>{sts.map((x) => <tr key={x.id} className="border-t border-hairline"><td className="px-4 py-2 font-bold text-ink"><Link href={`/admin/accounts/${x.accountId}`}>{x.account.company}</Link></td><td className="px-4 py-2 tabular-nums">{x.lines.length}</td><td className="px-4 py-2 tabular-nums">{money(x.lines.reduce((m, l) => m + l.netPence + l.vatPence, 0))}</td><td className="px-4 py-2">{x.dueAt ? dmy(x.dueAt) : '-'}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
              </>
            );
            actions = (
              <>
                <a href={`/admin/billing/xero/${t.recordId}.csv`} className={`${btn} border border-field bg-white text-ink no-underline`}>Download Xero file</a>
                <form action={markDone}>{hidden}<button type="submit" className={`${btn} bg-cyan text-ink`}>Imported into Xero</button></form>
              </>
            );
          }

          if (t.type === 'CERTIFICATE_UPLOAD') {
            const people = certPeople.filter((x) => (t.recordType === 'Session' ? x.booking.sessionId === t.recordId : x.id === t.recordId) && x.person).sort((x, y) => x.person!.lastName.localeCompare(y.person!.lastName));
            const course = people[0]?.booking.course;
            const issuedDefault = (people[0]?.booking.session?.endsAt ?? new Date()).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
            body = (
              <>
                <p className="mb-3 text-sm">{t.detail} {course?.validityYears ? `Certificates are valid for ${course.validityYears} years from the issue date.` : 'This course has no expiry set.'}</p>
                {people.length === 0 ? <p className="text-sm">Nobody marked as attended.</p> : (
                  <ul className="flex flex-col gap-2">
                    {people.map((x) => (
                      <li key={x.id} className="flex flex-col gap-2 rounded-control bg-page p-3 sm:flex-row sm:items-center sm:justify-between">
                        <span className="font-bold text-ink">{x.person!.firstName} {x.person!.lastName}<span className="block text-xs font-normal">{x.person!.email}</span></span>
                        {x.status === 'CERTIFIED' ? <span className="text-sm font-bold text-ink">Issued</span> : (
                          <form action={uploadCertificate} encType="multipart/form-data" className="flex flex-wrap items-end gap-2">
                            {hidden}<input type="hidden" name="attendeeId" value={x.id} />
                            <label className="flex flex-col gap-1 text-xs font-bold">Issued<input type="date" name="issuedAt" defaultValue={issuedDefault} required className="h-11 rounded-control border border-field bg-white px-2 text-sm" /></label>
                            <label className="flex flex-col gap-1 text-xs font-bold">Certificate<input type="file" name="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="max-w-[210px] text-xs font-normal" /></label>
                            <button type="submit" className={`${btn} bg-cyan text-ink`}>Upload</button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            );
            actions = <form action={markDone}>{hidden}<button type="submit" className={`${btn} border border-field bg-white text-ink`}>Done without uploading</button></form>;
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
