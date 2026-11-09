import Link from 'next/link';
import type { Metadata } from 'next';
import { fmtSessionDates, fmtTime } from '@/lib/format';
import { loadForRegistration } from '@/lib/registration';
import { questionSet } from '@/lib/registration-sets';
import { DeliveryChip, Chip } from '@/components/ui';
import { RegistrationForm } from '@/components/registration-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Registration', robots: { index: false } };

type Params = Promise<{ attendeeId: string }>;
type Search = Promise<{ t?: string; done?: string }>;

const dmy = (d: Date | null) => (d ? `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` : '');

export default async function RegisterPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { attendeeId } = await params;
  const { t, done } = await searchParams;
  const a = await loadForRegistration(attendeeId, t);

  if (!a || !a.person) {
    return (
      <div className="flex flex-1 justify-center px-4 py-16">
        <section className="w-full max-w-[560px] rounded-card bg-white p-9 shadow-card">
          <h1 className="mb-3 text-[28px] font-extrabold text-ink">This link has expired</h1>
          <p className="mb-6 leading-relaxed">Registration links last 60 days. Log in to complete your registration from your dashboard.</p>
          <Link href="/login" className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-5 font-bold text-ink no-underline">Log in</Link>
        </section>
      </div>
    );
  }

  const b = a.booking;
  const c = b.course;
  const set = questionSet(c.subject.registrationSet, c.deliveryType, c.subject.approvalRequired, c.subject.name);
  const scheme = (a.person.schemeIds ?? {}) as Record<string, string>;
  const answers = (a.registration?.answers ?? {}) as Record<string, string>;
  const prefill: Record<string, string> = {
    firstName: a.person.firstName,
    lastName: a.person.lastName === '-' ? '' : a.person.lastName,
    email: a.person.email,
    mobile: a.person.mobile ?? '',
    dob: dmy(a.person.dateOfBirth),
    employer: a.person.employer ?? b.account?.company ?? '',
    skillguard: scheme.skillguard ?? '',
    compexId: scheme.compex ?? '',
    eusrId: scheme.eusr ?? '',
    ...answers,
  };
  const filesOnFile = ['photo', 'photoId'].filter((k) => a.registration?.fileKeys.some((f) => f.includes(`/${k}/`)));
  const when = b.session
    ? `${fmtSessionDates(b.session.startsAt, b.session.endsAt)} · ${fmtTime(b.session.startsAt)} to ${fmtTime(b.session.endsAt)} UK time`
    : `Self-paced${c.daysToComplete ? ` · ${c.daysToComplete} days once your login arrives` : ''}`;

  const aside = (
    <aside aria-label="Your course" className="w-full overflow-hidden rounded-card bg-white shadow-card lg:sticky lg:top-6 lg:w-[360px] lg:shrink-0">
      <p className="bg-ink px-6 py-4 font-bold text-white">Your course</p>
      <div className="flex flex-col gap-3 p-6">
        <div className="flex flex-wrap gap-1.5"><DeliveryChip type={c.deliveryType} /><Chip>{c.subject.name}</Chip></div>
        <h3 className="text-lg font-bold text-ink">{c.title}</h3>
        <p className="text-sm">{when}</p>
        <p className="border-t border-hairline pt-3 text-sm"><span className="block text-xs font-bold uppercase tracking-[0.08em]">Booked by</span>{b.account?.company ?? `${b.booker.firstName} ${b.booker.lastName}`}</p>
        <p className="text-sm"><span className="block text-xs font-bold uppercase tracking-[0.08em]">Questions?</span>support@eci-hub.co.uk</p>
      </div>
    </aside>
  );

  if (done && a.registration) {
    const pending = a.registration.approval === 'PENDING';
    return (
      <>
        <div className="hero-motif px-4 pb-10 pt-12 md:px-20">
          <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-cyan">Registration complete</p>
          <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-white md:text-[44px]">Thanks {a.person.firstName}, you&apos;re all set</h1>
          <p className="text-[17px] text-white/80">{pending ? 'We check registrations for this course before the first day. We will email you once it is approved.' : 'Nothing else to do before the day.'}</p>
        </div>
        <div className="flex flex-col gap-8 px-4 py-10 md:px-20 lg:flex-row lg:items-start">
          <div className="flex flex-1 flex-col gap-6">
            <section className="rounded-card bg-white p-6 shadow-card md:p-8">
              <h2 className="mb-5 text-[22px] font-extrabold text-ink">What happens next</h2>
              <ol className="grid gap-5 md:grid-cols-3">
                {(c.deliveryType === 'ELEARNING'
                  ? [['We enrol you', 'Usually within 1 working day.'], ['Your login arrives', 'From the learning platform, by email.'], ['Your certificate', 'Recorded when you complete the course.']]
                  : c.deliveryType === 'VIRTUAL_CLASSROOM'
                    ? [['Join the session', `Use the ${c.meetingPlatform === 'ZOOM' ? 'Zoom' : 'Teams'} link in your calendar invite or on your dashboard.`], ['Reminders', 'The day before and an hour before.'], ['Your certificate', 'Uploaded to your dashboard after the course.']]
                    : [[pending ? 'Approval' : 'Joining instructions', pending ? 'We check your registration and send the venue address.' : 'The venue address is in your confirmation email.'], ['Reminders', 'The day before the course.'], ['Your certificate', 'Uploaded to your dashboard after the course.']]
                ).map(([h, d], i) => (
                  <li key={h}>
                    <p className="mb-2 text-xl font-bold text-cyan">{String(i + 1).padStart(2, '0')}</p>
                    <h3 className="mb-1 font-bold text-ink">{h}</h3>
                    <p className="text-sm leading-relaxed">{d}</p>
                  </li>
                ))}
              </ol>
            </section>
            <Link href="/account" className="inline-flex min-h-11 w-fit items-center rounded-chip bg-cyan px-5 font-bold text-ink no-underline">Go to my dashboard</Link>
          </div>
          {aside}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-8 px-4 pb-16 pt-8 md:px-20 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.1em] text-ink">Registration</p>
          <h1 className="mb-2 text-[32px] font-extrabold tracking-tight text-ink">{c.title}</h1>
          <p className="text-[15px]">About {set.minutes} minutes.{set.intro ? ` ${set.intro}` : ''}</p>
          <p className="mt-1 text-[15px]">We&apos;ve filled in what we already know. Check it and add the rest. Everything is required unless it says optional.</p>
          {a.registration && <p className="mt-3 rounded-control bg-cyan-soft px-4 py-3 text-sm text-ink">You have already registered. You can update your answers and submit again.</p>}
        </div>
        <RegistrationForm attendeeId={a.id} token={t ?? ''} set={set} prefill={prefill} filesOnFile={filesOnFile} />
      </div>
      {aside}
    </div>
  );
}
