import 'server-only';
import type { Account, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { money } from '@/lib/format';
import { CheckoutError, findOrCreatePerson, newReference, pricing, splitName } from '@/lib/booking';
import { placesTakenWhere } from '@/lib/sessions';
import { placesOnOffer } from '@/lib/waitlist';
import { creditDefaults, type PoRule } from '@/lib/accounts';
import { sendEmail } from '@/lib/integrations/email';
import { upsertPurchaseOrder } from '@/lib/purchase-orders';

type Tx = Prisma.TransactionClient;

/** Statement month (YYYY-MM) in UK time. */
export function statementMonth(d = new Date()): string {
  const p = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', timeZone: 'Europe/London' }).formatToParts(d);
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
}

/** "Added to your November statement, invoiced on 30 November." */
export function statementText(month = statementMonth()): string {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  const name = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(last);
  return `Added to your ${name} statement, invoiced on ${last.getUTCDate()} ${name}.`;
}

/** Available credit = limit, minus lines on open statements, minus statements issued but not yet paid. */
export async function availableCredit(tx: Tx | typeof db, account: Pick<Account, 'id' | 'creditLimitPence'>): Promise<number> {
  const lines = await tx.statementLine.aggregate({ where: { statement: { accountId: account.id, status: { in: ['OPEN', 'ISSUED', 'OVERDUE'] } } }, _sum: { netPence: true, vatPence: true } });
  return account.creditLimitPence - (lines._sum.netPence ?? 0) - (lines._sum.vatPence ?? 0);
}

/** The account a signed-in person books for, if they are an active booker on one. */
export async function bookingAccount(personId: string) {
  const m = await db.accountMember.findFirst({ where: { personId, status: 'ACTIVE', account: { status: { in: ['ACTIVE', 'ON_HOLD'] } } }, include: { account: true }, orderBy: { role: 'asc' } });
  if (!m) return null;
  const available = await availableCredit(db, m.account);
  const lastPo = m.account.poRule === 'PER_ACCOUNT' ? (await db.booking.findFirst({ where: { accountId: m.account.id, poNumber: { not: null } }, orderBy: { createdAt: 'desc' } }))?.poNumber ?? null : null;
  return { account: m.account, role: m.role, available, lastPo };
}

/** Adds a line (positive for a booking, negative for a credit) to the account's open statement for this month. */
export async function addStatementLine(tx: Tx, accountId: string, bookingId: string, description: string, netPence: number, vatPence: number) {
  const st = await tx.statement.upsert({ where: { accountId_month: { accountId, month: statementMonth() } }, create: { accountId, month: statementMonth() }, update: {} });
  if (st.status !== 'OPEN') throw new Error(`Statement ${st.month} for this account is already closed`);
  return tx.statementLine.create({ data: { statementId: st.id, bookingId, description: description.slice(0, 300), netPence, vatPence } });
}

export type AccountBookingInput = {
  personId: string;
  courseId: string;
  sessionId: string | null;
  places: number;
  bookerAttends: boolean;
  others: { name: string; email: string }[] | null;
  poNumber?: string;
  poValuePence?: number | null;
  waitlistEntryId?: string;
  addedToId?: string;
};

/**
 * Books on account: confirmed at once if the account is active, the PO rule is met and the total fits
 * within available credit. Capacity and credit are checked under locks, so two bookers cannot overspend.
 */
export async function createAccountBooking(input: AccountBookingInput) {
  const result = await db.$transaction(async (tx) => {
    const m = await tx.accountMember.findFirst({ where: { personId: input.personId, status: 'ACTIVE' }, include: { account: true, person: true }, orderBy: { role: 'asc' } });
    if (!m) throw new CheckoutError('You are not a booker on a credit account. Pay by card instead.');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`account:${m.accountId}`}))`;
    const account = await tx.account.findUniqueOrThrow({ where: { id: m.accountId } });
    if (account.status === 'ON_HOLD') throw new CheckoutError('Your company account is on hold because an invoice is overdue. You can still pay by card, or contact us to sort it out.');
    if (account.status !== 'ACTIVE') throw new CheckoutError('Your company account is not active. Pay by card instead.');
    const po = (input.poNumber ?? '').trim().slice(0, 50);
    if ((account.poRule as PoRule) !== 'NONE' && !po) throw new CheckoutError('Your company needs a PO number on every booking. Enter it to continue.');

    const course = await tx.course.findUniqueOrThrow({ where: { id: input.courseId } });
    if (course.status !== 'PUBLISHED') throw new CheckoutError('This course is not open for booking.');
    if (!course.pricePence) throw new CheckoutError('This course has no online price yet. Contact us to book.');
    if (po) await upsertPurchaseOrder(tx, account.id, po, input.poValuePence ?? null);
    let when = 'eLearning';
    if (input.sessionId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.sessionId}))`;
      const session = await tx.session.findUniqueOrThrow({ where: { id: input.sessionId } });
      if (session.courseId !== course.id || session.status !== 'PUBLISHED' || session.startsAt <= new Date()) throw new CheckoutError('This date is no longer available.');
      const taken = await tx.booking.aggregate({ where: { sessionId: session.id, ...placesTakenWhere() }, _sum: { places: true } });
      const left = session.capacity - (taken._sum.places ?? 0) - (await placesOnOffer(tx, session.id, input.waitlistEntryId));
      if (input.places > left) throw new CheckoutError(left > 0 ? `Only ${left} ${left === 1 ? 'place is' : 'places are'} left on this date.` : 'This date is now full.');
      when = session.startsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
    }

    const price = pricing(course.pricePence, course.vatRatePercent, input.places);
    const before = await availableCredit(tx, account);
    if (price.totalPence > before) throw new CheckoutError(`This booking is ${money(price.totalPence)} and your available credit is ${money(Math.max(0, before))}. Pay by card, or contact us to raise your limit.`);

    const booking = await tx.booking.create({
      data: { reference: newReference(), bookerId: m.personId, accountId: account.id, courseId: course.id, sessionId: input.sessionId, addedToId: input.addedToId ?? null, places: input.places, method: 'ACCOUNT', poNumber: po || null, ...price, status: 'CONFIRMED' },
    });
    const people: (string | null)[] = [];
    if (input.bookerAttends) people.push(m.personId);
    for (const o of input.others ?? []) people.push((await findOrCreatePerson(tx, { email: o.email, ...splitName(o.name) })).id);
    while (people.length < input.places) people.push(null);
    await tx.attendee.createMany({ data: people.slice(0, input.places).map((personId) => ({ bookingId: booking.id, personId, status: personId ? 'INVITED' : 'DETAILS_MISSING' })) });
    await addStatementLine(tx, account.id, booking.id, `${course.title}, ${when}, ${input.places} ${input.places === 1 ? 'place' : 'places'} (${booking.reference}${po ? `, ${/^po\b/i.test(po) ? po : `PO ${po}`}` : ''})`, price.subtotalPence, price.vatPence);
    if (input.sessionId) await tx.waitlistEntry.deleteMany({ where: { sessionId: input.sessionId, personId: m.personId } });
    await tx.auditLog.create({ data: { actorId: m.personId, action: 'BOOKING_CONFIRMED_ON_ACCOUNT', recordType: 'Booking', recordId: booking.id, after: { reference: booking.reference, accountId: account.id, totalPence: price.totalPence, poNumber: po || null } } });
    return { booking, account, booker: m.person, before, after: before - price.totalPence };
  });

  // Warn the booker once, as available credit drops below the threshold.
  const { lowCreditWarnPence } = await creditDefaults();
  if (result.before >= lowCreditWarnPence && result.after < lowCreditWarnPence) {
    await sendEmail({
      to: result.booker.email, personId: result.booker.id, trigger: 'LOW_CREDIT', subject: `Available credit is low: ${result.account.company}`,
      blocks: [
        { type: 'heading', text: 'Your available credit is running low' },
        { type: 'text', text: `${result.account.company} has ${money(result.after)} of credit left on its account. Credit is restored when the monthly invoice is paid.` },
        { type: 'summary', rows: [['Credit limit', money(result.account.creditLimitPence)], ['Available now', money(result.after)]] },
        { type: 'text', text: 'Need a higher limit? Reply to this email or call +44 (0) 1932 963463.' },
      ],
    });
  }
  return result.booking;
}

/**
 * Cancelling an on-account booking: remove its line from the open statement, or, if that statement has
 * already been issued, add a credit line to this month's statement.
 */
export async function creditCancelledAccountBooking(tx: Tx, bookingId: string) {
  const lines = await tx.statementLine.findMany({ where: { bookingId }, include: { statement: true } });
  for (const l of lines) {
    if (l.netPence <= 0) continue;
    if (l.statement.status === 'OPEN') await tx.statementLine.delete({ where: { id: l.id } });
    else await addStatementLine(tx, l.statement.accountId, bookingId, `Credit: ${l.description}`, -l.netPence, -l.vatPence);
  }
}

/**
 * Daily: an issued statement 14 or more days past its due date becomes OVERDUE and puts the account on hold.
 * An account with nothing overdue comes off hold.
 */
export async function applyOverdueHolds(now = new Date()) {
  const overdue = await db.statement.findMany({ where: { status: { in: ['ISSUED', 'OVERDUE'] }, paidAt: null, dueAt: { lt: new Date(now.getTime() - 14 * 86400000) } }, include: { account: true } });
  for (const st of overdue) {
    if (st.status !== 'OVERDUE') await db.statement.update({ where: { id: st.id }, data: { status: 'OVERDUE' } });
    if (st.account.status === 'ACTIVE') {
      await db.account.update({ where: { id: st.accountId }, data: { status: 'ON_HOLD' } });
      await db.auditLog.create({ data: { action: 'ACCOUNT_ON_HOLD', recordType: 'Account', recordId: st.accountId, after: { statement: st.month, dueAt: st.dueAt } } });
    }
  }
  const held = await db.account.findMany({ where: { status: 'ON_HOLD', statements: { none: { status: 'OVERDUE' } } } });
  for (const a of held) {
    await db.account.update({ where: { id: a.id }, data: { status: 'ACTIVE' } });
    await db.auditLog.create({ data: { action: 'ACCOUNT_OFF_HOLD', recordType: 'Account', recordId: a.id } });
  }
}

/**
 * A cancelled on-account booking is charged only in part: keep `chargePence` (gross) of it on the statement.
 * On the open statement the line shrinks; once invoiced, a credit line takes off the difference.
 */
export async function reduceAccountCharge(tx: Tx, bookingId: string, chargePence: number) {
  const lines = await tx.statementLine.findMany({ where: { bookingId, netPence: { gt: 0 } }, include: { statement: true } });
  for (const l of lines) {
    const total = l.netPence + l.vatPence;
    if (chargePence >= total) continue;
    const net = Math.round((l.netPence * chargePence) / total);
    const vat = chargePence - net;
    if (l.statement.status === 'OPEN') await tx.statementLine.update({ where: { id: l.id }, data: { netPence: net, vatPence: vat, description: `Cancellation charge: ${l.description}`.slice(0, 300) } });
    else await addStatementLine(tx, l.statement.accountId, bookingId, `Credit: part cancellation, ${l.description}`, -(l.netPence - net), -(l.vatPence - vat));
  }
}
