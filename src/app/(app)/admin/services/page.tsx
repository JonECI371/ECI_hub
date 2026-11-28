import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { readServiceContent } from '@/lib/service-content';
import { Chip } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Services', robots: { index: false } };
const STATUS = { DRAFT: ['warn', 'Draft'], PUBLISHED: ['soft', 'Published'], WITHDRAWN: ['grey', 'Withdrawn'] } as const;
const dt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
const btn = 'inline-flex min-h-11 items-center justify-center rounded-chip px-3 text-sm font-bold no-underline';

export default async function AdminServices({ searchParams }: { searchParams: Promise<{ msg?: string; id?: string }> }) {
  await requireAdmin('/admin/services');
  const { msg, id } = await searchParams;
  const services = await db.service.findMany({ orderBy: [{ status: 'asc' }, { title: 'asc' }] });
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-1.5 text-xs">Admin › Services</p><h1 className="text-[30px] font-extrabold tracking-tight text-ink">Consultancy services</h1></div>
        <Link href="/admin/services/new" className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-4 text-sm font-bold text-on-cyan no-underline">New service</Link>
      </div>
      {msg === 'saved' && <p role="status" className="rounded-control bg-cyan-soft px-4 py-3 text-sm font-semibold text-ink">Saved{id ? <> · <Link href={`/admin/services/${id}/edit`}>Edit it again</Link></> : ''}.</p>}
      <section className="overflow-hidden rounded-card bg-card shadow-card">
        {services.length === 0 ? <p className="p-8">No services yet. Add the first one with New service.</p> : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-card2 text-xs uppercase tracking-[0.06em]"><tr>{['Service', 'Label', 'Updated', 'Status', ''].map((h, i) => <th key={i} className="px-4 py-3">{h}</th>)}</tr></thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id} className="border-t border-hairline" data-testid="service-row">
                    <td className="px-4 py-3"><Link href={`/admin/services/${s.id}/edit`} className="font-bold">{s.title}</Link><span className="block text-xs">/consultancy/{s.slug}</span></td>
                    <td className="px-4 py-3">{readServiceContent(s.content).category ?? '-'}</td>
                    <td className="px-4 py-3">{dt.format(s.updatedAt)}</td>
                    <td className="px-4 py-3"><Chip tone={STATUS[s.status][0]}>{STATUS[s.status][1]}</Chip></td>
                    <td className="px-4 py-3"><div className="flex flex-wrap justify-end gap-2">
                      {s.status === 'PUBLISHED' && <Link href={`/consultancy/${s.slug}`} className={`${btn} border border-field bg-card text-ink`}>View page</Link>}
                      <Link href={`/admin/services/new?from=${s.id}`} className={`${btn} border border-field bg-card text-ink`}>Duplicate</Link>
                      <Link href={`/admin/services/${s.id}/edit`} className={`${btn} bg-cyan text-on-cyan`}>Edit</Link>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
