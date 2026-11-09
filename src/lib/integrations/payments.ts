import 'server-only';
import Stripe from 'stripe';
import { db } from '@/lib/db';

/**
 * Card payments through Stripe (Payment Element). PAYMENTS_MODE=stripe switches it on;
 * otherwise the test-mode buttons stand in. Keys: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY,
 * STRIPE_WEBHOOK_SECRET (webhook is a backup; the return page confirms too).
 * Every failure that needs a person creates an INTEGRATION_FAILURE task.
 */
export const stripeEnabled = () => process.env.PAYMENTS_MODE === 'stripe' && !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PUBLISHABLE_KEY;
export const publishableKey = () => process.env.STRIPE_PUBLISHABLE_KEY ?? '';

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY!, { maxNetworkRetries: 2, appInfo: { name: 'ECI-Hub booking platform' } });
  return client;
}

/** One PaymentIntent per booking; asking again returns the same one (idempotent). */
export async function paymentIntentFor(booking: { id: string; reference: string; totalPence: number; booker: { email: string } }): Promise<string> {
  const existing = await db.payment.findFirst({ where: { bookingId: booking.id, stripeIntentId: { startsWith: 'pi_' } }, orderBy: { createdAt: 'desc' } });
  if (existing) {
    const pi = await stripe().paymentIntents.retrieve(existing.stripeIntentId);
    if (pi.amount === booking.totalPence && pi.status !== 'canceled' && pi.client_secret) return pi.client_secret;
  }
  const pi = await stripe().paymentIntents.create(
    {
      amount: booking.totalPence,
      currency: 'gbp',
      automatic_payment_methods: { enabled: true },
      receipt_email: booking.booker.email,
      description: `ECI-Hub booking ${booking.reference}`,
      metadata: { bookingId: booking.id, reference: booking.reference },
    },
    { idempotencyKey: `booking-${booking.id}-${booking.totalPence}` },
  );
  await db.payment.upsert({
    where: { stripeIntentId: pi.id },
    update: {},
    create: { bookingId: booking.id, stripeIntentId: pi.id, amountPence: pi.amount, status: pi.status },
  });
  return pi.client_secret!;
}

export async function retrieveIntent(id: string) {
  return stripe().paymentIntents.retrieve(id);
}

/** Full or partial refund of a booking's card payment. Records it, or raises a task if Stripe refuses. */
export async function refundBooking(bookingId: string, amountPence?: number): Promise<void> {
  const payments = await db.payment.findMany({ where: { bookingId, status: 'succeeded', stripeIntentId: { startsWith: 'pi_' } } });
  for (const p of payments) {
    const amount = Math.min(amountPence ?? p.amountPence, p.amountPence - p.refundedPence);
    if (amount <= 0) continue;
    try {
      await stripe().refunds.create({ payment_intent: p.stripeIntentId, amount }, { idempotencyKey: `refund-${p.id}-${amount}-${p.refundedPence}` });
      await db.payment.update({ where: { id: p.id }, data: { refundedPence: p.refundedPence + amount, status: amount + p.refundedPence >= p.amountPence ? 'refunded' : 'partially_refunded' } });
    } catch (err) {
      await db.task.create({ data: { type: 'INTEGRATION_FAILURE', title: 'Stripe refund failed', detail: `${(err as Error).message}`.slice(0, 500), recordType: 'Booking', recordId: bookingId } });
    }
  }
}
