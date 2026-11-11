import 'server-only';
import type { BookingStatus, Prisma } from '@prisma/client';

export const STATUSES: BookingStatus[] = ['CONFIRMED', 'PAYMENT_PENDING', 'COMPLETED', 'CANCELLED'];
/** A started checkout whose 15-minute hold has run out. Shown as Expired and hidden unless asked for. */
export const isExpiredHold = (b: { status: BookingStatus; holdExpiresAt: Date | null }) => b.status === 'PAYMENT_PENDING' && !!b.holdExpiresAt && b.holdExpiresAt < new Date();
export const statusLabel = (b: { status: BookingStatus; holdExpiresAt: Date | null }) => (isExpiredHold(b) ? 'Expired' : STATUS_LABEL[b.status]);
export const STATUS_LABEL: Record<BookingStatus, string> = { CONFIRMED: 'Confirmed', PAYMENT_PENDING: 'Not paid', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };

/** Search across reference, course and the booker's or attendees' name and email. */
export function bookingWhere(q: string | undefined, status: string | undefined): Prisma.BookingWhereInput {
  const term = (q ?? '').trim().slice(0, 80);
  const st = STATUSES.includes(status as BookingStatus) ? (status as BookingStatus) : undefined;
  const now = new Date();
  const statusWhere: Prisma.BookingWhereInput =
    status === 'EXPIRED' ? { status: 'PAYMENT_PENDING', holdExpiresAt: { lt: now } }
    : st === 'PAYMENT_PENDING' ? { status: 'PAYMENT_PENDING', OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gte: now } }] }
    : st ? { status: st }
    : { NOT: { status: 'PAYMENT_PENDING', holdExpiresAt: { lt: now } } };
  const text = (f: 'email' | 'firstName' | 'lastName') => ({ [f]: { contains: term, mode: 'insensitive' as const } });
  return {
    ...statusWhere,
    ...(term
      ? {
          OR: [
            { reference: { contains: term, mode: 'insensitive' } },
            { course: { title: { contains: term, mode: 'insensitive' } } },
            { booker: { OR: [text('email'), text('firstName'), text('lastName')] } },
            { attendees: { some: { person: { OR: [text('email'), text('firstName'), text('lastName')] } } } },
            { account: { company: { contains: term, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
}
