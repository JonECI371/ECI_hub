import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { currentPerson } from '@/lib/auth';
import { placesLeft } from '@/lib/sessions';
import { checkoutProps } from '@/lib/checkout-props';
import { CheckoutForm } from '@/components/checkout-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Book your places', robots: { index: false } };

export default async function BookSession({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const session = await db.session.findUnique({ where: { id: sessionId }, include: { venue: true, course: { include: { subject: true } } } });
  if (!session || session.course.status !== 'PUBLISHED' || session.course.deliveryType === 'ELEARNING') notFound();
  const left = (await placesLeft([session])).get(session.id) ?? 0;
  const closed = session.status !== 'PUBLISHED' || session.startsAt <= new Date() || left === 0;
  if (closed || !session.course.pricePence) {
    return (
      <div className="flex flex-1 justify-center px-4 py-16">
        <section className="w-full max-w-[560px] rounded-card bg-white p-9 shadow-card">
          <h1 className="mb-3 text-[28px] font-extrabold text-ink">{!session.course.pricePence ? 'Contact us to book this course' : 'This date is full'}</h1>
          <p className="mb-6 leading-relaxed">{!session.course.pricePence ? 'This course does not have an online price yet. Get in touch and we will book you on.' : 'There are no places left on this date. Join the waitlist, or choose another date.'}</p>
          <Link href={!session.course.pricePence ? '/contact' : `/courses/${session.course.slug}?waitlist=${session.id}#dates`} className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-5 font-bold text-ink no-underline">{!session.course.pricePence ? 'Contact us' : 'See other dates'}</Link>
        </section>
      </div>
    );
  }
  return <CheckoutForm {...checkoutProps(session.course, session, left, await currentPerson())} />;
}
