import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { fmtTime, priceExVat } from '@/lib/format';
import { breadcrumbJsonLd, courseJsonLd, faqJsonLd } from '@/lib/seo';
import { readContent, readFaqs } from '@/lib/course-content';
import { placesLeft, placesLabel } from '@/lib/sessions';
import { Chip, DeliveryChip, Eyebrow } from '@/components/ui';
import { DatePicker, type PickerSession } from '@/components/date-picker';

export const dynamic = 'force-dynamic';
type Params = Promise<{ slug: string }>;
type Search = Promise<{ waitlist?: string }>;

const TZ = 'Europe/London';
const longDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
const shortDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
const parts = (d: Date) => {
  const p = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: TZ }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return { y: g('year'), m: g('month'), d: g('day') };
};

async function load(slug: string) {
  return db.course.findFirst({
    where: { slug, status: 'PUBLISHED' },
    include: {
      subject: true,
      sessions: { where: { status: { in: ['PUBLISHED', 'FULL'] }, startsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' }, include: { venue: true } },
    },
  });
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const c = await load((await params).slug);
  if (!c) return {};
  return {
    title: c.seoTitle ?? c.title,
    description: c.seoDescription ?? c.shortDescription,
    alternates: { canonical: `/courses/${c.slug}` },
    openGraph: { title: c.title, description: c.shortDescription, images: c.socialImageUrl ?? c.photoUrl ?? undefined },
  };
}

export default async function CoursePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const c = await load((await params).slug);
  if (!c) notFound();
  const { waitlist } = await searchParams;
  const content = readContent(c.content);
  const faqs = readFaqs(c.faqs);
  const price = priceExVat(c.pricePence);
  const isElearning = c.deliveryType === 'ELEARNING';

  const left = await placesLeft(c.sessions);
  const where = (s: (typeof c.sessions)[number]) =>
    c.deliveryType === 'IN_PERSON'
      ? s.venue ? `${s.venue.name}, ${s.venue.address.split(',').pop()?.trim()}` : 'Venue to be confirmed'
      : `Online · ${c.meetingPlatform === 'ZOOM' ? 'Zoom' : 'Microsoft Teams'}`;
  const picker: PickerSession[] = c.sessions.map((s) => {
    const n = left.get(s.id) ?? 0;
    const full = s.status === 'FULL' || n === 0;
    const days = Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 86400000);
    return {
      id: s.id,
      ...parts(s.startsAt),
      long: longDate.format(s.startsAt).replace(',', ''),
      time: days >= 1 ? `${fmtTime(s.startsAt)}, ${days + 1} days` : `${fmtTime(s.startsAt)} to ${fmtTime(s.endsAt)}`,
      where: where(s),
      full,
      places: full ? null : placesLabel(n, s.capacity, c.subject.placesLeftDisplay),
    };
  });
  const related = content.related?.length
    ? await db.course.findMany({ where: { slug: { in: content.related }, status: 'PUBLISHED' }, select: { slug: true, title: true, pricePence: true, durationText: true } })
    : [];

  const crumbs: [string, string][] = [['Home', '/'], ['Courses', '/courses'], [c.title, `/courses/${c.slug}`]];
  const jsonLd = [...courseJsonLd(c), breadcrumbJsonLd(crumbs), faqJsonLd(faqs)].filter(Boolean);

  const facts: [string, string][] = [
    ['Duration', c.durationText],
    ...(c.accreditation ? [['Awarded by', c.accreditation] as [string, string]] : []),
    ...(c.validityYears ? [['Valid for', `${c.validityYears} years`] as [string, string]] : []),
    ...(content.assessment ? [['Assessment', content.assessment] as [string, string]] : []),
  ];
  const deliveryLine = isElearning
    ? `Self-paced online.${c.daysToComplete ? ` You have ${c.daysToComplete} days to finish.` : ''}`
    : c.deliveryType === 'VIRTUAL_CLASSROOM'
      ? `Live online on ${c.meetingPlatform === 'ZOOM' ? 'Zoom' : 'Microsoft Teams'}. Your joining link is emailed once your booking is confirmed.`
      : 'In person. The venue address is in your booking confirmation.';
  const nextOpen = picker.find((s) => !s.full);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="hero-motif px-4 pb-12 pt-10 md:px-20">
        <nav aria-label="Breadcrumb" className="mb-4 text-[13px] text-white/70">
          <Link href="/" className="text-white/80">Home</Link> / <Link href="/courses" className="text-white/80">Training</Link> / {c.title}
        </nav>
        <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-cyan">{content.eyebrow ?? c.subject.name}</p>
        <h1 className="mb-4 max-w-[820px] text-4xl font-extrabold leading-tight tracking-tight text-white [text-wrap:balance] md:text-[48px]">{c.title}</h1>
        <p className="mb-8 max-w-[720px] text-[17px] leading-relaxed text-white/80">{c.description}</p>
        <dl className="grid max-w-[820px] grid-cols-2 gap-6 border-t border-white/15 pt-6 sm:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="mb-1 text-xs uppercase tracking-[0.08em] text-white/60">{k}</dt>
              <dd className="text-base font-semibold text-white">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex flex-col gap-8 px-4 py-10 md:px-20 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-12">
          <section id="dates" className="scroll-mt-6">
            <Eyebrow>{isElearning ? 'Booking' : 'Dates and booking'}</Eyebrow>
            <h2 className="mb-2 text-[28px] font-bold tracking-tight text-ink">{isElearning ? 'Start any time' : 'Choose a date'}</h2>
            {isElearning ? (
              <div className="rounded-card bg-white p-6 shadow-card">
                <p className="mb-4 leading-relaxed">No fixed date. You get access within one working day of booking{c.daysToComplete ? `, then have ${c.daysToComplete} days to finish` : ''}.</p>
                <Link href={`/book/course/${c.slug}`} className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-5 text-sm font-semibold text-ink no-underline">Book now</Link>
              </div>
            ) : picker.length === 0 ? (
              <div className="rounded-card bg-white p-6 shadow-card">
                <p>No dates published yet. <Link href="/contact">Ask us about dates or on-site delivery</Link>.</p>
              </div>
            ) : (
              <>
                <p className="mb-5 text-[15px]">Pick a date on the calendar or from the list. All times are UK time.</p>
                <DatePicker sessions={picker} initialId={waitlist} />
              </>
            )}
          </section>

          {content.beforeYouBook && (
            <section className="rounded-card bg-warn-bg p-6 text-warn-fg">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em]">Before you book</p>
              <p className="max-w-[720px] text-[15px] leading-relaxed">{content.beforeYouBook}</p>
            </section>
          )}

          {content.audience && (
            <section>
              <Eyebrow>Who needs this</Eyebrow>
              <h2 className="mb-3 text-[28px] font-bold tracking-tight text-ink">{content.audienceHeading ?? 'Who this course is for'}</h2>
              <p className="max-w-[720px] text-base leading-[1.7]">{content.audience}</p>
            </section>
          )}

          {content.cover?.length ? (
            <section>
              <Eyebrow>Course detail</Eyebrow>
              <h2 className="mb-6 text-[28px] font-bold tracking-tight text-ink">What you will cover</h2>
              <div className="grid gap-px border border-hairline bg-hairline sm:grid-cols-2">
                {content.cover.map((x, i) => (
                  <div key={x.title} className="bg-white p-6">
                    <p className="mb-3 text-xl font-bold text-cyan">{String(i + 1).padStart(2, '0')}</p>
                    <h3 className="mb-2 text-lg font-bold text-ink">{x.title}</h3>
                    <p className="text-sm leading-[1.7]">{x.text}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {faqs.length > 0 && (
            <section>
              <Eyebrow>Common questions</Eyebrow>
              <h2 className="mb-6 text-[28px] font-bold tracking-tight text-ink">Before the day</h2>
              <div className="overflow-hidden rounded-card bg-white shadow-card">
                {faqs.map((f) => (
                  <details key={f.q} className="group border-b border-hairline last:border-0">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 text-base font-bold text-ink [&::-webkit-details-marker]:hidden">
                      {f.q}
                      <span aria-hidden="true" className="text-xl text-slate transition group-open:rotate-45">+</span>
                    </summary>
                    <p className="px-6 pb-5 text-[15px] leading-relaxed">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside aria-label="Book your place" className="w-full overflow-hidden rounded-card bg-white shadow-card lg:sticky lg:top-6 lg:w-[360px] lg:shrink-0">
          <p className="bg-ink px-6 py-4 font-bold text-white">Book your place</p>
          <div className="flex flex-col gap-3.5 p-6">
            <div className="flex flex-wrap gap-1.5"><DeliveryChip type={c.deliveryType} /><Chip>{c.subject.name}</Chip></div>
            <p>
              <span className="text-[32px] font-bold text-ink">{price.amount}</span>
              {price.vatNote && <span className="ml-1.5 text-sm">per place + VAT</span>}
            </p>
            <p className="text-sm leading-relaxed">{c.durationText} · {deliveryLine}</p>
            {!isElearning && picker.length > 0 && (
              <p className="text-sm">
                <strong className="text-ink">{picker.length} upcoming {picker.length === 1 ? 'date' : 'dates'}</strong>
                {nextOpen && <> · next on {shortDate.format(c.sessions.find((s) => s.id === nextOpen.id)!.startsAt).replace(',', '')}</>}
              </p>
            )}
            <Link href={isElearning ? `/book/course/${c.slug}` : '#dates'} className="inline-flex min-h-[52px] items-center justify-center rounded-chip bg-cyan px-5 text-[15px] font-semibold text-ink no-underline">
              {isElearning ? 'Book now' : 'Choose a date'}
            </Link>
            <p className="text-[13px]">Booking for your company? <Link href="/accounts/apply">Apply for a credit account</Link></p>
          </div>
        </aside>
      </div>

      {content.completion && (
        <section className="bg-ink px-4 py-[52px] md:px-20">
          <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-cyan">On completion</p>
          <h2 className="mb-3 text-[28px] font-bold tracking-tight text-white">{content.completionHeading ?? 'Your certificate'}</h2>
          <p className="max-w-[720px] text-base leading-[1.7] text-white/75">{content.completion}</p>
        </section>
      )}

      {related.length > 0 && (
        <section className="bg-white px-4 py-14 md:px-20">
          <Eyebrow>Next steps</Eyebrow>
          <h2 className="mb-8 text-[28px] font-bold tracking-tight text-ink">Often taken alongside</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => {
              const p = priceExVat(r.pricePence);
              return (
                <Link key={r.slug} href={`/courses/${r.slug}`} className="card-link p-6">
                  <h3 className="mb-2 text-lg font-bold text-ink">{r.title}</h3>
                  <p className="text-sm">{p.amount}{p.vatNote ? ' + VAT' : ''} · {r.durationText}</p>
                  <span className="mt-3 block text-sm font-bold text-ink">View course →</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

