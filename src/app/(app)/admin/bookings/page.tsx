import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { gbp } from '@/lib/format';
import { STATUSES, STATUS_LABEL, bookingWhere } from '@/lib/admin-bookings';
import { Chip, DeliveryChip } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bookings', robots: { index: false } };

const PER_PAGE = 25;
const dt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
const TONE = { CONFIRMED: 'soft', PAYMENT_PENDING: 'warn', COMPLETED: 'grey', CANCELLED: 'grey' } as const;

export default async function AdminBookings({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  await requireAdmin('/admin/bookings');
  const { q, status, page } = await searchParams;
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
      <section className="overflow-hidden rounded-card bg-white shadow-card">
        <p aria-live="polite" className="border-b border-hairline px-6 py-3 text-sm font-bold text-ink">{total} {total === 1 ? 'booking' : 'bookings'}</p>
        {rows.length === 0 ? <p className="px-6 py-8">No bookings match.</p> : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-[#FAFAFA] text-xs uppercase tracking-[0.06em]"><tr>{['Reference', 'Booked', 'Course', 'Date', 'Booker', 'Places', 'Total', 'Status'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="border-t border-hairline align-top">
                    <td className="px-4 py-3 font-bold text-ink">{b.reference}</td>
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
