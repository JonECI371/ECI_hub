import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { EnquiryForm } from '@/components/enquiry-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Contact us', description: 'Training for a team, on-site delivery or EC&I safety consultancy. One form, routed to the right person.', alternates: { canonical: '/contact' } };

export default async function Contact({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const courses = await db.course.findMany({ where: { status: 'PUBLISHED' }, select: { title: true }, orderBy: { title: 'asc' } });
  return (
    <>
      <div className="hero-motif px-4 pb-10 pt-12 md:px-20">
        <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-cyan">Contact us</p>
        <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-white md:text-[44px]">Talk to us</h1>
        <p className="max-w-[720px] text-[17px] leading-relaxed text-white/80">Training for a team, on-site delivery or consultancy. One form, and we route it to the right person.</p>
      </div>
      <div className="flex flex-col gap-8 px-4 py-10 md:px-20 lg:flex-row lg:items-start">
        <div className="relative min-w-0 flex-1"><EnquiryForm courses={courses.map((c) => c.title)} initialTopic={topic ?? 'team'} /></div>
        <aside className="flex w-full flex-col gap-4 rounded-card bg-white p-6 shadow-card lg:w-[340px]">
          <h2 className="text-lg font-extrabold text-ink">What happens next</h2>
          <p className="text-sm leading-relaxed">We reply within one working day, usually by phone, to talk through what you need.</p>
          <h2 className="mt-2 text-lg font-extrabold text-ink">Prefer to talk?</h2>
          <p className="text-sm"><span className="block font-bold text-ink">+44 (0) 1932 963463</span>support@eci-hub.co.uk</p>
          <p className="text-sm">Summit House, 33 Hanworth Road,<br />Sunbury-on-Thames TW16 5DA</p>
        </aside>
      </div>
    </>
  );
}
