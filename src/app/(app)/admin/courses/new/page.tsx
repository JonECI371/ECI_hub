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

export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  await requireAdmin('/admin/courses');
  const { from } = await searchParams;
  const source = from ? await db.course.findUnique({ where: { id: from } }) : null;
  const [subjects, venues, others, formatOptions] = await Promise.all([db.subject.findMany({ orderBy: { name: 'asc' } }), db.venue.findMany({ orderBy: { name: 'asc' } }), db.course.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, title: true }, orderBy: { title: 'asc' } }), db.course.findMany({ select: { id: true, title: true, deliveryType: true }, orderBy: { title: 'asc' } })]);
  // A duplicate starts from the original's details and wording. It is a draft, linked to the original as another format.
  const initial = source
    ? { ...courseFormValues(source, subjects[0]?.id ?? '', [source.id], subjects), id: undefined, title: `${source.title} (copy)`, slug: `${source.slug}-copy`, status: 'DRAFT', copyFrom: source.id }
    : courseFormValues(null, subjects[0]?.id ?? '', [], subjects);
  return (
    <>
      <div>
        <p className="mb-1.5 text-xs"><Link href="/admin/courses">Courses</Link></p>
        <h1 className="text-[30px] font-extrabold tracking-tight text-ink">{source ? 'Duplicate course' : 'New course'}</h1>
        {source && <p data-testid="duplicate-note" className="mt-2 max-w-[720px] rounded-control bg-cyan-soft px-4 py-3 text-sm text-ink">A copy of <strong>{source.title}</strong>, saved as a draft. Choose how it is delivered, check the price, dates and wording, then save. It is linked to the original as another format; untick that below if it is a different course. Dates are not copied.</p>}
      </div>
      <CourseForm action={saveCourse} initial={initial} subjects={subjects} venues={venues} siteUrl={SITE_URL} relatedOptions={others} formatOptions={formatOptions} />
    </>
  );
}
