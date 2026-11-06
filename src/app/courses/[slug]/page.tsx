import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { fmtDate, fmtTime, gbp } from '@/lib/format';
import { courseJsonLd } from '@/lib/seo';
import { Button, Card, Chip, DeliveryChip, Hero } from '@/components/ui';

export const dynamic = 'force-dynamic';
type Params = Promise<{ slug: string }>;

async function load(slug: string) {
  return db.course.findFirst({
    where: { slug, status: 'PUBLISHED' },
    include: {
      subject: true,
      sessions: { where: { status: { in: ['PUBLISHED', 'FULL'] }, startsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' }, include: { venue: true, _count: { select: { bookings: true } } } },
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

export default async function CoursePage({ params }: { params: Params }) {
  const c = await load((await params).slug);
  if (!c) notFound();
  // TODO Phase 1: places left must come from attendee counts, not booking counts.
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(courseJsonLd(c)) }} />
      <Hero eyebrow={c.subject.name} title={c.title} sub={c.shortDescription} />
      <div className="flex flex-col gap-8 px-4 py-10 md:flex-row md:items-start md:px-20">
        <div className="flex flex-1 flex-col gap-6">
          <Card>
            <h2 className="mb-4 text-xl font-extrabold text-ink">{c.deliveryType === 'ELEARNING' ? 'Start any time' : 'Choose a date'}</h2>
            {c.deliveryType === 'ELEARNING' ? (
              <p>Self-paced. You get access within one working day of registering{c.daysToComplete ? `, then have ${c.daysToComplete} days to finish` : ''}.</p>
            ) : c.sessions.length === 0 ? (
              <p>No dates published yet. <a href="/contact">Ask us about dates or on-site delivery.</a></p>
            ) : (
              <ul className="divide-y divide-hairline">
                {c.sessions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div>
                      <p className="font-extrabold text-ink">{fmtDate(s.startsAt)}</p>
                      <p className="text-sm">{fmtTime(s.startsAt)} to {fmtTime(s.endsAt)} UK time · {s.venue ? `${s.venue.name}, ${s.venue.postcode}` : 'Online'}</p>
                    </div>
                    {s.status === 'FULL' ? <Button href={`/waitlist/${s.id}`} kind="secondary">Join waitlist</Button> : <Button href={`/book/${s.id}`}>Book</Button>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-3 text-xl font-extrabold text-ink">About this course</h2>
            <p className="leading-relaxed">{c.description}</p>
          </Card>
        </div>
        <aside className="w-full rounded-card bg-white shadow-card md:sticky md:top-6 md:w-[360px]">
          <div className="rounded-t-card bg-ink px-6 py-4 font-bold text-white">Book your place</div>
          <div className="flex flex-col gap-3 p-6">
            <div className="flex gap-1.5"><DeliveryChip type={c.deliveryType} /><Chip>{c.subject.name}</Chip></div>
            <p className="text-3xl font-extrabold text-ink">{gbp(c.pricePence)} <span className="text-sm font-normal text-slate">per place + VAT</span></p>
            <p className="text-sm">{c.durationText}</p>
            <Button href={c.deliveryType === 'ELEARNING' ? `/book/course/${c.slug}` : '#dates'}>{c.deliveryType === 'ELEARNING' ? 'Book now' : 'Choose a date'}</Button>
            <p className="text-xs">Booking for your company? <a href="/accounts/apply">Apply for a credit account</a></p>
          </div>
        </aside>
      </div>
    </>
  );
}
