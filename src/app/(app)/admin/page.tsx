import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin, TASK_LABEL } from '@/lib/admin';
import { placesLeft } from '@/lib/sessions';
import { Chip, DeliveryChip } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin', robots: { index: false } };

const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/London' }).format(new Date()));

export default async function AdminHome() {
  const me = await requireAdmin();
  const now = new Date();
  const in14 = new Date(now.getTime() + 14 * 86400000);
  const [sessions, byType] = await Promise.all([
    db.session.findMany({
      where: { startsAt: { gte: now, lte: in14 }, status: { in: ['PUBLISHED', 'FULL', 'RUNNING'] } },
      include: { course: true, trainer: true, waitlist: true, bookings: { where: { status: 'CONFIRMED' }, include: { attendees: { include: { registration: true } } } } },
      orderBy: { startsAt: 'asc' },
    }),
    db.task.groupBy({ by: ['type'], where: { status: 'OPEN' }, _count: true }),
  ]);
  const left = await placesLeft(sessions);
  const count = (t: string) => byType.find((x) => x.type === t)?._count ?? 0;
  const delegates = sessions.reduce((n, s) => n + s.bookings.reduce((m, b) => m + b.places, 0), 0);
  const tiles: [string, number, string, string][] = [
    ['Courses in the next 14 days', sessions.length, `${delegates} delegates booked`, '/admin/schedule'],
    ['eLearning enrolments', count('ELEARNING_ENROLMENT'), 'Waiting to be enrolled', '/admin/tasks?type=ELEARNING_ENROLMENT'],
    ['Registrations to check', count('REGISTRATION_APPROVAL'), 'Approve or ask for changes', '/admin/tasks?type=REGISTRATION_APPROVAL'],
    ['Certificates to upload', count('CERTIFICATE_UPLOAD'), 'After attendance is marked', '/admin/tasks?type=CERTIFICATE_UPLOAD'],
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1.5 text-xs">Admin</p>
          <h1 className="text-[30px] font-extrabold tracking-tight text-ink">{hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}, {me.firstName}</h1>
        </div>
        <div className="flex gap-2.5">
          <Link href="/admin/courses/new" className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-4 text-sm font-bold text-ink no-underline">New course</Link>
          <Link href="/admin/schedule" className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-4 text-sm font-bold text-ink no-underline">New session</Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(([label, n, sub, href]) => (
          <Link key={label} href={href} className="card-link p-5">
            <p className="text-sm">{label}</p>
            <p className="my-1 text-[34px] font-extrabold tabular-nums text-ink">{n}</p>
            <p className="text-[13px]">{sub}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-card bg-white shadow-card" aria-labelledby="up-h">
          <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
            <h2 id="up-h" className="text-lg font-extrabold text-ink">Upcoming courses</h2>
            <Link href="/admin/schedule" className="text-sm font-bold">Open schedule →</Link>
          </div>
          {sessions.length === 0 ? (
            <p className="px-6 py-8">No sessions in the next 14 days.</p>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-[#FAFAFA] text-xs uppercase tracking-[0.06em]"><tr><th className="px-6 py-3">Date</th><th className="px-6 py-3">Course</th><th className="px-6 py-3">Delivery</th><th className="px-6 py-3">Trainer</th><th className="px-6 py-3">Places</th><th className="px-6 py-3">Status</th></tr></thead>
                <tbody>
                  {sessions.map((s) => {
                    const booked = s.capacity - (left.get(s.id) ?? 0);
                    const atts = s.bookings.flatMap((b) => b.attendees).filter((a) => a.status !== 'CANCELLED');
                    const missing = atts.filter((a) => !a.personId).length;
                    const pending = atts.filter((a) => a.registration?.approval === 'PENDING').length;
                    const status = !s.trainerId ? ['No trainer', 'bad'] : pending ? [`${pending} to approve`, 'warn'] : missing ? [`${missing} attendees missing`, 'warn'] : booked >= s.capacity ? [`Full${s.waitlist.length ? ` · ${s.waitlist.length} waiting` : ''}`, 'grey'] : ['Ready', 'soft'];
                    return (
                      <tr key={s.id} className="border-t border-hairline">
                        <td className="whitespace-nowrap px-6 py-3">{day.format(s.startsAt)}</td>
                        <td className="px-6 py-3"><Link href={`/admin/courses/${s.courseId}?session=${s.id}`} className="font-bold">{s.course.title}</Link></td>
                        <td className="px-6 py-3"><DeliveryChip type={s.course.deliveryType} /></td>
                        <td className="px-6 py-3">{s.trainer ? `${s.trainer.firstName} ${s.trainer.lastName}` : '-'}</td>
                        <td className="whitespace-nowrap px-6 py-3 tabular-nums">{booked} of {s.capacity} booked</td>
                        <td className="px-6 py-3"><Chip tone={status[1] as 'soft' | 'warn' | 'grey' | 'bad'}>{status[0]}</Chip></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-card bg-white shadow-card" aria-labelledby="att-h">
          <h2 id="att-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">Needs attention</h2>
          {byType.length === 0 ? (
            <p className="px-6 py-6 text-sm">Nothing waiting. The Tasks inbox is clear.</p>
          ) : (
            <ul>
              {byType.map((t) => (
                <li key={t.type} className="border-b border-hairline last:border-0">
                  <Link href={`/admin/tasks?type=${t.type}`} className="flex min-h-[52px] items-center gap-4 px-6 py-3 text-ink no-underline hover:bg-page">
                    <span className="flex size-8 items-center justify-center rounded-full bg-warn-bg text-sm font-extrabold text-warn-fg">{t._count}</span>
                    <span className="flex-1 text-sm font-semibold">{TASK_LABEL[t.type] ?? t.type}</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
