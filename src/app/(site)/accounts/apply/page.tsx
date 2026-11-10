import type { Metadata } from 'next';
import { AccountApplicationForm } from '@/components/account-application-form';
import { INDUSTRIES } from '@/lib/accounts';

export const metadata: Metadata = {
  title: 'Apply for a credit account',
  description: 'Book any ECI-Hub course for your team and pay one invoice at the end of each month. Apply in about 5 minutes.',
  alternates: { canonical: '/accounts/apply' },
};

const STEPS: [string, string][] = [
  ['Apply', 'About 5 minutes. Have your company number and accounts contact ready.'],
  ['We check', 'Companies House and a credit check, usually within 1 working day.'],
  ['Start booking', 'Your bookers get a sign-in link and can book any course on account.'],
];

export default function Apply() {
  return (
    <>
      <div className="hero-motif px-4 pb-10 pt-12 md:px-20">
        <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-cyan">For companies</p>
        <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-white md:text-[44px]">Apply for a credit account</h1>
        <p className="max-w-[720px] text-[17px] leading-relaxed text-white/80">Book any course for your team and pay one invoice at the end of each month.</p>
      </div>
      <div className="flex flex-col gap-8 px-4 py-10 md:px-20 lg:flex-row lg:items-start">
        <div className="relative min-w-0 flex-1"><AccountApplicationForm industries={INDUSTRIES} /></div>
        <aside className="flex w-full flex-col gap-4 rounded-card bg-white p-6 shadow-card lg:sticky lg:top-6 lg:w-[340px]">
          <h2 className="text-lg font-extrabold text-ink">How it works</h2>
          <ol className="flex flex-col gap-4">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex gap-3 text-sm"><span className="text-base font-extrabold text-ink">0{i + 1}</span><span><strong className="block text-ink">{t}</strong>{d}</span></li>
            ))}
          </ol>
          <p className="border-t border-hairline pt-4 text-sm">Questions? Call <span className="font-bold text-ink">+44 (0) 1932 963463</span>.</p>
        </aside>
      </div>
    </>
  );
}
