import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { SITE_URL } from '@/lib/format';
import { courseFormValues } from '@/lib/course-form-values';
import { siblingIds } from '@/lib/course-formats';
import { CourseForm } from '@/components/course-form';
import { saveCourse } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit course', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('/admin/courses');
  const { id } = await params; const course = await db.course.findUnique({ where: { id } }); if (!course) notFound();
  const [subjects, venues, others, formatOptions, siblings] = await Promise.all([db.subject.findMany({ orderBy: { name: 'asc' } }), db.venue.findMany({ orderBy: { name: 'asc' } }), db.course.findMany({ where: { NOT: { id }, status: 'PUBLISHED' }, select: { slug: true, title: true }, orderBy: { title: 'asc' } }), db.course.findMany({ where: { NOT: { id } }, select: { id: true, title: true, deliveryType: true }, orderBy: { title: 'asc' } }), siblingIds(course)]);
  return (
    <>
      <div>
        <p className="mb-1.5 text-xs"><Link href="/admin/courses">Courses</Link> › <Link href={`/admin/courses/${course.id}`}>{course.title}</Link></p>
        <h1 className="text-[30px] font-extrabold tracking-tight text-ink">Edit course</h1>
      </div>
      <CourseForm action={saveCourse} initial={courseFormValues(course, subjects[0]?.id ?? '', siblings, subjects)} subjects={subjects} venues={venues} siteUrl={SITE_URL} relatedOptions={others} formatOptions={formatOptions} />
    </>
  );
}
