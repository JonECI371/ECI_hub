import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { completePaidBooking } from '@/lib/booking-complete';
import { retrieveIntent, stripeEnabled } from '@/lib/integrations/payments';
import { SimplePage } from '@/components/simple-page';
import { checkoutBookingId } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payment', robots: { index: false } };

/** Stripe sends the customer back here after paying. The server checks the payment with Stripe itself. */
export default async function StripeReturn({ searchParams }: { searchParams: Promise<{ payment_intent?: string }> }) {
  const { payment_intent: piId } = await searchParams;
  const bid = await checkoutBookingId();
  if (!stripeEnabled() || !piId || !bid) redirect('/courses');
  const pi = await retrieveIntent(piId);
  if (pi.metadata.bookingId !== bid) redirect('/courses');
  if (pi.status === 'succeeded') {
    const b = await completePaidBooking(bid, pi.id);
    redirect(`/book/outcome?ref=${b.reference}`);
  }
  if (pi.status === 'processing') {
    const b = await db.booking.findUniqueOrThrow({ where: { id: bid } });
    return (
      <SimplePage eyebrow="Payment processing" title="Your bank is confirming the payment" actions={[['Check again', `/book/return?payment_intent=${pi.id}`], ['My bookings', '/account', true]]}>
        <p>This usually takes a few seconds. We email your confirmation for {b.reference} as soon as it clears.</p>
      </SimplePage>
    );
  }
  redirect('/book/outcome?state=failed');
}
