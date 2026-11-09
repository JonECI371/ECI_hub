'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { SITE_URL } from '@/lib/format';
import { sign, verify } from '@/lib/auth';
import { CheckoutError, MAX_PLACES, createPendingBooking, holdLive } from '@/lib/booking';
import { completePaidBooking } from '@/lib/booking-complete';
import { stripeEnabled } from '@/lib/integrations/payments';

export type CheckoutState = { error?: string; fields?: Record<string, string>; values?: Record<string, string> };
type CheckoutCookie = { bid: string; exp: number };
const COOKIE = 'eci_checkout';

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
const name = z.string().trim().min(1, 'Enter a name').max(80);

export async function startCheckout(_prev: CheckoutState, form: FormData): Promise<CheckoutState> {
  const fields: Record<string, string> = {};
  const get = (k: string) => String(form.get(k) ?? '');
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string' && !k.startsWith('$')) values[k] = v;
  const places = Number(get('places'));
  const mode = get('mode') === 'later' ? 'later' : 'now';
  const bookerAttends = get('bookerAttends') === 'on';
  const courseId = get('courseId');
  const sessionId = get('sessionId') || null;

  if (!Number.isInteger(places) || places < 1 || places > MAX_PLACES) return { error: 'Choose between 1 and 20 places.', values };

  const checks: [string, z.ZodTypeAny, string][] = [
    ['firstName', name, get('firstName')],
    ['lastName', name, get('lastName')],
    ['email', email, get('email')],
  ];
  const othersCount = places - (bookerAttends ? 1 : 0);
  const others: { name: string; email: string }[] = [];
  if (mode === 'now') {
    for (let i = 0; i < othersCount; i++) {
      checks.push([`other_name_${i}`, name, get(`other_name_${i}`)], [`other_email_${i}`, email, get(`other_email_${i}`)]);
      others.push({ name: get(`other_name_${i}`), email: get(`other_email_${i}`) });
    }
  }
  for (const [k, schema, v] of checks) {
    const r = schema.safeParse(v);
    if (!r.success) fields[k] = r.error.issues[0].message;
  }
  if (get('terms') !== 'on') fields.terms = 'Accept the Terms & Conditions to continue';
  if (get('needsWaiver') === '1' && get('waiver') !== 'on') fields.waiver = 'Tick this box so the course can go ahead within your cancellation period';
  if (Object.keys(fields).length) return { error: 'Check the highlighted fields.', fields, values };

  let bookingId: string;
  try {
    const b = await createPendingBooking({
      courseId,
      sessionId,
      places,
      booker: { firstName: get('firstName'), lastName: get('lastName'), email: get('email'), mobile: get('mobile'), marketingOptIn: get('marketing') === 'on' },
      bookerAttends,
      others: mode === 'now' ? others : null,
    });
    bookingId = b.id;
  } catch (e) {
    if (e instanceof CheckoutError) return { error: e.message, values };
    throw e;
  }
  (await cookies()).set(COOKIE, sign({ bid: bookingId, exp: Date.now() + 24 * 3600000 }), {
    httpOnly: true, sameSite: 'lax', path: '/book', secure: SITE_URL.startsWith('https://'),
  });
  redirect('/book/pay');
}

/** The booking this browser is checking out, if any. */
export async function checkoutBookingId(): Promise<string | null> {
  return verify<CheckoutCookie>((await cookies()).get(COOKIE)?.value)?.bid ?? null;
}

/**
 * Stand-in for Stripe while testing: confirms or fails the payment without taking money.
 * Disabled when PAYMENTS_MODE=stripe.
 */
export async function testPayment(form: FormData) {
  if (stripeEnabled()) throw new Error('Test payments are switched off.');
  const bid = await checkoutBookingId();
  if (!bid) redirect('/book/outcome?state=expired');
  const b = await db.booking.findUniqueOrThrow({ where: { id: bid } });
  if (b.status === 'CONFIRMED') redirect(`/book/outcome?ref=${b.reference}`);
  if (!holdLive(b)) redirect('/book/outcome?state=expired');
  if (form.get('result') === 'fail') redirect('/book/outcome?state=failed');
  await completePaidBooking(b.id, `test_${b.reference}_${Date.now()}`);
  redirect(`/book/outcome?ref=${b.reference}`);
}

