'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { audit, requireAdmin } from '@/lib/admin';
import { cancelConfirmedBooking } from '@/lib/booking-cancel';
import { sendEmail } from '@/lib/integrations/email';

/** Admin cancels a confirmed booking at any time, with or without a refund. */
export async function adminCancelBooking(form: FormData) {
  const me = await requireAdmin('/admin/bookings');
  const ref = String(form.get('ref') ?? '');
  const b = await db.booking.findUnique({ where: { reference: ref } });
  if (!b) redirect('/admin/bookings');
  const reason = String(form.get('reason') ?? '').trim();
  if (form.get('confirm') !== 'on' || !reason) redirect(`/admin/bookings/${ref}?msg=confirm`);
  const ok = await cancelConfirmedBooking(b.id, me.id, { reason, refund: form.get('refund') === 'on', byAdmin: true });
  revalidatePath(`/admin/bookings/${ref}`);
  redirect(`/admin/bookings/${ref}?msg=${ok ? 'cancelled' : 'notconfirmed'}`);
}

/** Email the bookers of the selected bookings. One email per booker, however many bookings they have. */
export async function emailBookers(form: FormData) {
  const me = await requireAdmin('/admin/bookings');
  const back = String(form.get('back') ?? '');
  const to = (q: string) => `/admin/bookings?${back ? `${back}&` : ''}${q}`;
  const ids = form.getAll('id').map(String).slice(0, 200);
  const subject = String(form.get('subject') ?? '').trim().slice(0, 150);
  const message = String(form.get('message') ?? '').trim().slice(0, 5000);
  if (!ids.length) redirect(to('msg=none'));
  if (!subject || !message) redirect(to('msg=empty'));
  const rows = await db.booking.findMany({ where: { id: { in: ids } }, include: { booker: true } });
  const bookers = new Map(rows.map((r) => [r.bookerId, r.booker]));
  for (const p of bookers.values()) {
    const refs = rows.filter((r) => r.bookerId === p.id).map((r) => r.reference).join(', ');
    await sendEmail({
      to: p.email, personId: p.id, trigger: 'ADMIN_MESSAGE', subject,
      blocks: [{ type: 'heading', text: subject }, { type: 'text', text: `Hello ${p.firstName},` }, ...message.split(/\n{2,}/).map((t) => ({ type: 'text' as const, text: t.trim() })), { type: 'summary', rows: [['Booking', refs]] }],
    });
  }
  await audit(me.id, 'BULK_EMAIL_SENT', 'Booking', ids.join(',').slice(0, 190), undefined, { subject, bookings: rows.map((r) => r.reference), bookers: bookers.size });
  redirect(to(`msg=sent&n=${bookers.size}`));
}
