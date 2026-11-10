import 'server-only';
import { db } from '@/lib/db';

/** The credit account a person books for (active booker on an account that is open or on hold). */
export async function myMembership(personId: string) {
  return db.accountMember.findFirst({
    where: { personId, status: 'ACTIVE', account: { status: { in: ['ACTIVE', 'ON_HOLD'] } } },
    include: { account: true },
    orderBy: { role: 'asc' }, // MAIN_BOOKER first
  });
}

/** Accounts whose bookings this person can see and manage. */
export async function accountIdsFor(personId: string): Promise<string[]> {
  const rows = await db.accountMember.findMany({ where: { personId, status: 'ACTIVE' }, select: { accountId: true } });
  return rows.map((r) => r.accountId);
}

/** A booking is managed by whoever booked it, or by any active booker on its company account. */
export async function managesBooking(personId: string, b: { bookerId: string; accountId: string | null }): Promise<boolean> {
  if (b.bookerId === personId) return true;
  if (!b.accountId) return false;
  return !!(await db.accountMember.findFirst({ where: { personId, accountId: b.accountId, status: 'ACTIVE' } }));
}

/** Figures for the booker's tiles and the billing page. */
export async function accountSummary(account: { id: string; creditLimitPence: number }) {
  const { availableCredit, statementMonth } = await import('@/lib/credit');
  const now = new Date();
  const [available, open, upcoming, statements] = await Promise.all([
    availableCredit(db, account),
    db.statementLine.aggregate({ where: { statement: { accountId: account.id, month: statementMonth(), status: 'OPEN' } }, _sum: { netPence: true, vatPence: true } }),
    db.booking.findMany({ where: { accountId: account.id, status: 'CONFIRMED', OR: [{ session: { startsAt: { gt: now } } }, { sessionId: null }] }, select: { places: true, sessionId: true } }),
    db.statement.findMany({ where: { accountId: account.id }, include: { lines: { select: { bookingId: true, netPence: true, vatPence: true } } }, orderBy: { month: 'desc' }, take: 12 }),
  ]);
  return {
    limit: account.creditLimitPence,
    available,
    thisMonth: (open._sum.netPence ?? 0) + (open._sum.vatPence ?? 0),
    upcomingPlaces: upcoming.reduce((n, b) => n + b.places, 0),
    upcomingSessions: new Set(upcoming.map((b) => b.sessionId ?? 'elearning')).size,
    statements: statements.map((s) => ({
      ...s,
      bookings: new Set(s.lines.filter((l) => l.netPence > 0).map((l) => l.bookingId)).size,
      totalPence: s.lines.reduce((n, l) => n + l.netPence + l.vatPence, 0),
    })),
  };
}

/** People who attended this account's bookings, with certificates expiring within the next 6 months. */
export async function teamExpiries(accountId: string) {
  const attendees = await db.attendee.findMany({ where: { booking: { accountId }, personId: { not: null } }, select: { personId: true }, distinct: ['personId'] });
  return db.certificate.findMany({
    where: { personId: { in: attendees.map((a) => a.personId!) }, expiresAt: { gt: new Date(Date.now() - 30 * 86400000), lt: new Date(Date.now() + 183 * 86400000) } },
    include: { person: true, course: true },
    orderBy: { expiresAt: 'asc' },
    take: 20,
  });
}
