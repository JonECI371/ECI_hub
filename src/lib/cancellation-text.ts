import { money } from '@/lib/format';

type B = { status: string; method: string; totalPence: number; cancellationDecision: string | null; cancellationChargePence: number; payments?: { refundedPence: number }[] };

/** What happened to the money on a cancelled booking, in words for the customer and the admin. Null when nothing to say. */
export function cancellationOutcome(b: B): string | null {
  if (b.status !== 'CANCELLED') return null;
  const charge = b.cancellationChargePence;
  const refund = b.totalPence - charge;
  const card = b.method === 'CARD';
  switch (b.cancellationDecision) {
    case 'PENDING': return 'Cancellation under review. Our team will email you what happens with any refund or charge, usually within one working day.';
    case 'REFUNDED': return card ? `Refunded ${money(refund)} to your card.` : 'Taken off your company statement.';
    case 'CHARGED': return `Cancellation charge of ${money(charge)} applies under our policy.`;
    case 'PART_CHARGED': return `${money(charge)} charged under our policy and ${money(refund)} ${card ? 'refunded to your card' : 'taken off your company statement'}.`;
    case 'WAIVED': return `Charge waived. ${card ? `Refunded ${money(refund)} to your card.` : 'Taken off your company statement.'}`;
    default: {
      // Cancelled before cancellation decisions existed.
      const refunded = (b.payments ?? []).reduce((n, p) => n + p.refundedPence, 0);
      return card && refunded ? `Refunded ${money(refunded)} to your card.` : null;
    }
  }
}
