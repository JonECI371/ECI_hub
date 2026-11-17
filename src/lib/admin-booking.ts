import 'server-only';
import { db } from '@/lib/db';
import { money, SITE_URL } from '@/lib/format';
import { sign } from '@/lib/auth';
import { CheckoutError, findOrCreatePerson, newReference, pricing } from '@/lib/booking';
import { addStatementLine, availableCredit } from '@/lib/credit';
import { placesTakenWhere } from '@/lib/sessions';
import { placesOnOffer } from '@/lib/waitlist';
import { upsertPurchaseOrder } from '@/lib/purchase-orders';
import { sendBookingConfirmation } from '@/lib/notifications';
import { syncSessionMeeting } from '@/lib/integrations/teams';
import { sendEmail } from '@/lib/integrations/email';
import type { PoRule } from '@/lib/accounts';

/** How long an emailed payment link keeps the places. */
export const PAY_LINK_HOURS = 72;
export const ADMIN_MAX_PLACES = 100;

export type AdminWarning = { code: 'CAPACITY' | 'CREDIT' | 'ON_HOLD' | 'PO_MISSING'; text: string };

/** Thrown, with nothing saved, when a booking would break a rule and Admin has not ticked the override box. */
export class AdminWarnings extends Error {
  constructor(public warnings: AdminWarning[]) {
    super('This booking needs an override.');
  }
}

export type AdminBookingInput = {
  actorId: string;
  person: { id: string } | { firstName: string; lastName: string; email: string; mobile?: string };
  courseId: string;
  sessionId: string | null;
  places: number;
  bookerAttends: boolean;
  method: 'ACCOUNT' | 'CARD_LINK' | 'PAID';
  poNumber?: string;
  poValuePence?: number | null;
  paidHow?: 'CASH' | 'BANK';
  note?: string;
  /** Only set when Admin ticked the override box and gave a reason. */
  override?: { reason: string } | null;
};

/**
 * Staff book on a customer's behalf (ADM-12). Every rule a customer must meet (places left, credit available,
 * PO number, account not on hold) is checked under the same locks; if one would be broken the whole booking is
 * refused with the list of warnings, and is only saved again with an override reason, which is audited.
 */
export async function createAdminBooking(input: AdminBookingInput) {
  if (!Number.isInteger(input.places) || input.places < 1 || input.places > ADMIN_MAX_PLACES) throw new CheckoutError(`Choose between 1 and ${ADMIN_MAX_PLACES} places.`);
  const result = await db.$transaction(async (tx) => {
    const booker = 'id' in input.person
      ? await tx.person.findUnique({ where: { id: input.person.id } })
      : await findOrCreatePerson(tx, input.person);
    if (!booker) throw new CheckoutError('That person was not found.');
    const course = await tx.course.findUniqueOrThrow({ where: { id: input.courseId } });
    if (!course.pricePence) throw new CheckoutError('This course has no price yet. Set a price on the course first.');
    const warnings: AdminWarning[] = [];

    let when = 'eLearning';
    if (course.deliveryType !== 'ELEARNING') {
      if (!input.sessionId) throw new CheckoutError('Choose a date.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.sessionId}))`;
      const session = await tx.session.findUniqueOrThrow({ where: { id: input.sessionId } });
      if (session.courseId !== course.id || session.status === 'CANCELLED' || session.startsAt <= new Date()) throw new CheckoutError('That date is not available. Choose another.');
      const taken = await tx.booking.aggregate({ where: { sessionId: session.id, ...placesTakenWhere() }, _sum: { places: true } });
      const left = session.capacity - (taken._sum.places ?? 0) - (await placesOnOffer(tx, session.id));
      if (input.places > left) warnings.push({ code: 'CAPACITY', text: left > 0 ? `This date has ${left} ${left === 1 ? 'place' : 'places'} left and you are booking ${input.places}.` : `This date is full and you are booking ${input.places} ${input.places === 1 ? 'place' : 'places'}.` });
      when = session.startsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
    } else if (input.sessionId) throw new CheckoutError('eLearning has no dates.');

    const price = pricing(course.pricePence, course.vatRatePercent, input.places);
    let accountId: string | null = null;
    const po = (input.poNumber ?? '').trim().slice(0, 50);
    if (input.method === 'ACCOUNT') {
      const m = await tx.accountMember.findFirst({ where: { personId: booker.id, status: 'ACTIVE' }, include: { account: true }, orderBy: { role: 'asc' } });
      if (!m) throw new CheckoutError(`${booker.firstName} ${booker.lastName === '-' ? '' : booker.lastName} is not a booker on a credit account. Choose the card link or already paid instead.`.replace('  ', ' '));
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`account:${m.accountId}`}))`;
      const account = await tx.account.findUniqueOrThrow({ where: { id: m.accountId } });
      if (account.status !== 'ACTIVE' && account.status !== 'ON_HOLD') throw new CheckoutError(`${account.company} is not an active credit account.`);
      accountId = account.id;
      if (account.status === 'ON_HOLD') warnings.push({ code: 'ON_HOLD', text: `${account.company} is on hold because an invoice is overdue.` });
      if ((account.poRule as PoRule) !== 'NONE' && !po) warnings.push({ code: 'PO_MISSING', text: `${account.company} needs a PO number on every booking and none was entered.` });
      const available = await availableCredit(tx, account);
      if (price.totalPence > available) warnings.push({ code: 'CREDIT', text: `This booking is ${money(price.totalPence)} and ${account.company} has ${money(Math.max(0, available))} of credit available (limit ${money(account.creditLimitPence)}).` });
    }

    if (warnings.length && !input.override) throw new AdminWarnings(warnings);

    const booking = await tx.booking.create({
      data: {
        reference: newReference(), bookerId: booker.id, accountId, courseId: course.id, sessionId: input.sessionId, places: input.places,
        method: input.method === 'ACCOUNT' ? 'ACCOUNT' : input.method === 'PAID' ? 'MANUAL' : 'CARD',
        poNumber: input.method === 'ACCOUNT' && po ? po : null, ...price,
        status: input.method === 'CARD_LINK' ? 'PAYMENT_PENDING' : 'CONFIRMED',
        holdExpiresAt: input.method === 'CARD_LINK' ? new Date(Date.now() + PAY_LINK_HOURS * 3600000) : null,
      },
    });
    const people: (string | null)[] = input.bookerAttends ? [booker.id] : [];
    while (people.length < input.places) people.push(null);
    await tx.attendee.createMany({ data: people.slice(0, input.places).map((personId) => ({ bookingId: booking.id, personId, status: personId ? 'INVITED' : 'DETAILS_MISSING' })) });

    if (input.method === 'ACCOUNT' && accountId) {
      if (po) await upsertPurchaseOrder(tx, accountId, po, input.poValuePence ?? null);
      await addStatementLine(tx, accountId, booking.id, `${course.title}, ${when}, ${input.places} ${input.places === 1 ? 'place' : 'places'} (${booking.reference}${po ? `, ${/^po\b/i.test(po) ? po : `PO ${po}`}` : ''})`, price.subtotalPence, price.vatPence);
    }
    if (input.method === 'PAID') {
      await tx.payment.create({ data: { bookingId: booking.id, stripeIntentId: `manual-${booking.reference}`, amountPence: price.totalPence, status: 'succeeded' } });
    }
    await tx.auditLog.create({
      data: {
        actorId: input.actorId, action: 'ADMIN_BOOKING_CREATED', recordType: 'Booking', recordId: booking.id,
        after: {
          reference: booking.reference, bookerId: booker.id, method: input.method, places: input.places, totalPence: price.totalPence,
          ...(input.method === 'PAID' ? { paidHow: input.paidHow ?? 'BANK', note: (input.note ?? '').slice(0, 500) } : {}),
          ...(warnings.length ? { overridden: warnings.map((w) => w.code), overrideReason: input.override?.reason.slice(0, 500) } : {}),
        },
      },
    });
    return { booking, booker, token: input.method === 'CARD_LINK' ? sign({ bid: booking.id, exp: booking.holdExpiresAt!.getTime(), k: 'paylink' }) : null, warnings };
  });

  if (input.method === 'CARD_LINK') {
    const link = `${SITE_URL}/book/pay-link?t=${encodeURIComponent(result.token!)}`;
    await sendEmail({
      to: result.booker.email, personId: result.booker.id, trigger: 'PAYMENT_LINK', subject: 'Your ECI-Hub booking: pay to confirm',
      blocks: [
        { type: 'heading', text: `Pay to confirm your places, ${result.booker.firstName}` },
        { type: 'text', text: `We have reserved ${input.places} ${input.places === 1 ? 'place' : 'places'} for you. Use the button to pay by card; the places are held for ${PAY_LINK_HOURS} hours.` },
        { type: 'summary', rows: [['Reference', result.booking.reference], ['Total', money(result.booking.totalPence)]] },
        { type: 'button', label: 'Pay now', href: link },
      ],
    });
  } else {
    await sendBookingConfirmation(result.booking.id);
    if (result.booking.sessionId) await syncSessionMeeting(result.booking.sessionId);
  }
  return result;
}
