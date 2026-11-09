'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { SITE_URL } from '@/lib/format';
import { sign } from '@/lib/auth';
import { CheckoutError, createPendingBooking, findOrCreatePerson, splitName } from '@/lib/booking';
import { joinWaitlist } from '@/lib/waitlist';

export async function joinWaitlistAction(form: FormData) {
  const sessionId = String(form.get('sessionId'));
  const name = z.string().trim().min(1).max(80).safeParse(form.get('name'));
  const email = z.string().trim().toLowerCase().email().safeParse(form.get('email'));
  const places = Math.max(1, Math.min(20, Number(form.get('places')) || 1));
  if (!name.success || !email.success) redirect(`/waitlist/${sessionId}?error=1`);
  const s = await db.session.findUnique({ where: { id: sessionId } });
  if (!s || s.startsAt <= new Date()) redirect('/courses');
  const person = await db.$transaction((tx) => findOrCreatePerson(tx, { email: email.data!, ...splitName(name.data!) }));
  const e = await joinWaitlist(sessionId, person.id, places);
  redirect(`/waitlist/${sessionId}?w=${encodeURIComponent(sign({ eid: e.id, exp: Date.now() + 3600000 }))}`);
}

/** One step from the email link: hold the offered places as a booking, then pay. */
export async function claimOffer(form: FormData) {
  const token = String(form.get('token'));
  const e = await db.waitlistEntry.findUnique({ where: { offerToken: token }, include: { person: true, session: true } });
  if (!e || !e.offerExpiresAt || e.offerExpiresAt <= new Date()) redirect(`/waitlist/claim/${token}`);
  let bid: string;
  try {
    const b = await createPendingBooking({
      courseId: e.session.courseId, sessionId: e.sessionId, places: e.places, waitlistEntryId: e.id,
      booker: { firstName: e.person.firstName, lastName: e.person.lastName, email: e.person.email, mobile: e.person.mobile ?? '', marketingOptIn: e.person.marketingOptIn },
      bookerAttends: true, others: null,
    });
    bid = b.id;
  } catch (err) {
    if (err instanceof CheckoutError) redirect(`/waitlist/claim/${token}?error=1`);
    throw err;
  }
  (await cookies()).set('eci_checkout', sign({ bid, exp: Date.now() + 24 * 3600000 }), { httpOnly: true, sameSite: 'lax', path: '/book', secure: SITE_URL.startsWith('https://') });
  redirect('/book/pay');
}

export async function declineOffer(form: FormData) {
  const token = String(form.get('token'));
  const e = await db.waitlistEntry.findUnique({ where: { offerToken: token } });
  if (e) {
    await db.waitlistEntry.delete({ where: { id: e.id } });
    await db.auditLog.create({ data: { actorId: e.personId, action: 'WAITLIST_OFFER_DECLINED', recordType: 'Session', recordId: e.sessionId } });
    const { offerFreedPlaces } = await import('@/lib/waitlist');
    await offerFreedPlaces(e.sessionId);
  }
  redirect('/courses?msg=declined');
}
