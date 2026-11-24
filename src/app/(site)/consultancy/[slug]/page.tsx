import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { SITE_URL, gbp } from '@/lib/format';
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/seo';
import { readServiceContent, readServiceFaqs } from '@/lib/service-content';
import { serviceEnquiryHref, serviceFacts, serviceJsonLd, serviceSummary } from '@/lib/service-page';
import { Breadcrumbs, Eyebrow } from '@/components/ui';

export const dynamic = 'force-dynamic';
type Params = Promise<{ slug: string }>;
const PAD = 'px-4 md:px-[max(4.1667%,calc((100%_-_1280px)/2))]';

const load = (slug: string) => db.service.findFirst({ where: { slug, status: 'PUBLISHED' } });

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const s = await load((await params).slug);
  if (!s) return {};
  return {
    title: s.seoTitle ?? s.title,
    description: s.seoDescription ?? s.shortDescription,
    alternates: { canonical: `/consultancy/${s.slug}`, types: { 'text/markdown': `/llms/consultancy/${s.slug}` } },
    openGraph: { title: s.title, description: s.shortDescription },
  };
}

function Bullets({ items }: { items: string[] }) {
  return <ul className="flex max-w-[760px] flex-col gap-2.5 text-base leading-relaxed">{items.map((i) => <li key={i} className="flex gap-3"><span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-cyan" /><span>{i}</span></li>)}</ul>;
}

export default async function ServicePage({ params }: { params: Params }) {
  const s = await load((await params).slug);
  if (!s) notFound();
  const c = readServiceContent(s.content);
  const faqs = readServiceFaqs(s.faqs);
  const [courses, services] = await Promise.all([
    c.relatedCourses?.length ? db.course.findMany({ where: { slug: { in: c.relatedCourses }, status: 'PUBLISHED' }, select: { slug: true, title: true, pricePence: true, durationText: true } }) : [],
    c.relatedServices?.length ? db.service.findMany({ where: { slug: { in: c.relatedServices }, status: 'PUBLISHED' }, select: { slug: true, title: true, shortDescription: true } }) : [],
  ]);
  const crumbs: [string, string][] = [['Home', '/'], ['Consultancy', '/consultancy'], [s.title, `/consultancy/${s.slug}`]];
  const jsonLd = [serviceJsonLd(s, c), breadcrumbJsonLd(crumbs), faqJsonLd(faqs)].filter(Boolean);
  const enquire = serviceEnquiryHref(s.title);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[['Home', '/'], ['Consultancy', '/consultancy'], [s.title]]} />

      <div className={`hero-motif ${PAD} pb-12 pt-10`}>
        <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-cyan">{c.category ?? 'Consultancy'}</p>
        <h1 className="mb-4 max-w-[860px] text-4xl font-extrabold leading-tight tracking-tight text-white [text-wrap:balance] md:text-[48px]">{s.title}</h1>
        <p className="mb-8 max-w-[720px] text-[17px] leading-relaxed text-white/80">{s.shortDescription}</p>
        <dl className="grid max-w-[920px] grid-cols-2 gap-6 border-t border-white/15 pt-6 sm:grid-cols-4">
          {serviceFacts(c).map(([k, v]) => (
            <div key={k}><dt className="mb-1 text-xs uppercase tracking-[0.08em] text-white/60">{k}</dt><dd className="text-base font-semibold text-white">{v}</dd></div>
          ))}
        </dl>
      </div>

      <section aria-label="In short" className={`border-b border-hairline bg-white ${PAD} py-6`}>
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-ink">In short</p>
        <p data-testid="in-short" className="max-w-[860px] text-[17px] leading-relaxed text-ink">{serviceSummary(s, c)}</p>
      </section>

      <div className={`flex flex-col gap-8 ${PAD} py-10 lg:flex-row lg:items-start`}>
        <div className="flex min-w-0 flex-1 flex-col gap-12">
          {c.whatIsIt?.length ? (
            <section><Eyebrow>The service</Eyebrow><h2 className="mb-3 text-[28px] font-bold tracking-tight text-ink">What is it?</h2>
              <div className="flex max-w-[760px] flex-col gap-3 text-base leading-[1.7]">{c.whatIsIt.map((p) => <p key={p}>{p}</p>)}</div></section>
          ) : null}

          {c.whoNeedsIt?.items.length ? (
            <section><Eyebrow>Who it is for</Eyebrow><h2 className="mb-3 text-[28px] font-bold tracking-tight text-ink">Who needs it?</h2>
              {c.whoNeedsIt.intro && <p className="mb-3 max-w-[760px] text-base leading-[1.7]">{c.whoNeedsIt.intro}</p>}
              <Bullets items={c.whoNeedsIt.items} />
              {c.whoNeedsIt.note && <p className="mt-3 max-w-[760px] text-base leading-[1.7]">{c.whoNeedsIt.note}</p>}</section>
          ) : null}

          {c.whyItMatters?.points.length ? (
            <section><Eyebrow>The risk</Eyebrow><h2 className="mb-3 text-[28px] font-bold tracking-tight text-ink">Why does it matter?</h2>
              {c.whyItMatters.intro && <p className="mb-3 max-w-[760px] text-base leading-[1.7]">{c.whyItMatters.intro}</p>}
              <Bullets items={c.whyItMatters.points} />
              {c.whyItMatters.closing && <p className="mt-3 max-w-[760px] text-base leading-[1.7]">{c.whyItMatters.closing}</p>}</section>
          ) : null}

          {c.approach?.steps.length ? (
            <section><Eyebrow>How we work</Eyebrow><h2 className="mb-3 text-[28px] font-bold tracking-tight text-ink">Our approach</h2>
              {c.approach.intro && <p className="mb-6 max-w-[760px] text-base leading-[1.7]">{c.approach.intro}</p>}
              <ol className="grid gap-px border border-hairline bg-hairline sm:grid-cols-2">
                {c.approach.steps.map((x, i) => (
                  <li key={x.title} className="bg-white p-6"><p className="mb-3 text-xl font-bold text-cyan">{String(i + 1).padStart(2, '0')}</p><h3 className="mb-2 text-lg font-bold text-ink">{x.title}</h3><p className="text-sm leading-[1.7]">{x.text}</p></li>
                ))}
              </ol>
              {c.approach.closing && <p className="mt-4 max-w-[760px] text-base leading-[1.7]">{c.approach.closing}</p>}</section>
          ) : null}

          {c.triggers?.length ? (
            <section><Eyebrow>Keeping it current</Eyebrow><h2 className="mb-3 text-[28px] font-bold tracking-tight text-ink">When to review</h2>
              {c.reviewFrequency && <p className="mb-3 max-w-[760px] text-base leading-[1.7]">Review {c.reviewFrequency.charAt(0).toLowerCase() + c.reviewFrequency.slice(1)}, or sooner when any of these happen:</p>}
              <Bullets items={c.triggers} /></section>
          ) : null}

          {c.whoWeWorkWith?.length ? (
            <section><Eyebrow>Our clients</Eyebrow><h2 className="mb-3 text-[28px] font-bold tracking-tight text-ink">Who we work with</h2><Bullets items={c.whoWeWorkWith} /></section>
          ) : null}

          {faqs.length > 0 && (
            <section><Eyebrow>Common questions</Eyebrow><h2 className="mb-6 text-[28px] font-bold tracking-tight text-ink">Questions and answers</h2>
              <div className="overflow-hidden rounded-card bg-white shadow-card">
                {faqs.map((f) => (
                  <details key={f.q} className="group border-b border-hairline last:border-0">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 text-base font-bold text-ink [&::-webkit-details-marker]:hidden">{f.q}<span aria-hidden="true" className="text-xl text-slate transition group-open:rotate-45">+</span></summary>
                    <p className="px-6 pb-5 text-[15px] leading-[1.7]">{f.a}</p>
                  </details>
                ))}
              </div></section>
          )}
        </div>

        <aside aria-label="Request a quote" className="w-full rounded-card bg-white shadow-card lg:sticky lg:top-6 lg:w-[360px] lg:shrink-0">
          <p className="rounded-t-card bg-ink px-6 py-4 font-bold text-white">Talk to a consultant</p>
          <div className="flex flex-col gap-4 p-6">
            <p className="text-2xl font-extrabold text-ink">POA</p>
            <p className="text-sm leading-relaxed">Every site is different, so we quote after a short conversation about what you have and what you need.</p>
            <Link href={enquire} className="inline-flex min-h-[52px] items-center justify-center rounded-chip bg-cyan px-5 font-bold text-ink no-underline" data-testid="enquire">Request a quote</Link>
            <p className="text-sm">We reply within one working day. Or call <a href="tel:+441932963463">+44 (0) 1932 963463</a>.</p>
            {c.outcome?.length ? (<div className="border-t border-hairline pt-4"><p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-ink">What you get</p><ul className="flex flex-col gap-1.5 text-sm">{c.outcome.map((o) => <li key={o}>{o}</li>)}</ul></div>) : null}
          </div>
        </aside>
      </div>

      {(courses.length > 0 || services.length > 0) && (
        <section className={`bg-white ${PAD} py-14`}>
          <Eyebrow>Related</Eyebrow>
          <h2 className="mb-8 text-[28px] font-bold tracking-tight text-ink">Often needed alongside</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((x) => <Link key={x.slug} href={`/consultancy/${x.slug}`} className="rounded-card border border-hairline p-5 no-underline"><p className="text-xs font-bold uppercase tracking-[0.08em] text-ink">Consultancy</p><p className="mt-1 font-bold text-ink">{x.title}</p><p className="mt-1 text-sm">{x.shortDescription}</p></Link>)}
            {courses.map((x) => <Link key={x.slug} href={`/courses/${x.slug}`} className="rounded-card border border-hairline p-5 no-underline"><p className="text-xs font-bold uppercase tracking-[0.08em] text-ink">Training</p><p className="mt-1 font-bold text-ink">{x.title}</p><p className="mt-1 text-sm">{x.durationText} · {gbp(x.pricePence)}{x.pricePence ? ' + VAT' : ''}</p></Link>)}
          </div>
        </section>
      )}
      <p className="sr-only">{SITE_URL}</p>
    </>
  );
}
