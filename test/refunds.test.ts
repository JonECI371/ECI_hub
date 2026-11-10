import { describe, expect, it, vi } from 'vitest';

const refunds: { payment_intent: string; amount: number }[] = [];
vi.mock('stripe', () => ({
  default: class { refunds = { create: async (r: { payment_intent: string; amount: number }) => { refunds.push(r); return { id: 're_1', status: 'succeeded' }; } }; },
}));

describe('refunds', async () => {
  const { db } = await import('@/lib/db');
  const { createPendingBooking, confirmCardBooking } = await import('@/lib/booking');
  const { refundBooking } = await import('@/lib/integrations/payments');
  const { course, booker } = await import('./fixtures');

  it('refunds the card payment in full once and records it', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    const { course: c, session } = await course();
    const b = await createPendingBooking({ courseId: c.id, sessionId: session!.id, places: 2, booker: booker(), bookerAttends: true, others: null });
    await confirmCardBooking(b.id, `pi_${b.id}`);
    await refundBooking(b.id);
    await refundBooking(b.id); // a second cancel click refunds nothing more
    expect(refunds).toEqual([{ payment_intent: `pi_${b.id}`, amount: b.totalPence }]);
    expect((await db.payment.findFirstOrThrow({ where: { bookingId: b.id } })).refundedPence).toBe(b.totalPence);
  });
});
