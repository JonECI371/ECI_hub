import { NextResponse } from 'next/server';
import { completePaidBooking } from '@/lib/booking-complete';
import { stripe, stripeEnabled } from '@/lib/integrations/payments';

export const dynamic = 'force-dynamic';

/** Backup to the return page: confirms bookings even if the customer closed the browser after paying. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeEnabled() || !secret) return NextResponse.json({ ok: false }, { status: 404 });
  const sig = req.headers.get('stripe-signature') ?? '';
  let event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), sig, secret);
  } catch {
    return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  }
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    if (pi.metadata?.bookingId) await completePaidBooking(pi.metadata.bookingId, pi.id);
  }
  return NextResponse.json({ received: true });
}
