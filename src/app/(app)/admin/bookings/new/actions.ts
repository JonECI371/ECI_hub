'use server';

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { CheckoutError } from '@/lib/booking';
import { parsePoValue } from '@/lib/purchase-orders';
import { AdminWarnings, createAdminBooking, type AdminWarning } from '@/lib/admin-booking';

export type AdminBookingState = { error?: string; warnings?: AdminWarning[]; values?: Record<string, string> };

export async function addBooking(_prev: AdminBookingState, form: FormData): Promise<AdminBookingState> {
  const me = await requireAdmin('/admin/bookings/new');
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string' && !k.startsWith('$')) values[k] = v;
  const get = (k: string) => (values[k] ?? '').trim();

  const email = get('email').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Enter the booker\'s email address.', values };
  const existing = await db.person.findUnique({ where: { email } });
  if (!existing && (!get('firstName') || !get('lastName'))) return { error: 'We do not have that email yet. Enter their first and last name to add them.', values };

  const [courseId, sessionId] = get('slot').split('|');
  if (!courseId) return { error: 'Choose a course and date.', values };
  const places = Number(get('places'));
  const method = get('method');
  if (method !== 'ACCOUNT' && method !== 'CARD_LINK' && method !== 'PAID') return { error: 'Choose how it is paid.', values };
  const poValue = parsePoValue(get('poValue'));
  if (poValue === 'bad') return { error: 'Enter the PO amount in pounds, like 1,250.', values };
  const note = get('note');
  if (method === 'PAID' && note.length < 3) return { error: 'Add a note saying how and when it was paid, for example "Bank transfer received 17 Nov".', values };

  const ticked = form.get('override') === 'on';
  const reason = get('reason');
  if (ticked && reason.length < 5) return { error: 'Give a reason for the override.', values };

  try {
    const r = await createAdminBooking({
      actorId: me.id,
      person: existing ? { id: existing.id } : { firstName: get('firstName'), lastName: get('lastName'), email, mobile: get('mobile') || undefined },
      courseId, sessionId: sessionId || null, places, bookerAttends: get('bookerAttends') === 'on', method,
      poNumber: get('poNumber'), poValuePence: typeof poValue === 'number' ? poValue : null,
      paidHow: get('paidHow') === 'CASH' ? 'CASH' : 'BANK', note,
      override: ticked ? { reason } : null,
    });
    redirect(`/admin/bookings/${encodeURIComponent(r.booking.reference)}?added=${method.toLowerCase()}`);
  } catch (e) {
    if (e instanceof AdminWarnings) return { warnings: e.warnings, values };
    if (e instanceof CheckoutError) return { error: e.message, values };
    throw e;
  }
}
