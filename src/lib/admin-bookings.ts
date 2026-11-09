import 'server-only';
import type { BookingStatus, Prisma } from '@prisma/client';

export const STATUSES: BookingStatus[] = ['CONFIRMED', 'PAYMENT_PENDING', 'COMPLETED', 'CANCELLED'];
export const STATUS_LABEL: Record<BookingStatus, string> = { CONFIRMED: 'Confirmed', PAYMENT_PENDING: 'Not paid', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };

/** Search across reference, course and the booker's or attendees' name and email. */
export function bookingWhere(q: string | undefined, status: string | undefined): Prisma.BookingWhereInput {
  const term = (q ?? '').trim().slice(0, 80);
  const st = STATUSES.includes(status as BookingStatus) ? (status as BookingStatus) : undefined;
  const text = (f: 'email' | 'firstName' | 'lastName') => ({ [f]: { contains: term, mode: 'insensitive' as const } });
  return {
    status: st,
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
