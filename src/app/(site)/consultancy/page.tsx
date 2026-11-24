import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { readServiceContent } from '@/lib/service-content';
import { Breadcrumbs } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Consultancy',
  description: 'EC&I safety consultancy from ECI-Hub: DSEAR risk assessment, hazardous area classification and more, for COMAH, chemical, oil and gas and water sites.',
  alternates: { canonical: '/consultancy' },
};

export default async function ConsultancyIndex() {
  const services = await db.service.findMany({ where: { status: 'PUBLISHED' }, orderBy: { title: 'asc' } });
  return (
    <>
      <Breadcrumbs items={[['Home', '/'], ['Consultancy']]} />
      <div className="hero-motif px-4 pb-10 pt-12 md:px-[max(4.1667%,calc((100%_-_1280px)/2))]">
        <h1 className="mb-2.5 text-4xl font-extrabold tracking-tight text-white md:text-[44px]">Consultancy</h1>
        <p className="max-w-[760px] text-[17px] leading-relaxed text-white/80">Specialist EC&amp;I safety consultancy from engineers who have worked on these sites. Every service is priced on application, after a short conversation.</p>
      </div>
      <div className="grid gap-4 px-4 py-10 sm:grid-cols-2 md:px-[max(4.1667%,calc((100%_-_1280px)/2))] lg:grid-cols-3">
        {services.length === 0 && <p className="rounded-card bg-white p-8 shadow-card sm:col-span-2 lg:col-span-3">Our consultancy pages are on their way. <Link href="/contact?topic=consult">Talk to us</Link> in the meantime.</p>}
        {services.map((s) => (
          <Link key={s.slug} href={`/consultancy/${s.slug}`} className="flex flex-col gap-2 rounded-card bg-white p-6 no-underline shadow-card">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink">{readServiceContent(s.content).category ?? 'Consultancy'}</p>
            <h2 className="text-xl font-bold text-ink">{s.title}</h2>
            <p className="text-sm leading-relaxed">{s.shortDescription}</p>
            <span className="mt-auto pt-2 text-sm font-bold text-ink underline decoration-cyan decoration-2 underline-offset-[3px]">See the service</span>
          </Link>
        ))}
      </div>
    </>
  );
}
