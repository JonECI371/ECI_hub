import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { Role } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { assignBlock, qualState, readQuals } from '@/lib/trainers';
import { Chip } from '@/components/ui';
import { addQualification, removeQualification, resetAuthenticator, setRoles, setTrainerStatus, updateDetails, updateTrainer } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Person', robots: { index: false } };

const MSG: Record<string, [string, boolean]> = {
  added: ['Person added. They can log in with their email now.', true], saved: ['Saved.', true], roles: ['Roles updated.', true],
  reset: ['Authenticator reset. They will scan a new QR code at their next log-in.', true], approved: ['Trainer approved. They can now be assigned to sessions.', true],
  suspended: ['Trainer suspended. They cannot be assigned to new sessions.', true], pending: ['Trainer set back to awaiting approval.', true],
  qualadded: ['Qualification added.', true], qualremoved: ['Qualification removed.', true],
  selflock: ['You cannot remove your own Super Admin role. Ask another Super Admin.', false], lastsuper: ['There must always be at least one Super Admin.', false],
  invalid: ['Check the details and try again.', false], badfile: ['Upload a PDF, JPEG, PNG or WebP of 10MB or less.', false],
};
const ROLE_LABEL: Record<Role, string> = { DELEGATE: 'Delegate', BOOKER: 'Booker', TRAINER: 'Trainer', ADMIN: 'Admin', SUPER_ADMIN: 'Super Admin' };
const SUBJECTS = ['CompEx', 'EUSR', 'Thames Water', 'Process safety', 'DSEAR', 'Functional safety'];
const dt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
const dtt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
const input = 'h-11 w-full rounded-control border border-field bg-white px-3 text-sm text-ink';
const btn = 'inline-flex min-h-11 items-center justify-center rounded-chip px-4 text-sm font-bold';
const card = 'rounded-card bg-white p-6 shadow-card';

export default async function PersonRecord({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const me = await requireAdmin('/admin/people');
  const isSuper = me.roles.includes('SUPER_ADMIN');
  const { id } = await params;
  const { msg } = await searchParams;
  const p = await db.person.findUnique({ where: { id }, include: { trainerProfile: true } });
  if (!p) notFound();
  const [made, attending, certs, emails, history, sessions] = await Promise.all([
    db.booking.findMany({ where: { bookerId: id, status: { not: 'PAYMENT_PENDING' } }, include: { course: true, session: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
    db.attendee.findMany({ where: { personId: id, booking: { status: { not: 'PAYMENT_PENDING' } } }, include: { registration: true, booking: { include: { course: true, session: true } } }, orderBy: { booking: { createdAt: 'desc' } }, take: 20 }),
    db.certificate.findMany({ where: { personId: id }, include: { course: true }, orderBy: { issuedAt: 'desc' } }),
    db.emailLog.findMany({ where: { personId: id }, orderBy: { createdAt: 'desc' }, take: 15 }),
    db.auditLog.findMany({ where: { OR: [{ recordId: id }, { actorId: id }] }, orderBy: { createdAt: 'desc' }, take: 25 }),
    p.roles.includes('TRAINER') ? db.session.findMany({ where: { trainerId: id, startsAt: { gt: new Date() }, status: { not: 'CANCELLED' } }, include: { course: true }, orderBy: { startsAt: 'asc' }, take: 10 }) : Promise.resolve([]),
  ]);
  const actorIds = [...new Set(history.map((h) => h.actorId).filter(Boolean))] as string[];
  const actors = new Map((await db.person.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } })).map((a) => [a.id, `${a.firstName} ${a.lastName === '-' ? '' : a.lastName}`]));
  const tp = p.trainerProfile;
  const quals = tp ? readQuals(tp.qualifications) : [];
  const block = p.roles.includes('TRAINER') ? assignBlock(p) : null;
  const notice = msg ? MSG[msg] : null;
  const staff = p.roles.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN' || r === 'TRAINER');
  const hidden = <input type="hidden" name="personId" value={p.id} />;

  return (
    <>
      <div>
        <p className="mb-1.5 text-xs"><Link href="/admin/people">People</Link> › {p.firstName} {p.lastName === '-' ? '' : p.lastName}</p>
        <h1 className="text-[30px] font-extrabold tracking-tight text-ink">{p.firstName} {p.lastName === '-' ? '' : p.lastName}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
          {p.roles.map((r) => <Chip key={r} tone={r === 'SUPER_ADMIN' || r === 'ADMIN' ? 'soft' : 'grey'}>{ROLE_LABEL[r]}</Chip>)}
          {staff && <Chip tone={p.totpSecret ? 'soft' : 'warn'}>{p.totpSecret ? 'Authenticator set up' : 'Authenticator not set up yet'}</Chip>}
          <span className="ml-1">{p.email}{p.mobile ? ` · ${p.mobile}` : ''}{p.employer ? ` · ${p.employer}` : ''}</span>
        </div>
      </div>
      {notice && <p role={notice[1] ? 'status' : 'alert'} className={`rounded-control px-4 py-3 text-sm font-semibold ${notice[1] ? 'bg-cyan-soft text-ink' : 'bg-bad-bg text-bad-fg'}`}>{notice[0]}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {p.roles.includes('TRAINER') && tp && (
            <section className={card} aria-labelledby="tr-h">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 id="tr-h" className="text-lg font-extrabold text-ink">Trainer</h2>
                <Chip tone={tp.status === 'APPROVED' ? (block ? 'bad' : 'soft') : tp.status === 'PENDING' ? 'warn' : 'bad'}>{tp.status === 'APPROVED' ? (block ?? 'Approved, can be assigned') : tp.status === 'PENDING' ? 'Awaiting approval' : 'Suspended'}</Chip>
              </div>
              {tp.status === 'APPROVED' && tp.approvedAt && <p className="mb-4 text-sm">Approved {dt.format(tp.approvedAt)}{tp.approvedById && actors.get(tp.approvedById) ? ` by ${actors.get(tp.approvedById)}` : ''}.</p>}
              {isSuper ? (
                <div className="mb-5 flex flex-wrap gap-2">
                  {tp.status !== 'APPROVED' && <form action={setTrainerStatus}>{hidden}<input type="hidden" name="status" value="APPROVED" /><button type="submit" className={`${btn} bg-cyan text-ink`}>Approve trainer</button></form>}
                  {tp.status === 'APPROVED' && <form action={setTrainerStatus}>{hidden}<input type="hidden" name="status" value="SUSPENDED" /><button type="submit" className={`${btn} border border-field bg-white text-bad-fg`}>Suspend</button></form>}
                  {tp.status === 'SUSPENDED' && <form action={setTrainerStatus}>{hidden}<input type="hidden" name="status" value="PENDING" /><button type="submit" className={`${btn} border border-field bg-white text-ink`}>Back to awaiting approval</button></form>}
                </div>
              ) : tp.status === 'PENDING' && <p className="mb-5 rounded-control bg-warn-bg px-4 py-3 text-sm text-warn-fg">A Super Admin approves trainers after checking their qualifications.</p>}

              <form action={updateTrainer} className="mb-6 grid gap-3 sm:grid-cols-2">
                {hidden}
                <fieldset className="sm:col-span-2"><legend className="mb-2 text-xs font-bold">Delivers</legend>
                  <div className="flex flex-wrap gap-2">{SUBJECTS.map((s) => <label key={s} className="flex min-h-11 items-center gap-2 rounded-control border border-hairline px-3 text-sm text-ink"><input type="checkbox" name="subjects" value={s} defaultChecked={tp.subjects.includes(s)} className="size-5 accent-ink" />{s}</label>)}</div>
                </fieldset>
                <label className="flex flex-col gap-1 text-xs font-bold">Based in<input name="homeBase" defaultValue={tp.homeBase ?? ''} className={input} /></label>
                <label className="flex flex-col gap-1 text-xs font-bold">Employment<select name="employment" defaultValue={tp.employment ?? ''} className={input}><option value="">Not set</option><option value="EMPLOYED">Employed</option><option value="ASSOCIATE">Associate (freelance)</option></select></label>
                <div className="sm:col-span-2"><button type="submit" className={`${btn} border border-field bg-white text-ink`}>Save trainer details</button></div>
              </form>

              <h3 className="mb-2 font-bold text-ink">Qualifications</h3>
              {quals.some((q) => qualState(q) === 'expired') && <p className="mb-3 rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">An expired qualification stops this trainer being assigned. Add the renewed certificate, then remove the old one.</p>}
              {quals.length === 0 ? <p className="mb-4 text-sm">No qualifications recorded yet.</p> : (
                <div className="relative mb-4 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="bg-[#FAFAFA] text-xs uppercase tracking-[0.06em]"><tr>{['Qualification', 'Issued by', 'Expires', 'Status', 'Certificate', ''].map((h, i) => <th key={i} className="px-3 py-2">{h}</th>)}</tr></thead>
                    <tbody>
                      {quals.map((q) => {
                        const st = qualState(q);
                        return (
                          <tr key={q.id} className="border-t border-hairline">
                            <td className="px-3 py-2 font-bold text-ink">{q.name}</td>
                            <td className="px-3 py-2">{q.issuer || '-'}</td>
                            <td className="px-3 py-2 tabular-nums">{q.expiresAt ? dt.format(new Date(q.expiresAt)) : 'Does not expire'}</td>
                            <td className="px-3 py-2"><Chip tone={st === 'expired' ? 'bad' : st === 'soon' ? 'warn' : 'soft'}>{st === 'expired' ? 'Expired' : st === 'soon' ? 'Expires within 90 days' : 'Valid'}</Chip></td>
                            <td className="px-3 py-2">{q.fileKey ? <a href={`/admin/files?key=${encodeURIComponent(q.fileKey)}`} target="_blank" rel="noopener noreferrer">View</a> : '-'}</td>
                            <td className="px-3 py-2"><form action={removeQualification}>{hidden}<input type="hidden" name="qualId" value={q.id} /><button type="submit" className="min-h-11 text-sm text-bad-fg underline">Remove</button></form></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <details>
                <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold text-ink">+ Add a qualification</summary>
                <form action={addQualification} className="mt-2 grid gap-3 sm:grid-cols-2">
                  {hidden}
                  <label className="flex flex-col gap-1 text-xs font-bold">Qualification<input name="name" required placeholder="CompEx Ex12 instructor" className={input} /></label>
                  <label className="flex flex-col gap-1 text-xs font-bold">Issued by<input name="issuer" className={input} /></label>
                  <label className="flex flex-col gap-1 text-xs font-bold">Expires (leave empty if it does not)<input name="expiresAt" type="date" className={input} /></label>
                  <label className="flex flex-col gap-1 text-xs font-bold">Certificate (PDF or image, optional)<input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="text-sm font-normal" /></label>
                  <div className="sm:col-span-2"><button type="submit" className={`${btn} bg-cyan text-ink`}>Add qualification</button></div>
                </form>
              </details>

              {sessions.length > 0 && (
                <>
                  <h3 className="mb-2 mt-6 font-bold text-ink">Upcoming sessions</h3>
                  <ul className="text-sm">{sessions.map((s) => <li key={s.id} className="border-t border-hairline py-2"><Link href={`/admin/courses/${s.courseId}?session=${s.id}`}>{s.course.title}</Link> · {dtt.format(s.startsAt)}</li>)}</ul>
                </>
              )}
            </section>
          )}

          <section className="overflow-hidden rounded-card bg-white shadow-card" aria-labelledby="bk-h">
            <h2 id="bk-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">Bookings</h2>
            {made.length + attending.length === 0 ? <p className="px-6 py-6 text-sm">No bookings.</p> : (
              <ul>
                {made.map((b) => <li key={`m${b.id}`} className="flex flex-wrap justify-between gap-2 border-b border-hairline px-6 py-3 text-sm last:border-0"><span><Link href={`/admin/bookings?q=${b.reference}`} className="font-bold">{b.reference}</Link> · {b.course.title}{b.session ? ` · ${dt.format(b.session.startsAt)}` : ''}</span><span>Booked {b.places} {b.places === 1 ? 'place' : 'places'} · {b.status.toLowerCase()}</span></li>)}
                {attending.filter((a) => !made.some((m) => m.id === a.bookingId)).map((a) => <li key={`a${a.id}`} className="flex flex-wrap justify-between gap-2 border-b border-hairline px-6 py-3 text-sm last:border-0"><span><Link href={`/admin/bookings?q=${a.booking.reference}`} className="font-bold">{a.booking.reference}</Link> · {a.booking.course.title}{a.booking.session ? ` · ${dt.format(a.booking.session.startsAt)}` : ''}</span><span>Attending · {a.status.toLowerCase().replace('_', ' ')}</span></li>)}
              </ul>
            )}
          </section>

          <section className="overflow-hidden rounded-card bg-white shadow-card" aria-labelledby="hist-h">
            <h2 id="hist-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">History</h2>
            {history.length === 0 ? <p className="px-6 py-6 text-sm">No changes recorded.</p> : (
              <ul>{history.map((h) => <li key={h.id} className="flex flex-wrap justify-between gap-2 border-b border-hairline px-6 py-2.5 text-sm last:border-0"><span className="font-semibold text-ink">{h.action.toLowerCase().replace(/_/g, ' ')}{h.recordId !== id ? ` (${h.recordType.toLowerCase()})` : ''}</span><span>{h.actorId ? actors.get(h.actorId) ?? 'Someone' : 'System'} · {dtt.format(h.createdAt)}</span></li>)}</ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section className={card} aria-labelledby="det-h">
            <h2 id="det-h" className="mb-3 text-lg font-extrabold text-ink">Details</h2>
            <form action={updateDetails} className="flex flex-col gap-3">
              {hidden}
              <label className="flex flex-col gap-1 text-xs font-bold">First name<input name="firstName" defaultValue={p.firstName} className={input} /></label>
              <label className="flex flex-col gap-1 text-xs font-bold">Last name<input name="lastName" defaultValue={p.lastName === '-' ? '' : p.lastName} className={input} /></label>
              <label className="flex flex-col gap-1 text-xs font-bold">Mobile<input name="mobile" defaultValue={p.mobile ?? ''} className={input} /></label>
              <label className="flex flex-col gap-1 text-xs font-bold">Employer<input name="employer" defaultValue={p.employer ?? ''} className={input} /></label>
              <p className="text-xs">Email: {p.email}. Created {dt.format(p.createdAt)}.</p>
              <button type="submit" className={`${btn} border border-field bg-white text-ink`}>Save details</button>
            </form>
          </section>

          {isSuper && (
            <section className={card} aria-labelledby="acc-h">
              <h2 id="acc-h" className="mb-1 text-lg font-extrabold text-ink">Access</h2>
              <p className="mb-3 text-sm">Only Super Admins can change this.</p>
              <form action={setRoles} className="mb-4 flex flex-col gap-2">
                {hidden}
                {(['ADMIN', 'SUPER_ADMIN', 'TRAINER', 'BOOKER'] as Role[]).map((r) => (
                  <label key={r} className="flex min-h-11 items-center gap-3 text-sm text-ink"><input type="checkbox" name={`role_${r}`} defaultChecked={p.roles.includes(r)} className="size-5 accent-ink" />{ROLE_LABEL[r]}{r === 'SUPER_ADMIN' && <span className="text-xs text-slate">(includes Admin)</span>}</label>
                ))}
                <button type="submit" className={`${btn} bg-cyan text-ink`}>Save roles</button>
              </form>
              {staff && (
                <form action={resetAuthenticator}>
                  {hidden}
                  <button type="submit" className={`${btn} w-full border border-field bg-white text-ink`}>Reset authenticator (lost phone)</button>
                </form>
              )}
            </section>
          )}

          <section className={card} aria-labelledby="cert-h">
            <h2 id="cert-h" className="mb-3 text-lg font-extrabold text-ink">Certificates</h2>
            {certs.length === 0 ? <p className="text-sm">None yet.</p> : <ul className="text-sm">{certs.map((c) => <li key={c.id} className="border-t border-hairline py-2 first:border-0"><span className="block font-bold text-ink">{c.course.title}</span>{dt.format(c.issuedAt)}{c.expiresAt ? ` to ${dt.format(c.expiresAt)}` : ''}</li>)}</ul>}
          </section>

          <section className={card} aria-labelledby="em-h">
            <h2 id="em-h" className="mb-3 text-lg font-extrabold text-ink">Emails</h2>
            {emails.length === 0 ? <p className="text-sm">None sent.</p> : <ul className="text-sm">{emails.map((e) => <li key={e.id} className="flex justify-between gap-2 border-t border-hairline py-2 first:border-0"><span>{e.trigger.toLowerCase().replace(/_/g, ' ')}</span><span className="text-xs">{e.status === 'TEST_NOT_SENT' ? 'Test, not sent' : e.status.toLowerCase()} · {dt.format(e.createdAt)}</span></li>)}</ul>}
          </section>
        </aside>
      </div>
    </>
  );
}
