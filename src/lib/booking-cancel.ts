import 'server-only';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/integrations/email';
import { syncSessionMeeting } from '@/lib/integrations/teams';
import { refundBooking, stripeEnabled } from '@/lib/integrations/payments';
import { offerFreedPlaces } from '@/lib/waitlist';
import { creditCancelledAccountBooking } from '@/lib/credit';

/**
 * Cancels a confirmed booking: frees the places, refunds card payments when asked (test mode records
 * the refund only), offers the places to the waitlist, updates the Teams invite and tells everyone.
 * Used by customers (within the cut-off) and by admins (any time).
 */
export async function cancelConfirmedBooking(bookingId: string, actorId: string, opts: { reason?: string; refund: boolean; byAdmin?: boolean }) {
  const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { course: true, booker: true, payments: true, attendees: { include: { person: true } } } });
  if (b.status !== 'CONFIRMED') return false;
  const reason = (opts.reason ?? '').slice(0, 200);
  const done = await db.$transaction(async (tx) => {
    const r = await tx.booking.updateMany({ where: { id: b.id, status: 'CONFIRMED' }, data: { status: 'CANCELLED' } });
    if (!r.count) return false; // someone else cancelled it first
    await tx.attendee.updateMany({ where: { bookingId: b.id }, data: { status: 'CANCELLED' } });
    // On account: the refund is a removed statement line, or a credit line if already invoiced.
    if (opts.refund && b.method === 'ACCOUNT') await creditCancelledAccountBooking(tx, b.id);
    if (opts.refund && b.method === 'CARD' && !stripeEnabled()) {
      for (const p of b.payments) if (p.status === 'succeeded') await tx.payment.update({ where: { id: p.id }, data: { refundedPence: p.amountPence, status: 'refunded_test' } });
    }
    await tx.auditLog.create({ data: { actorId, action: 'BOOKING_CANCELLED', recordType: 'Booking', recordId: b.id, before: { status: b.status }, after: { status: 'CANCELLED', reason, refund: opts.refund, byAdmin: !!opts.byAdmin } } });
    return true;
  });
  if (!done) return false;
  if (opts.refund && b.method === 'CARD' && stripeEnabled()) await refundBooking(b.id);
  if (b.sessionId) await offerFreedPlaces(b.sessionId);
  if (b.sessionId) await syncSessionMeeting(b.sessionId);
  const refunded = opts.refund && b.method === 'CARD' && b.payments.some((p) => p.status === 'succeeded');
  for (const p of [b.booker, ...b.attendees.map((a) => a.person).filter((x) => x && x.id !== b.bookerId)]) {
    await sendEmail({
      to: p!.email,
      personId: p!.id,
      trigger: 'BOOKING_CANCELLED',
      subject: `Cancelled: ${b.course.title} (${b.reference})`,
      blocks: [
        { type: 'heading', text: 'Your booking is cancelled' },
        { type: 'text', text: `Hello ${p!.firstName}, booking ${b.reference} for ${b.course.title} has been cancelled${opts.byAdmin ? ' by the ECI-Hub team' : ''}.` },
        ...(p!.id === b.bookerId && refunded ? [{ type: 'text' as const, text: 'Your refund goes back to the card you paid with within 5 to 10 working days.' }] : []),
        ...(p!.id === b.bookerId && opts.refund && b.method === 'ACCOUNT' ? [{ type: 'text' as const, text: 'It has been taken off your company statement, or credited if it was already invoiced.' }] : []),
        ...(opts.byAdmin && reason ? [{ type: 'summary' as const, rows: [['Reason', reason]] as [string, string][] }] : []),
        { type: 'text', text: 'Questions? Reply to this email or call +44 (0) 1932 963463.' },
      ],
    });
  }
  return true;
}
