import Link from 'next/link';
import type { Metadata } from 'next';
import { DeliveryType } from '@prisma/client';
import { db } from '@/lib/db';
import { DELIVERY_LABEL, fmtTime, priceExVat } from '@/lib/format';
import { placesLeft, placesLabel } from '@/lib/sessions';
import { DeliveryChip, Chip } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Courses',
  description: 'CompEx, EUSR, Thames Water, DSEAR and process safety courses: eLearning, virtual classroom and in person.',
  // Filtered views share one canonical URL so they are not indexed separately.
  alternates: { canonical: '/courses' },
};

type View = 'courses' | 'dates' | 'calendar';
type Params = { type?: string; subject?: string; view?: string; month?: string };

const TZ = 'Europe/London';
const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: TZ });
const shortDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
const ukParts = (d: Date) => {
  const p = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', timeZone: TZ }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return { y: Number(g('year')), m: Number(g('month')), d: Number(g('day')), dow: g('weekday') };
};

/** Month in "YYYY-MM"; defaults to the current UK month. */
function parseMonth(s: string | undefined): { y: number; m: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(s ?? '');
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]);
    if (m >= 1 && m <= 12 && y >= 2020 && y <= 2100) return { y, m };
  }
  const now = ukParts(new Date());
  return { y: now.y, m: now.m };
}
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
const shift = (y: number, m: number, by: number) => {
  const t = y * 12 + (m - 1) + by;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
};

export default async function CoursesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const deliveryType = Object.values(DeliveryType).includes(params.type as DeliveryType) ? (params.type as DeliveryType) : undefined;
  const subject = params.subject || undefined;
  const view: View = params.view === 'dates' || params.view === 'calendar' ? params.view : 'courses';
  const { y, m } = parseMonth(params.month);
  // Month window, padded a day each side so UK midnight is covered whatever the clock change.
  const from = new Date(Date.UTC(y, m - 1, 1) - 86400000);
  const to = new Date(Date.UTC(y, m, 1) + 86400000);
  const now = new Date();

  const subjectWhere = subject ? { subject: { slug: subject } } : {};
  const [subjects, allCourses, monthSessions] = await Promise.all([
    db.subject.findMany({ where: { live: true }, orderBy: { name: 'asc' } }),
    db.course.findMany({
      where: { status: 'PUBLISHED', ...subjectWhere },
      include: { subject: true, sessions: { where: { status: { in: ['PUBLISHED', 'FULL'] }, startsAt: { gt: now } }, orderBy: { startsAt: 'asc' }, take: 1 } },
      orderBy: { title: 'asc' },
    }),
    db.session.findMany({
      where: {
        status: { in: ['PUBLISHED', 'FULL'] },
        startsAt: { gte: from, lt: to, gt: now },
        course: { status: 'PUBLISHED', ...subjectWhere, deliveryType: deliveryType ?? { not: 'ELEARNING' } },
      },
      include: { course: { include: { subject: true } }, venue: true },
      orderBy: { startsAt: 'asc' },
    }),
  ]);
  // Only sessions that start inside the chosen UK month.
  const sessions = monthSessions.filter((s) => {
    const p = ukParts(s.startsAt);
    return p.y === y && p.m === m && s.course.deliveryType !== 'ELEARNING';
  });
  const left = await placesLeft(sessions);

  const courses = allCourses.filter((c) => !deliveryType || c.deliveryType === deliveryType);
  const countByType = (t?: DeliveryType) => allCourses.filter((c) => !t || c.deliveryType === t).length;

  const href = (p: Params) => {
    const merged: Params = { type: deliveryType, subject, view: view === 'courses' ? undefined : view, month: params.month, ...p };
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/courses?${s}` : '/courses';
  };
  const pill = (on: boolean) =>
    `inline-flex min-h-11 items-center rounded-full px-4 text-sm no-underline ${on ? 'border border-ink bg-ink font-bold text-white hover:text-white' : 'border border-hairline bg-white font-semibold text-ink'}`;
  const viewBtn = (on: boolean) =>
    `inline-flex min-h-11 items-center px-4 text-sm no-underline ${on ? 'bg-ink font-bold text-white hover:text-white' : 'bg-white font-semibold text-ink'}`;

  const month = monthName.format(new Date(Date.UTC(y, m - 1, 15)));
  const where = (s: (typeof sessions)[number]) =>
    s.course.deliveryType === 'IN_PERSON'
      ? s.venue ? `${s.venue.name}, ${s.venue.address.split(',').pop()?.trim()}` : 'Venue to be confirmed'
      : s.course.meetingPlatform === 'ZOOM' ? 'Zoom' : 'Microsoft Teams';
  const time = (s: (typeof sessions)[number]) => {
    const days = Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 86400000);
    return days >= 1 ? `${fmtTime(s.startsAt)}, ${days + 1} days` : `${fmtTime(s.startsAt)} to ${fmtTime(s.endsAt)}`;
  };
  const prev = shift(y, m, -1);
  const next = shift(y, m, 1);
  const count = `${courses.length} ${courses.length === 1 ? 'course' : 'courses'} · ${sessions.length} ${sessions.length === 1 ? 'date' : 'dates'} in ${month.split(' ')[0]}`;

  // Calendar grid: Monday-first weeks covering the month.
  const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cellCount = Math.ceil((firstDow + daysInMonth) / 7) * 7;
  const byDay = new Map<number, typeof sessions>();
  for (const s of sessions) {
    const d = ukParts(s.startsAt).d;
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }

  return (
    <>
      <div className="hero-motif px-4 pb-10 pt-12 md:px-20">
        <nav aria-label="Breadcrumb" className="mb-3 text-[13px] text-white/70">
          <Link href="/" className="text-white/80">Home</Link> / Courses
        </nav>
        <h1 className="mb-2.5 text-4xl font-extrabold tracking-tight text-white md:text-[44px]">Courses</h1>
        <p className="max-w-[760px] text-[17px] leading-relaxed text-white/80">Filter by how you want to learn, then pick a course or a date. eLearning starts the day you book.</p>
      </div>

      <div className="flex flex-col gap-3.5 border-b border-hairline bg-white px-4 py-5 md:px-20">
        <div role="group" aria-label="Delivery type" className="flex flex-wrap gap-2">
          <Link href={href({ type: undefined })} className={pill(!deliveryType)} aria-current={!deliveryType ? 'true' : undefined}>
            All delivery types<span className="ml-2 text-xs opacity-75">{countByType()}</span>
          </Link>
          {Object.values(DeliveryType).map((t) => (
            <Link key={t} href={href({ type: t })} className={pill(deliveryType === t)} aria-current={deliveryType === t ? 'true' : undefined}>
              {DELIVERY_LABEL[t]}<span className="ml-2 text-xs opacity-75">{countByType(t)}</span>
            </Link>
          ))}
        </div>
        <div role="group" aria-label="Subject" className="flex flex-wrap gap-2">
          <Link href={href({ subject: undefined })} className={pill(!subject)} aria-current={!subject ? 'true' : undefined}>All subjects</Link>
          {subjects.map((s) => (
            <Link key={s.id} href={href({ subject: s.slug })} className={pill(subject === s.slug)} aria-current={subject === s.slug ? 'true' : undefined}>{s.name}</Link>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 px-4 pb-16 pt-7 md:px-20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p aria-live="polite" className="text-[15px] font-bold text-ink">{count}</p>
          <div role="group" aria-label="View" className="inline-flex overflow-hidden rounded-control border border-field">
            <Link href={href({ view: undefined })} className={viewBtn(view === 'courses')} aria-current={view === 'courses' ? 'true' : undefined}>Courses</Link>
            <Link href={href({ view: 'dates' })} className={viewBtn(view === 'dates')} aria-current={view === 'dates' ? 'true' : undefined}>Dates</Link>
            <Link href={href({ view: 'calendar' })} className={viewBtn(view === 'calendar')} aria-current={view === 'calendar' ? 'true' : undefined}>Calendar</Link>
          </div>
        </div>

        {view !== 'courses' && (
          <div className="flex items-center justify-between gap-3">
            <Link href={href({ month: ym(prev.y, prev.m) })} aria-label="Previous month" className="inline-flex size-11 items-center justify-center rounded-control border border-field bg-white text-ink no-underline">←</Link>
            <h2 className="text-xl font-extrabold text-ink">{month}</h2>
            <Link href={href({ month: ym(next.y, next.m) })} aria-label="Next month" className="inline-flex size-11 items-center justify-center rounded-control border border-field bg-white text-ink no-underline">→</Link>
          </div>
        )}

        {view === 'courses' && courses.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {courses.map((c) => {
              const price = priceExVat(c.pricePence);
              const nextText = c.deliveryType === 'ELEARNING' ? 'Start any time' : c.sessions[0] ? `Next date: ${shortDay.format(c.sessions[0].startsAt).replace(',', '')}` : 'Dates coming soon';
              return (
                <Link key={c.id} href={`/courses/${c.slug}`} className="card-link flex flex-col overflow-hidden">
                  {c.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.photoUrl} alt={c.photoAlt ?? ''} className="h-[120px] w-full object-cover" />
                  ) : (
                    <div className="flex h-[120px] items-center justify-center bg-[#D9DBDF] text-xs font-bold uppercase tracking-[0.08em] text-slate">Course photo</div>
                  )}
                  <div className="flex flex-1 flex-col gap-2.5 p-5">
                    <div className="flex flex-wrap gap-1.5"><DeliveryChip type={c.deliveryType} /><Chip>{c.subject.name}</Chip></div>
                    <h3 className="text-lg font-extrabold leading-snug text-ink">{c.title}</h3>
                    <p className="flex-1 text-sm leading-relaxed">{c.shortDescription}</p>
                    <div className="flex items-baseline justify-between gap-3 border-t border-[#F0F1F3] pt-3">
                      <span className="text-[13px]">{c.durationText} · {nextText}</span>
                      <strong className="shrink-0 text-[17px] text-ink">{price.amount}</strong>
                    </div>
                    <span className="text-sm font-extrabold text-ink">See dates and book →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {view === 'dates' && sessions.length > 0 && (
          <section className="overflow-hidden rounded-card bg-white shadow-card">
            <ul>
              {sessions.map((s) => {
                const n = left.get(s.id) ?? 0;
                const full = n === 0 || s.status === 'FULL';
                const label = full ? { text: 'Full', low: true } : placesLabel(n, s.capacity, s.course.subject.placesLeftDisplay);
                const p = ukParts(s.startsAt);
                const price = priceExVat(s.course.pricePence);
                return (
                  <li key={s.id} className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-x-5 gap-y-3 border-b border-[#F0F1F3] px-5 py-[18px] last:border-0 md:grid-cols-[90px_minmax(0,1fr)_160px_130px_150px] md:px-6">
                    <div>
                      <p className="text-[13px]">{p.dow}</p>
                      <p className="text-2xl font-extrabold text-ink">{p.d} {month.slice(0, 3)}</p>
                    </div>
                    <div className="min-w-0">
                      <div className="mb-1.5"><DeliveryChip type={s.course.deliveryType} /></div>
                      <Link href={`/courses/${s.course.slug}`} className="text-base font-extrabold">{s.course.title}</Link>
                      <p className="mt-1 text-[13px]">{time(s)} UK time · {where(s)}</p>
                    </div>
                    <span className={`col-start-2 text-sm font-bold md:col-start-auto ${full ? 'text-bad-fg' : 'text-ink'}`}>{label?.text ?? 'Places available'}</span>
                    <strong className="col-start-2 text-base text-ink md:col-start-auto">{price.amount}</strong>
                    <Link
                      href={full ? `/courses/${s.course.slug}?waitlist=${s.id}#dates` : `/book/${s.id}`}
                      className="col-start-2 inline-flex min-h-11 items-center justify-center rounded-chip bg-cyan px-5 text-sm font-extrabold text-ink no-underline md:col-start-auto"
                    >
                      {full ? 'Join waitlist' : 'Book'}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {view === 'calendar' && (
          <section className="overflow-hidden rounded-card bg-white shadow-card">
            <div className="relative overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-7 border-b border-hairline bg-[#FAFAFA]">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                    <span key={d} className="p-2.5 text-xs font-extrabold uppercase tracking-[0.06em]">{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px bg-[#E6E6E6]">
                  {Array.from({ length: cellCount }, (_, i) => {
                    const day = i - firstDow + 1;
                    const inMonth = day >= 1 && day <= daysInMonth;
                    return (
                      <div key={i} className={`min-h-[104px] p-2 ${inMonth ? 'bg-white' : 'bg-page'}`}>
                        {inMonth && <p className="mb-1.5 text-[13px] font-bold text-ink">{day}</p>}
                        <div className="flex flex-col gap-1">
                          {(inMonth ? byDay.get(day) ?? [] : []).map((s) => {
                            const full = (left.get(s.id) ?? 0) === 0 || s.status === 'FULL';
                            const tone = s.course.deliveryType === 'IN_PERSON' ? 'bg-ink text-white hover:text-white' : 'bg-cyan-tint text-ink';
                            return (
                              <Link key={s.id} href={full ? `/courses/${s.course.slug}?waitlist=${s.id}#dates` : `/book/${s.id}`} className={`block rounded-chip px-1.5 py-1 text-[11px] font-bold leading-tight no-underline ${full ? 'bg-bad-bg text-bad-fg' : tone}`}>
                                {s.course.title}
                                <br />
                                <span className="font-semibold">{full ? 'Full' : fmtTime(s.startsAt)}</span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {deliveryType === 'ELEARNING' && (
          <p className="rounded-control bg-cyan-soft px-4 py-3.5 text-sm leading-relaxed text-ink">eLearning courses have no fixed date, so they only appear in the Courses view. Book and start any time.</p>
        )}

        {view === 'courses' && courses.length === 0 && (
          <div className="py-10 text-center">
            <p className="mb-4 text-base">No courses match these filters.</p>
            <Link href="/courses" className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-5 text-sm font-bold text-ink no-underline">Clear filters</Link>
          </div>
        )}
        {view === 'dates' && sessions.length === 0 && deliveryType !== 'ELEARNING' && (
          <div className="py-10 text-center">
            <p className="mb-4 text-base">No dates in {month} for these filters.</p>
            <Link href={href({ month: ym(next.y, next.m) })} className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-5 text-sm font-bold text-ink no-underline">Try {monthName.format(new Date(Date.UTC(next.y, next.m - 1, 15))).split(' ')[0]}</Link>
          </div>
        )}

        <div className="mt-3 flex flex-col gap-6 rounded-control bg-ink px-8 py-7 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="mb-1.5 text-[22px] font-extrabold text-white">Booking for your company?</h2>
            <p className="text-[15px] text-white/80">Open a credit account: book any course, pay one invoice at the end of the month.</p>
          </div>
          <Link href="/accounts/apply" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-chip bg-cyan px-[22px] text-sm font-bold text-ink no-underline">Apply for a credit account</Link>
        </div>
      </div>
    </>
  );
}
