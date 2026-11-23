import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { currentPerson } from '@/lib/auth';
import { checkoutProps } from '@/lib/checkout-props';
import { bookingAccount } from '@/lib/credit';
import { loadPolicy } from '@/lib/cancellation-policy';
import { CheckoutForm } from '@/components/checkout-form';
import { Breadcrumbs } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Book your places', robots: { index: false } };

/** eLearning: no date, book any time. */
export default async function BookCourse({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await db.course.findFirst({ where: { slug, status: 'PUBLISHED' }, include: { subject: true } });
  if (!course) notFound();
  if (course.deliveryType !== 'ELEARNING') redirect(`/courses/${course.slug}#dates`);
  if (!course.pricePence) redirect('/contact');
  const me = await currentPerson();
  return (
    <>
      <Breadcrumbs className="px-4 pt-6 md:px-[max(4.1667%,calc((100%_-_1536px)/2))]" items={[['Home', '/'], ['Courses', '/courses'], [course.title, `/courses/${course.slug}`], ['Book']]} />
      <CheckoutForm {...checkoutProps(course, null, null, me, me ? await bookingAccount(me.id) : null, await loadPolicy())} />
    </>
  );
}
