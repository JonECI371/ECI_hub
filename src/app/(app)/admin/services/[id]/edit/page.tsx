import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { SITE_URL } from '@/lib/format';
import { serviceFormValues } from '@/lib/service-form-values';
import { ServiceForm } from '@/components/service-form';
import { saveService } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit service', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('/admin/services');
  const { id } = await params;
  const service = await db.service.findUnique({ where: { id } });
  if (!service) notFound();
  const [courses, services] = await Promise.all([
    db.course.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, title: true }, orderBy: { title: 'asc' } }),
    db.service.findMany({ where: { NOT: { id } }, select: { slug: true, title: true }, orderBy: { title: 'asc' } }),
  ]);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1.5 text-xs"><Link href="/admin/services">Services</Link> › {service.title}</p>
          <h1 className="text-[30px] font-extrabold tracking-tight text-ink">Edit service</h1>
        </div>
        <div className="flex gap-2">
          {service.status === 'PUBLISHED' && <Link href={`/consultancy/${service.slug}`} className="inline-flex min-h-11 items-center rounded-chip border border-field bg-card px-4 text-sm font-bold text-ink no-underline">View page</Link>}
          <Link href={`/admin/services/new?from=${service.id}`} className="inline-flex min-h-11 items-center rounded-chip border border-field bg-card px-4 text-sm font-bold text-ink no-underline">Duplicate</Link>
        </div>
      </div>
      <ServiceForm action={saveService} initial={serviceFormValues(service)} siteUrl={SITE_URL} courseOptions={courses} serviceOptions={services} />
    </>
  );
}
