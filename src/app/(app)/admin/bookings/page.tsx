import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { gbp } from '@/lib/format';
import { STATUSES, STATUS_LABEL, bookingWhere } from '@/lib/admin-bookings';
import { Chip, DeliveryChip } from '@/components/ui';
import { emailBookers } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bookings', robots: { index: false } };

const PER_PAGE = 25;
const dt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
const TONE = { CONFIRMED: 'soft', PAYMENT_PENDING: 'warn', COMPLETED: 'grey', CANCELLED: 'grey' } as const;

export default async function AdminBookings({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string; msg?: string; n?: string }> }) {
  await requireAdmin('/admin/bookings');
  const { q, status, page, msg, n } = await searchParams;
  const p = Math.max(1, Number(page) || 1);
  const where = bookingWhere(q, status);
  const [rows, total] = await Promise.all([
    db.booking.findMany({ where, include: { booker: true, account: true, course: true, session: true, attendees: true }, orderBy: { createdAt: 'desc' }, skip: (p - 1) * PER_PAGE, take: PER_PAGE }),
    db.booking.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const qs = (extra: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, status, ...extra })) if (v) u.set(k, String(v));
    return u.toString();
  };
  const notice: [string, boolean] | null = msg === 'sent' ? [`Email sent to ${n} ${n === '1' ? 'booker' : 'bookers'}.`, true] : msg === 'none' ? ['Tick at least one booking first.', false] : msg === 'empty' ? ['Add a subject and a message.', false] : null;
  const input = 'h-11 rounded-control border border-field bg-white px-3 text-sm text-ink';
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-1.5 text-xs">Admin › Bookings</p><h1 className="text-[30px] font-extrabold tracking-tight text-ink">Bookings</h1></div>
        <a href={`/admin/bookings/export?${qs({})}`} className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-4 text-sm font-bold text-ink no-underline">Export CSV</a>
      </div>
      <form className="flex flex-wrap items-end gap-3" role="search">
        <label className="flex flex-col gap-1 text-xs font-bold">Search<input name="q" defaultValue={q} placeholder="Reference, name, email, course" className={`${input} w-[280px] max-w-full`} /></label>
        <label className="flex flex-col gap-1 text-xs font-bold">Status
          <select name="status" defaultValue={status ?? ''} className={input}><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center rounded-chip bg-ink px-5 text-sm font-bold text-white">Search</button>
        {(q || status) && <Link href="/admin/bookings" className="inline-flex min-h-11 items-center text-sm">Clear</Link>}
      </form>
      {notice && <p role={notice[1] ? 'status' : 'alert'} className={`rounded-control px-4 py-3 text-sm font-semibold ${notice[1] ? 'bg-cyan-soft text-ink' : 'bg-bad-bg text-bad-fg'}`}>{notice[0]}</p>}
      <form id="bulk" action={emailBookers} />
      <details className="rounded-card bg-white px-6 py-4 shadow-card">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-ink">Email the bookers of ticked bookings</summary>
        <div className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="back" value={qs({ page: p > 1 ? p : undefined })} form="bulk" />
          <label className="flex flex-col gap-1 text-xs font-bold">Subject<input name="subject" form="bulk" required maxLength={150} className={`${input} w-full`} /></label>
          <label className="flex flex-col gap-1 text-xs font-bold">Message<textarea name="message" form="bulk" required maxLength={5000} rows={5} className="rounded-control border border-field bg-white px-3 py-2 text-sm font-normal text-ink" /></label>
          <p className="text-xs">Each booker gets one email, which starts with their name and ends with their booking references. On the test server, emails are logged, not sent.</p>
          <button type="submit" form="bulk" className="inline-flex min-h-11 w-fit items-center rounded-chip bg-ink px-5 text-sm font-bold text-white">Send email</button>
        </div>
      </details>
      <section className="overflow-hidden rounded-card bg-white shadow-card">
        <p aria-live="polite" className="border-b border-hairline px-6 py-3 text-sm font-bold text-ink">{total} {total === 1 ? 'booking' : 'bookings'}</p>
        {rows.length === 0 ? <p className="px-6 py-8">No bookings match.</p> : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-[#FAFAFA] text-xs uppercase tracking-[0.06em]"><tr><th className="w-12 px-4 py-3"><span className="sr-only">Select</span></th>{['Reference', 'Booked', 'Course', 'Date', 'Booker', 'Places', 'Total', 'Status'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="border-t border-hairline align-top">
                    <td className="px-4 py-3"><input type="checkbox" name="id" value={b.id} form="bulk" aria-label={`Select ${b.reference}`} className="h-5 w-5" /></td>
                    <td className="px-4 py-3 font-bold"><Link href={`/admin/bookings/${encodeURIComponent(b.reference)}`}>{b.reference}</Link></td>
                    <td className="whitespace-nowrap px-4 py-3">{dt.format(b.createdAt)}</td>
                    <td className="px-4 py-3"><Link href={`/admin/courses/${b.courseId}${b.sessionId ? `?session=${b.sessionId}` : ''}`} className="font-bold">{b.course.title}</Link><div className="mt-1"><DeliveryChip type={b.course.deliveryType} /></div></td>
                    <td className="whitespace-nowrap px-4 py-3">{b.session ? dt.format(b.session.startsAt) : 'Any time'}</td>
                    <td className="px-4 py-3">{b.booker.firstName} {b.booker.lastName}<span className="block text-xs">{b.account?.company ?? b.booker.email}</span></td>
                    <td className="px-4 py-3">{b.places}{b.attendees.some((a) => !a.personId) && <span className="block text-xs text-warn-fg">{b.attendees.filter((a) => !a.personId).length} unnamed</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{gbp(b.totalPence)}<span className="block text-xs">{b.method === 'CARD' ? 'Card' : 'Account'}</span></td>
                    <td className="px-4 py-3"><Chip tone={TONE[b.status]}>{STATUS_LABEL[b.status]}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-4 text-sm">
          {p > 1 ? <Link href={`/admin/bookings?${qs({ page: p - 1 })}`}>← Previous</Link> : <span />}
          <span>Page {p} of {pages}</span>
          {p < pages ? <Link href={`/admin/bookings?${qs({ page: p + 1 })}`}>Next →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
