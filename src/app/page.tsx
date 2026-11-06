import Link from 'next/link';
import { db } from '@/lib/db';
import { fmtSessionDates, priceExVat } from '@/lib/format';
import { placesLeft, placesLabel } from '@/lib/sessions';
import { DeliveryChip, Chip, Eyebrow } from '@/components/ui';
import { CourseSearch } from '@/components/course-search';

// Next dates and courses come from the database on every request.
export const dynamic = 'force-dynamic';

const DISCIPLINES = [
  ['Hazardous area', 'CompEx ExA, ExF, Ex12 and Ex14. Awareness through to design and duty holder responsibilities.', '/courses?subject=compex'],
  ['DSEAR compliance', 'Awareness training, risk assessment and verification against DSEAR and the ATEX directives.', '/courses?subject=dsear'],
  ['Process safety', 'Cogent accredited awareness, foundation, operations and leadership programmes.', '/courses?subject=process-safety'],
  ['Functional safety', 'Foundation through to SIL determination and verification under IEC 61511.', '/contact'],
  ['Water and utilities', 'EUSR National Water Hygiene, CAT and Genny, safety passports and SHEA Water.', '/courses?subject=eusr'],
] as const;

const CONSULTANCY = [
  ['Hazardous area classification', 'Zone drawings, area classification reports and equipment schedules to BS EN 60079-10.'],
  ['DSEAR risk assessment', 'Assessment, action planning and the documented evidence your regulator expects to see.'],
  ['Functional safety and SIL', 'SIL determination, verification and safety requirement specifications under IEC 61511.'],
  ['EC and I design assurance', 'Independent review of electrical, control and instrumentation design on capital projects.'],
] as const;

const SECTORS = [
  ['Chemical and COMAH', 'Upper and lower tier sites, safety reports and competence evidence.'],
  ['Oil and gas', 'Terminals, refineries and downstream distribution.'],
  ['Water and utilities', 'Treatment works, sludge digestion and network operations.'],
  ['Pharma and food', 'Solvent handling, dust hazards and combustible powders.'],
] as const;

// TODO(Jon): replace the [NUMBER] placeholders with real figures before go-live.
const STATS = [
  ['[NUMBER]+', 'Delegates trained'],
  ['[NUMBER]%', 'Positive delegate feedback'],
  ['20 yrs', 'EC and I safety experience'],
  ['[NUMBER]', 'COMAH sites supported'],
] as const;

// TODO(Jon): real quotes from course evaluations, tagged to the course.
const QUOTES = [
  ['[DELEGATE QUOTE. Pull real feedback from your course evaluations, tagged to the course it relates to.]', 'CompEx ExF'],
  ['[DELEGATE QUOTE]', 'EUSR NWH'],
  ['[DELEGATE QUOTE]', 'DSEAR Awareness'],
] as const;

const PARTNERS = ['CompEx', 'EUSR', 'Cogent Skills', 'Trainor', 'Achilles UVDB'];

const H2 = 'text-3xl font-bold tracking-tight text-ink md:text-[38px] md:leading-tight';
const SECTION = 'px-4 py-14 md:px-20 md:py-20';

export default async function Home() {
  const now = new Date();
  const [sessions, courses, subjects] = await Promise.all([
    db.session.findMany({
      where: { status: 'PUBLISHED', startsAt: { gt: now }, course: { status: 'PUBLISHED' } },
      include: { course: { include: { subject: true } } },
      orderBy: { startsAt: 'asc' },
      take: 12,
    }),
    db.course.findMany({ where: { status: 'PUBLISHED' }, include: { subject: true }, orderBy: { title: 'asc' }, take: 6 }),
    db.subject.findMany({ where: { live: true }, orderBy: { name: 'asc' } }),
  ]);
  const left = await placesLeft(sessions);
  const nextDates = sessions.filter((s) => (left.get(s.id) ?? 0) > 0).slice(0, 3);

  return (
    <>
      {/* Hero: thesis, search and live next dates */}
      <section className="hero-motif flex flex-col gap-12 px-4 pb-16 pt-14 md:px-20 md:pb-[72px] md:pt-[88px] lg:flex-row lg:items-start lg:gap-16">
        <div className="max-w-[620px] flex-1">
          <p className="mb-5 text-[13px] font-semibold uppercase tracking-[0.08em] text-cyan">EC and I safety engineering</p>
          <h1 className="mb-6 text-4xl font-extrabold leading-[1.08] tracking-tight text-white [text-wrap:balance] md:text-[58px]">Stories that stay with you, skills that protect</h1>
          <p className="mb-9 text-[17px] leading-[1.7] text-white/70">Accredited training and specialist high hazard Process Industries | COMAH, Chemical, Oil and Gas, and Water and Waste Treatment. Delivered by engineers who have worked on them.</p>
          <div className="flex flex-wrap gap-3.5">
            <Link href="/courses" className="inline-flex min-h-[52px] items-center rounded-chip bg-cyan px-[30px] text-[15px] font-semibold text-ink no-underline">View all courses</Link>
            <Link href="/contact" className="inline-flex min-h-[52px] items-center rounded-chip border border-white/30 px-[30px] text-[15px] font-medium text-white no-underline hover:text-white">Speak to a consultant</Link>
          </div>
          <CourseSearch />
        </div>
        <div className="w-full rounded-control bg-slate p-8 lg:w-[380px] lg:shrink-0">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.08em] text-cyan">Next available dates</p>
          {nextDates.length === 0 ? (
            <p className="text-sm text-white/70">New dates are being scheduled. <Link href="/contact" className="text-white">Ask us about dates</Link></p>
          ) : (
            <ul className="flex flex-col gap-px bg-white/10">
              {nextDates.map((s) => {
                const label = placesLabel(left.get(s.id) ?? 0, s.capacity, s.course.subject.placesLeftDisplay);
                return (
                  <li key={s.id} className="bg-slate">
                    <Link href={`/courses/${s.course.slug}`} className="flex items-center justify-between gap-4 py-3.5 no-underline">
                      <span>
                        <span className="block text-sm font-semibold text-white">{s.course.title}</span>
                        <span className="mt-1 block text-xs text-white/60">{fmtSessionDates(s.startsAt, s.endsAt)}</span>
                      </span>
                      {label && <span className={`shrink-0 text-[13px] ${label.low ? 'font-semibold text-cyan' : 'text-white/60'}`}>{label.text}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/courses" className="mt-5 block text-[13px] font-semibold text-cyan no-underline">See the full calendar →</Link>
        </div>
      </section>

      {/* The two ways to book */}
      <section className="border-b border-hairline bg-white px-4 py-10 md:px-20">
        <Eyebrow>Ready to book?</Eyebrow>
        <div className="grid gap-px border border-hairline bg-hairline md:grid-cols-2">
          <Link href="/courses" className="block bg-white px-6 py-[26px] no-underline hover:bg-page">
            <h3 className="mb-2 text-[19px] font-bold text-ink">Book a course</h3>
            <p className="mb-4 text-sm leading-relaxed text-slate">For yourself or your team. Pay by card, Apple Pay or Google Pay. Your account is set up as you book.</p>
            <span className="text-[13px] font-semibold text-ink underline decoration-cyan decoration-2 underline-offset-[3px]">Choose a course →</span>
          </Link>
          <Link href="/accounts/apply" className="block bg-white px-6 py-[26px] no-underline hover:bg-page">
            <h3 className="mb-2 text-[19px] font-bold text-ink">Open a credit account</h3>
            <p className="mb-4 text-sm leading-relaxed text-slate">Book any course for your team and pay one invoice at the end of each month.</p>
            <span className="text-[13px] font-semibold text-ink underline decoration-cyan decoration-2 underline-offset-[3px]">Apply for an account →</span>
          </Link>
        </div>
      </section>

      {/* Accreditation partners */}
      <section className="flex flex-col gap-4 bg-[#E6E6E6] px-4 py-[26px] md:flex-row md:items-center md:justify-between md:px-20">
        <span className="text-[13px] text-slate">Accredited and delivered in partnership with</span>
        <ul className="flex flex-wrap gap-2.5">
          {PARTNERS.map((p) => (
            <li key={p} className="rounded-chip border border-hairline bg-white px-[18px] py-[9px] text-xs font-semibold text-slate">{p}</li>
          ))}
        </ul>
      </section>

      {/* What we do */}
      <section id="training" className={`bg-page ${SECTION}`}>
        <Eyebrow>What we do</Eyebrow>
        <h2 className={`mb-3 ${H2}`}>Five disciplines, one competence framework</h2>
        <p className="mb-10 max-w-[620px] text-base leading-[1.7]">From awareness through to assessed competence and duty holder level, mapped so your team can see where they are and what comes next.</p>
        <div className="grid gap-px border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
          {DISCIPLINES.map(([title, text, href], i) => (
            <div key={title} className="bg-white px-[30px] py-8">
              <p className="mb-[18px] text-[28px] font-bold text-cyan">{String(i + 1).padStart(2, '0')}</p>
              <h3 className="mb-2.5 text-xl font-bold text-ink">{title}</h3>
              <p className="mb-5 text-sm leading-[1.7]">{text}</p>
              <Link href={href} className="text-[13px] font-semibold">Explore training →</Link>
            </div>
          ))}
          <div className="flex flex-col justify-center bg-ink px-[30px] py-8">
            <h3 className="mb-2.5 text-xl font-bold text-white">Not sure what your team needs?</h3>
            <p className="mb-5 text-sm leading-[1.7] text-white/70">We will map your roles against the competence framework and tell you where the gaps are.</p>
            <Link href="/contact" className="text-[13px] font-semibold text-cyan hover:text-white">Request a gap analysis →</Link>
          </div>
        </div>
      </section>

      {/* Figures */}
      <section className="bg-slate px-4 py-14 md:px-20">
        <dl className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {STATS.map(([value, label]) => (
            <div key={label} className="flex flex-col-reverse">
              <dt className="text-sm text-white/70">{label}</dt>
              <dd className="mb-1.5 text-3xl font-bold tracking-tight text-cyan md:text-[40px]">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Consultancy */}
      <section id="consultancy" className={`bg-page ${SECTION}`}>
        <Eyebrow>Consultancy</Eyebrow>
        <h2 className={`mb-10 ${H2}`}>Specialist support beyond the classroom</h2>
        <div className="grid gap-px border border-hairline bg-hairline md:grid-cols-2">
          {CONSULTANCY.map(([title, text]) => (
            <div key={title} className="bg-white p-[30px]">
              <h3 className="mb-2 text-[19px] font-bold text-ink">{title}</h3>
              <p className="mb-4 text-sm leading-[1.7]">{text}</p>
              <Link href="/contact" className="text-[13px] font-semibold">Discuss a project →</Link>
            </div>
          ))}
        </div>
      </section>

      {/* Sectors */}
      <section id="sectors" className={`bg-white ${SECTION}`}>
        <Eyebrow>Sectors we serve</Eyebrow>
        <h2 className={`mb-10 ${H2}`}>The same hazard, four different languages</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SECTORS.map(([title, text], i) => (
            <div key={title} className="min-h-[180px] rounded-control bg-ink px-[26px] py-[30px]">
              <p className="mb-3.5 text-[22px] font-bold text-cyan">{String(i + 1).padStart(2, '0')}</p>
              <h3 className="mb-2 text-lg font-bold text-white">{title}</h3>
              <p className="text-[13px] leading-relaxed text-white/70">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Delegate feedback */}
      <section className={`bg-[#E6E6E6] ${SECTION}`}>
        <Eyebrow>What delegates say</Eyebrow>
        <h2 className={`mb-10 ${H2}`}>Feedback from the last 12 months</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {QUOTES.map(([quote, course], i) => (
            <figure key={i} className="rounded-control bg-white p-7">
              <blockquote className="mb-5 text-[15px] leading-[1.7] text-ink">{quote}</blockquote>
              <figcaption>
                <p className="text-[13px] font-semibold text-ink">[NAME]</p>
                <p className="mt-0.5 text-xs">[ROLE], [COMPANY] · {course}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* On-site delivery */}
      <section id="contact" className="flex flex-col gap-8 bg-ink px-4 py-14 md:flex-row md:items-center md:justify-between md:gap-[60px] md:px-20 md:py-[72px]">
        <div className="max-w-[620px]">
          <h2 className="mb-3.5 text-[28px] font-bold tracking-tight text-white md:text-[34px]">Training twelve people or more?</h2>
          <p className="text-base leading-[1.7] text-white/70">On-site delivery at your own plant, tailored to your processes and hazards. Usually cheaper than sending everyone away, and the examples are yours.</p>
        </div>
        <Link href="/contact" className="inline-flex min-h-[52px] items-center justify-center whitespace-nowrap rounded-chip bg-cyan px-[34px] text-[15px] font-semibold text-ink no-underline">Request a quote</Link>
      </section>

      {/* Open courses */}
      <section className={`bg-white ${SECTION}`}>
        <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Eyebrow>Scheduled courses</Eyebrow>
            <h2 className={H2}>Book an open course</h2>
          </div>
          <nav aria-label="Course subjects" className="flex flex-wrap gap-2">
            <Link href="/courses" className="inline-flex min-h-11 items-center rounded-chip bg-ink px-[18px] text-[13px] font-medium text-white no-underline hover:text-white">All</Link>
            {subjects.map((s) => (
              <Link key={s.id} href={`/courses?subject=${s.slug}`} className="inline-flex min-h-11 items-center rounded-chip border border-hairline px-[18px] text-[13px] text-slate no-underline">{s.name}</Link>
            ))}
            <Link href="/courses?type=ELEARNING" className="inline-flex min-h-11 items-center rounded-chip border border-hairline px-[18px] text-[13px] text-slate no-underline">eLearning</Link>
          </nav>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => {
            const price = priceExVat(c.pricePence);
            return (
              <Link key={c.id} href={`/courses/${c.slug}`} className="card-link flex flex-col overflow-hidden">
                <div className="h-1.5 bg-ink" />
                <div className="flex flex-1 flex-col px-6 py-[26px]">
                  <div className="mb-3.5 flex flex-wrap gap-1.5"><Chip>{c.subject.name}</Chip><DeliveryChip type={c.deliveryType} /></div>
                  <h3 className="mb-2 text-[19px] font-bold text-ink">{c.title}</h3>
                  <p className="mb-[18px] flex-1 text-sm leading-relaxed">{c.shortDescription}</p>
                  <div className="flex items-baseline justify-between border-t border-hairline pt-4 text-[13px]">
                    <span>{c.durationText}</span>
                    <span className="text-base font-bold text-ink">{price.amount}{price.vatNote && <span className="ml-1 text-xs font-normal text-slate">+ VAT</span>}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        <p className="mt-8"><Link href="/courses" className="text-sm font-semibold">See all courses and dates →</Link></p>
      </section>
    </>
  );
}
