import Link from 'next/link';

import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { SITE_URL } from '@/lib/format';
import { courseFormValues } from '@/lib/course-form-values';
import { CourseForm } from '@/components/course-form';
import { saveCourse } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New course', robots: { index: false } };

export default async function Page() {
  await requireAdmin('/admin/courses');
  const course = null;
  const [subjects, venues, others] = await Promise.all([db.subject.findMany({ orderBy: { name: 'asc' } }), db.venue.findMany({ orderBy: { name: 'asc' } }), db.course.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, title: true }, orderBy: { title: 'asc' } })]);
  return (
    <>
      <div>
        <p className="mb-1.5 text-xs"><Link href="/admin/courses">Courses</Link></p>
        <h1 className="text-[30px] font-extrabold tracking-tight text-ink">New course</h1>
      </div>
      <CourseForm action={saveCourse} initial={courseFormValues(course, subjects[0]?.id ?? '')} subjects={subjects} venues={venues} siteUrl={SITE_URL} relatedOptions={others} />
    </>
  );
}
