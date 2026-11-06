import Link from 'next/link';
import type { Metadata } from 'next';
import { DeliveryType } from '@prisma/client';
import { db } from '@/lib/db';
import { DELIVERY_LABEL, gbp } from '@/lib/format';
import { DeliveryChip, Chip, Hero } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Courses',
  description: 'CompEx, EUSR, Thames Water, DSEAR and process safety courses: eLearning, virtual classroom and in person.',
  // Filtered views share one canonical URL so they are not indexed separately.
  alternates: { canonical: '/courses' },
};

type Search = Promise<{ type?: string; subject?: string }>;

export default async function CoursesPage({ searchParams }: { searchParams: Search }) {
  const { type, subject } = await searchParams;
  const deliveryType = Object.values(DeliveryType).includes(type as DeliveryType) ? (type as DeliveryType) : undefined;

  const [subjects, courses] = await Promise.all([
    db.subject.findMany({ where: { live: true }, orderBy: { name: 'asc' } }),
    db.course.findMany({
      where: { status: 'PUBLISHED', deliveryType, subject: subject ? { slug: subject } : undefined },
      include: { subject: true, sessions: { where: { status: 'PUBLISHED', startsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' }, take: 1 } },
      orderBy: { title: 'asc' },
    }),
  ]);

  const href = (p: { type?: string; subject?: string }) => {
    const q = new URLSearchParams();
    if (p.type) q.set('type', p.type);
    if (p.subject) q.set('subject', p.subject);
    const s = q.toString();
    return s ? `/courses?${s}` : '/courses';
  };
  const pill = (on: boolean) =>
    `inline-flex min-h-10 items-center rounded-full px-4 text-sm no-underline ${on ? 'bg-ink font-bold text-white' : 'border border-hairline bg-white font-semibold text-ink'}`;

  return (
    <>
      <Hero eyebrow="Training" title="Courses" sub="Filter by how you want to learn, then pick a course. eLearning starts the day you book." />
      <div className="flex flex-col gap-3 border-b border-hairline bg-white px-4 py-5 md:px-20">
        <div role="group" aria-label="Delivery type" className="flex flex-wrap gap-2">
          <Link href={href({ subject })} className={pill(!deliveryType)} aria-current={!deliveryType ? 'true' : undefined}>All delivery types</Link>
          {Object.values(DeliveryType).map((t) => (
            <Link key={t} href={href({ type: t, subject })} className={pill(deliveryType === t)} aria-current={deliveryType === t ? 'true' : undefined}>{DELIVERY_LABEL[t]}</Link>
          ))}
        </div>
        <div role="group" aria-label="Subject" className="flex flex-wrap gap-2">
          <Link href={href({ type })} className={pill(!subject)}>All subjects</Link>
          {subjects.map((s) => (
            <Link key={s.id} href={href({ type, subject: s.slug })} className={pill(subject === s.slug)}>{s.name}</Link>
          ))}
        </div>
      </div>
      <div className="px-4 py-8 md:px-20">
        <p aria-live="polite" className="mb-5 font-bold text-ink">{courses.length} {courses.length === 1 ? 'course' : 'courses'}</p>
        {courses.length === 0 ? (
          <p>No courses match these filters. <Link href="/courses">Clear filters</Link></p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {courses.map((c) => (
              <Link key={c.id} href={`/courses/${c.slug}`} className="card-link flex flex-col overflow-hidden">
                <div className="flex h-28 items-center justify-center bg-[#D9DBDF] text-xs font-bold uppercase tracking-widest text-slate">Course photo</div>
                <div className="flex flex-1 flex-col gap-2.5 p-5">
                  <div className="flex flex-wrap gap-1.5"><DeliveryChip type={c.deliveryType} /><Chip>{c.subject.name}</Chip></div>
                  <h2 className="text-lg font-extrabold leading-snug text-ink">{c.title}</h2>
                  <p className="flex-1 text-sm leading-relaxed text-slate">{c.shortDescription}</p>
                  <div className="flex items-baseline justify-between border-t border-hairline pt-3 text-sm">
                    <span>{c.durationText} · {c.deliveryType === 'ELEARNING' ? 'Start any time' : c.sessions[0] ? `Next ${c.sessions[0].startsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })}` : 'Dates soon'}</span>
                    <strong className="text-ink">{gbp(c.pricePence)}</strong>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
