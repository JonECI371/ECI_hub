import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { fmtSessionDates, fmtTime } from '@/lib/format';
import { PrintButton } from '@/components/print-button';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Class list', robots: { index: false } };

const APPROVAL: Record<string, string> = { APPROVED: 'Approved', NOT_REQUIRED: 'Registered', PENDING: 'Waiting for approval', RETURNED: 'Returned for changes' };

/** Printable class list for one date: who is coming, how to reach them, and their needs. */
export default async function ClassList({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ session?: string }> }) {
  const me = await requireAdmin('/admin/courses');
  const { id } = await params;
  const { session: sid } = await searchParams;
  const s = sid ? await db.session.findFirst({ where: { id: sid, courseId: id }, include: { course: true, venue: true, trainer: true, bookings: { where: { status: 'CONFIRMED' }, include: { account: true, booker: true, attendees: { where: { status: { not: 'CANCELLED' } }, include: { person: true, registration: true } } } } } }) : null;
  if (!s) notFound();
  const rows = s.bookings.flatMap((b) => b.attendees.map((a) => ({ a, b }))).sort((x, y) => (x.a.person?.lastName ?? 'zzz').localeCompare(y.a.person?.lastName ?? 'zzz'));
  const needs = rows.filter(({ a }) => { const ans = (a.registration?.answers ?? {}) as Record<string, string>; return ans.dietary || ans.accessNeeds; }).length;
  await db.auditLog.create({ data: { actorId: me.id, action: 'CLASS_LIST_VIEWED', recordType: 'Session', recordId: s.id } });
  const cell = 'border border-hairline px-2 py-1.5 align-top';

  return (
    <div className="flex flex-col gap-4 print:gap-2">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <p className="text-xs"><Link href={`/admin/courses/${id}?session=${s.id}`}>← Back to course</Link></p>
        <PrintButton />
      </div>
      <header>
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink print:text-xl">Class list: {s.course.title}</h1>
        <p className="text-sm">{fmtSessionDates(s.startsAt, s.endsAt)}, {fmtTime(s.startsAt)} to {fmtTime(s.endsAt)} · {s.venue ? `${s.venue.name}, ${s.venue.address}, ${s.venue.postcode}` : s.course.deliveryType === 'IN_PERSON' ? 'Venue to be confirmed' : 'Online'} · Trainer: {s.trainer ? `${s.trainer.firstName} ${s.trainer.lastName}` : 'not assigned'}</p>
        <p className="text-sm font-bold text-ink">{rows.length} {rows.length === 1 ? 'delegate' : 'delegates'} of {s.capacity} places · {needs} with dietary or access needs</p>
      </header>
      <div className="relative overflow-x-auto rounded-card bg-white p-4 shadow-card print:overflow-visible print:p-0 print:shadow-none">
        <table className="w-full min-w-[900px] border-collapse text-left text-[13px] print:min-w-0 print:text-[10px]">
          <thead className="bg-[#FAFAFA]"><tr>{['#', 'Name', 'Company', 'Mobile', 'Registration', 'Dietary', 'Access needs', 'Emergency contact', 'Signature'].map((h) => <th key={h} className={`${cell} font-bold text-ink`}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(({ a, b }, i) => {
              const ans = (a.registration?.answers ?? {}) as Record<string, string>;
              return (
                <tr key={a.id}>
                  <td className={cell}>{i + 1}</td>
                  <td className={`${cell} font-bold text-ink`}>{a.person ? `${a.person.firstName} ${a.person.lastName}` : <span className="text-warn-fg">Name to follow ({b.reference})</span>}</td>
                  <td className={cell}>{b.account?.company ?? a.person?.employer ?? '-'}</td>
                  <td className={cell}>{ans.mobile || a.person?.mobile || '-'}</td>
                  <td className={cell}>{a.registration ? APPROVAL[a.registration.approval] ?? a.registration.approval : 'Not registered'}</td>
                  <td className={cell}>{ans.dietary || '-'}</td>
                  <td className={cell}>{ans.accessNeeds || '-'}</td>
                  <td className={cell}>{ans.emergencyContact || '-'}</td>
                  <td className={`${cell} w-[120px]`} />
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={9} className={cell}>Nobody booked yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs">Contains personal data. Printed copies go back to the office after the course for secure disposal.</p>
    </div>
  );
}
