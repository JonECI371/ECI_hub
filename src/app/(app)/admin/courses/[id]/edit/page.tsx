import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { SITE_URL } from '@/lib/format';
import { courseFormValues } from '@/lib/course-form-values';
import { CourseForm } from '@/components/course-form';
import { saveCourse } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit course', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('/admin/courses');
  const { id } = await params; const course = await db.course.findUnique({ where: { id } }); if (!course) notFound();
  const [subjects, venues] = await Promise.all([db.subject.findMany({ orderBy: { name: 'asc' } }), db.venue.findMany({ orderBy: { name: 'asc' } })]);
  return (
    <>
      <div>
        <p className="mb-1.5 text-xs"><Link href="/admin/courses">Courses</Link> › <Link href={`/admin/courses/${course.id}`}>{course.title}</Link></p>
        <h1 className="text-[30px] font-extrabold tracking-tight text-ink">Edit course</h1>
      </div>
      <CourseForm action={saveCourse} initial={courseFormValues(course, subjects[0]?.id ?? '')} subjects={subjects} venues={venues} siteUrl={SITE_URL} />
    </>
  );
}
