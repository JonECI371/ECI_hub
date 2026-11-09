import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { currentPerson } from '@/lib/auth';
import { checkoutProps } from '@/lib/checkout-props';
import { CheckoutForm } from '@/components/checkout-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Book your places', robots: { index: false } };

/** eLearning: no date, book any time. */
export default async function BookCourse({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await db.course.findFirst({ where: { slug, status: 'PUBLISHED' }, include: { subject: true } });
  if (!course) notFound();
  if (course.deliveryType !== 'ELEARNING') redirect(`/courses/${course.slug}#dates`);
  if (!course.pricePence) redirect('/contact');
  return <CheckoutForm {...checkoutProps(course, null, null, await currentPerson())} />;
}
