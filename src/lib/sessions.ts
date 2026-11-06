import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

/** Bookings that use up places: confirmed or completed, or still inside their 15-minute checkout hold. */
export function placesTakenWhere(now = new Date()): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: { in: ['CONFIRMED', 'COMPLETED'] } },
      { status: 'PAYMENT_PENDING', holdExpiresAt: { gt: now } },
    ],
  };
}

/** Places left for each session id, from live booking counts. */
export async function placesLeft(sessions: { id: string; capacity: number }[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (sessions.length === 0) return out;
  const taken = await db.booking.groupBy({
    by: ['sessionId'],
    where: { sessionId: { in: sessions.map((s) => s.id) }, ...placesTakenWhere() },
    _sum: { places: true },
  });
  const byId = new Map(taken.map((t) => [t.sessionId, t._sum.places ?? 0]));
  for (const s of sessions) out.set(s.id, Math.max(0, s.capacity - (byId.get(s.id) ?? 0)));
  return out;
}

/** Places-left wording, honouring the subject's display setting (ALWAYS | WHEN_LOW | NEVER). */
export const LOW_PLACES = 3;
export function placesLabel(left: number, capacity: number, display: string): { text: string; low: boolean } | null {
  if (left === 0) return { text: 'Full, join the waitlist', low: true };
  const low = left <= LOW_PLACES;
  if (display === 'NEVER') return null;
  if (display === 'WHEN_LOW' && !low) return null;
  return { text: low ? `${left} ${left === 1 ? 'place' : 'places'} left` : `${left} of ${capacity} places left`, low };
}
