import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { gbp } from '@/lib/format';
import { Chip, DeliveryChip } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Courses', robots: { index: false } };
const dt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
const STATUS = { DRAFT: ['warn', 'Draft'], PUBLISHED: ['soft', 'Published'], WITHDRAWN: ['grey', 'Withdrawn'] } as const;

export default async function AdminCourses() {
  await requireAdmin('/admin/courses');
  const courses = await db.course.findMany({
    include: { subject: true, sessions: { where: { startsAt: { gt: new Date() }, status: { not: 'CANCELLED' } }, orderBy: { startsAt: 'asc' } } },
    orderBy: [{ status: 'asc' }, { title: 'asc' }],
  });
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-1.5 text-xs">Admin › Courses</p><h1 className="text-[30px] font-extrabold tracking-tight text-ink">Courses</h1></div>
        <Link href="/admin/courses/new" className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-4 text-sm font-bold text-ink no-underline">New course</Link>
      </div>
      <section className="overflow-hidden rounded-card bg-white shadow-card">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-[#FAFAFA] text-xs uppercase tracking-[0.06em]"><tr>{['Course', 'Subject', 'Delivery', 'Price', 'Next date', 'Upcoming', 'Status'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} className="border-t border-hairline">
                  <td className="px-4 py-3"><Link href={`/admin/courses/${c.id}`} className="font-bold">{c.title}</Link></td>
                  <td className="px-4 py-3">{c.subject.name}</td>
                  <td className="px-4 py-3"><DeliveryChip type={c.deliveryType} /></td>
                  <td className="px-4 py-3 tabular-nums">{gbp(c.pricePence)}</td>
                  <td className="px-4 py-3">{c.deliveryType === 'ELEARNING' ? 'Any time' : c.sessions[0] ? dt.format(c.sessions[0].startsAt) : 'None'}</td>
                  <td className="px-4 py-3">{c.deliveryType === 'ELEARNING' ? '-' : c.sessions.length}</td>
                  <td className="px-4 py-3"><Chip tone={STATUS[c.status][0]}>{STATUS[c.status][1]}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
