import 'server-only';
import { confirmCardBooking } from '@/lib/booking';
import { sendBookingConfirmation } from '@/lib/notifications';
import { syncSessionMeeting } from '@/lib/integrations/teams';
import { kickXero } from '@/lib/xero-sync';

/** After money is taken (test button, Stripe return page or webhook): confirm once, then email and invite. */
export async function completePaidBooking(bookingId: string, paymentRef: string) {
  const { booking, already } = await confirmCardBooking(bookingId, paymentRef);
  if (!already) {
    kickXero();
    await sendBookingConfirmation(booking.id);
    if (booking.sessionId) await syncSessionMeeting(booking.sessionId);
  }
  return booking;
}
