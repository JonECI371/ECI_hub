import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { SITE_URL } from '@/lib/format';
import { serviceFormValues } from '@/lib/service-form-values';
import { ServiceForm } from '@/components/service-form';
import { saveService } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New service', robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  await requireAdmin('/admin/services');
  const { from } = await searchParams;
  const source = from ? await db.service.findUnique({ where: { id: from } }) : null;
  const [courses, services] = await Promise.all([
    db.course.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, title: true }, orderBy: { title: 'asc' } }),
    db.service.findMany({ select: { slug: true, title: true }, orderBy: { title: 'asc' } }),
  ]);
  // A duplicate starts from the original's wording, as a draft with its own name and web address.
  const initial = source ? { ...serviceFormValues(source), id: undefined, title: `${source.title} (copy)`, slug: `${source.slug}-copy`, status: 'DRAFT' } : serviceFormValues(null);
  return (
    <>
      <div>
        <p className="mb-1.5 text-xs"><Link href="/admin/services">Services</Link></p>
        <h1 className="text-[30px] font-extrabold tracking-tight text-ink">{source ? 'Duplicate service' : 'New service'}</h1>
        {source && <p data-testid="duplicate-note" className="mt-2 max-w-[720px] rounded-control bg-cyan-soft px-4 py-3 text-sm text-ink">A copy of <strong>{source.title}</strong>, saved as a draft. Change the name, web address and wording, then save.</p>}
      </div>
      <ServiceForm action={saveService} initial={initial} siteUrl={SITE_URL} courseOptions={courses} serviceOptions={services} />
    </>
  );
}
