'use server';

import { db } from '@/lib/db';
import { currentPerson } from '@/lib/auth';
import { checkoutBookingId } from '../actions';
import { DelegateError, saveDelegate } from '@/lib/delegate-details';

export type DelegateState = { ok?: boolean; message?: string; fields?: Record<string, string> };

/** Saves one delegate row on the Delegate details page. Only the person who made the booking may do this. */
export async function saveDelegateAction(_prev: DelegateState, form: FormData): Promise<DelegateState> {
  const bookingId = String(form.get('bookingId') ?? '');
  const b = await db.booking.findUnique({ where: { id: bookingId }, select: { id: true, bookerId: true } });
  const me = await currentPerson();
  const bid = await checkoutBookingId();
  if (!b || !(b.bookerId === me?.id || b.id === bid)) return { message: 'Please log in as the person who made this booking.' };
  const get = (k: string) => String(form.get(k) ?? '');
  try {
    const r = await saveDelegate(b.bookerId, b.id, {
      attendeeId: get('attendeeId'),
      mode: get('mode') === 'link' ? 'link' : 'now',
      firstName: get('first'), lastName: get('last'), email: get('email'),
      dob: { d: get('dobD'), m: get('dobM'), y: get('dobY') },
      mobile: get('phone'), skillguard: get('skillguard'), invoiceRef: get('invoiceRef'),
      authority: get('authority') === 'on',
    });
    return { ok: true, message: r.mode === 'link' ? 'Link sent. They can add their own details from the email.' : 'Saved. We have emailed them a copy to check.' };
  } catch (e) {
    if (e instanceof DelegateError) return { message: e.message, fields: e.fields };
    throw e;
  }
}
