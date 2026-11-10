import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requirePerson } from '@/lib/auth';
import { fmtSessionDates, fmtTime } from '@/lib/format';
import { TrainerRuleError, trainerSession } from '@/lib/trainer-app';
import { AttendanceForm, type AttendanceRow } from '@/components/attendance-form';
import { attendance } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mark attendance', robots: { index: false } };

export default async function MarkAttendance({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requirePerson(['TRAINER'], '/trainer');
  const { id } = await params;
  const { saved, error } = await searchParams;
  let s;
  try { s = await trainerSession(me.id, id); } catch (e) { if (e instanceof TrainerRuleError) notFound(); throw e; }
  const open = s.startsAt.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) <= new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const rows: AttendanceRow[] = s.bookings.flatMap((b) => b.attendees.map((a) => ({ a, b })))
    .filter(({ a }) => a.person)
    .sort((x, y) => x.a.person!.lastName.localeCompare(y.a.person!.lastName))
    .map(({ a, b }) => {
      const ans = (a.registration?.answers ?? {}) as Record<string, string>;
      return {
        id: a.id, name: `${a.person!.firstName} ${a.person!.lastName}`, company: b.account?.company ?? a.person!.employer ?? '',
        needs: [ans.dietary && `Diet: ${ans.dietary}`, ans.accessNeeds && `Access: ${ans.accessNeeds}`].filter(Boolean).join(' · '),
        mark: a.status === 'ATTENDED' || a.status === 'NO_SHOW' ? a.status : null,
      };
    });
  const unnamed = s.bookings.flatMap((b) => b.attendees).filter((a) => !a.person).length;

  return (
    <>
      <div>
        <Link href="/trainer" className="text-sm">← My sessions</Link>
        <h1 className="mt-2 text-[26px] font-extrabold tracking-tight text-ink">Mark attendance</h1>
        <p className="font-bold text-ink">{s.course.title}</p>
        <p className="text-sm">{fmtSessionDates(s.startsAt, s.endsAt)}, {fmtTime(s.startsAt)} · dietary and accessibility needs shown</p>
      </div>
      {saved && <p role="status" className="rounded-control bg-cyan-soft px-4 py-3 text-sm font-semibold text-ink">Attendance saved. ECI has been notified.</p>}
      {error && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">{error}</p>}
      {!open && <p className="rounded-control bg-page px-4 py-3 text-sm">This is the class list. Attendance opens on the first day of the session.</p>}
      {unnamed > 0 && <p className="rounded-control bg-warn-bg px-4 py-3 text-sm text-warn-fg">{unnamed} {unnamed === 1 ? 'place has' : 'places have'} no name yet. The office will update the list.</p>}
      {rows.length === 0 ? <p className="rounded-card bg-white p-6 shadow-card">Nobody booked yet.</p> : <AttendanceForm action={attendance} sessionId={s.id} rows={rows} open={open} />}
    </>
  );
}
