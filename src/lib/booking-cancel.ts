import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { SITE_URL, fmtSessionDates, fmtTime, money } from '@/lib/format';
import { sendEmail } from '@/lib/integrations/email';
import { syncSessionMeeting } from '@/lib/integrations/teams';
import { refundBooking, stripeEnabled } from '@/lib/integrations/payments';
import { offerFreedPlaces, placesOnOffer } from '@/lib/waitlist';
import { creditCancelledAccountBooking, reduceAccountCharge } from '@/lib/credit';
import { loadPolicy, steer } from '@/lib/cancellation-policy';
import { enqueueXero } from '@/lib/xero-queue';
import { kickXero } from '@/lib/xero-sync';
import { placesTakenWhere } from '@/lib/sessions';

export class CancellationError extends Error {}

async function load(bookingId: string) {
  return db.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { course: true, session: true, booker: true, payments: true, attendees: { include: { person: true } } } });
}
type Loaded = Awaited<ReturnType<typeof load>>;

async function tellAll(b: Loaded, subject: string, blocksFor: (name: string, isBooker: boolean) => import('@/lib/email-layout').Block[], trigger: string) {
  const people = [b.booker, ...b.attendees.map((a) => a.person).filter((x): x is NonNullable<typeof x> => !!x && x.id !== b.bookerId)];
  for (const p of people) await sendEmail({ to: p.email, personId: p.id, trigger, subject, blocks: blocksFor(p.firstName, p.id === b.bookerId) });
}

/**
 * Cancels a confirmed booking now: places freed at once, waitlist offered, Teams invite withdrawn, everyone told.
 *  - Customer cancellation (`review: true`): no money moves. An Admin gets a Cancellation to review task with the
 *    policy's steer, and decides refund, charge, part charge, waive, or move to another date.
 *  - Admin cancellation: the Admin decides at the same time (`refund` true or false).
 */
export async function cancelConfirmedBooking(bookingId: string, actorId: string, opts: { reason?: string; refund: boolean; byAdmin?: boolean; review?: boolean }) {
  const b = await load(bookingId);
  if (b.status !== 'CONFIRMED') return false;
  const reason = (opts.reason ?? '').slice(0, 200);
  const policy = opts.review ? await loadPolicy() : null;
  const st = policy ? steer(policy, b.session?.startsAt ?? null, b.totalPence) : null;
  const done = await db.$transaction(async (tx) => {
    const r = await tx.booking.updateMany({ where: { id: b.id, status: 'CONFIRMED' }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason || null, cancellationDecision: opts.review ? 'PENDING' : opts.refund ? 'REFUNDED' : 'CHARGED', cancellationChargePence: opts.review || opts.refund ? 0 : b.totalPence, cancellationDecidedAt: opts.review ? null : new Date(), cancellationDecidedById: opts.review ? null : actorId } });
    if (!r.count) return false; // someone else cancelled it first
    await tx.attendee.updateMany({ where: { bookingId: b.id }, data: { status: 'CANCELLED' } });
    if (!opts.review) await settleMoney(tx, b, opts.refund ? 0 : b.totalPence);
    if (opts.review) {
      await tx.task.create({ data: { type: 'CANCELLATION_REVIEW', title: `Cancellation to review: ${b.reference}, ${b.course.title}`, detail: `${b.booker.firstName} ${b.booker.lastName} cancelled${reason ? `: ${reason}` : ''}. ${st!.text}`, recordType: 'Booking', recordId: b.id, dueAt: b.session?.startsAt ?? null } });
    }
    await tx.auditLog.create({ data: { actorId, action: 'BOOKING_CANCELLED', recordType: 'Booking', recordId: b.id, before: { status: b.status }, after: { status: 'CANCELLED', reason, review: !!opts.review, refund: opts.refund, byAdmin: !!opts.byAdmin } } });
    return true;
  });
  if (!done) return false;
  if (!opts.review && opts.refund && b.method === 'CARD' && stripeEnabled()) await refundBooking(b.id);
  kickXero();
  if (b.sessionId) await offerFreedPlaces(b.sessionId);
  if (b.sessionId) await syncSessionMeeting(b.sessionId);
  await tellAll(b, `Cancelled: ${b.course.title} (${b.reference})`, (name, isBooker) => [
    { type: 'heading', text: 'Your booking is cancelled' },
    { type: 'text', text: `Hello ${name}, booking ${b.reference} for ${b.course.title} has been cancelled${opts.byAdmin ? ' by the ECI-Hub team' : ''}. The places have been released.` },
    ...(isBooker && opts.review ? [{ type: 'text' as const, text: 'Our team looks at every cancellation and will email you what happens with any refund or charge, usually within one working day. We may also offer to move you to another date.' }] : []),
    ...(isBooker && !opts.review && opts.refund ? [{ type: 'text' as const, text: b.method === 'CARD' ? 'Your refund goes back to the card you paid with within 5 to 10 working days.' : 'It has been taken off your company statement, or credited if it was already invoiced.' }] : []),
    ...(opts.byAdmin && reason ? [{ type: 'summary' as const, rows: [['Reason', reason]] as [string, string][] }] : []),
    { type: 'text', text: `Our cancellation terms: ${SITE_URL}/legal/terms#cancellations-and-refunds. Questions? Call +44 (0) 1932 963463.` },
  ], 'BOOKING_CANCELLED');
  return true;
}

/** Money for a decided cancellation: charge `chargePence` (gross) and give back the rest. Card in test mode records the refund only. */
async function settleMoney(tx: Prisma.TransactionClient, b: Loaded, chargePence: number) {
  const refundPence = Math.max(0, b.totalPence - chargePence);
  if (b.method === 'CARD' && refundPence > 0) await enqueueXero(tx, 'CREDIT_NOTE', 'Booking', b.id, `CREDIT_NOTE:${b.id}:${refundPence}`, { amountPence: refundPence }); // the refund is a credit note in Xero
  if (b.method === 'ACCOUNT') {
    if (chargePence === 0) await creditCancelledAccountBooking(tx, b.id);
    else if (chargePence < b.totalPence) await reduceAccountCharge(tx, b.id, chargePence);
    return;
  }
  if (!stripeEnabled() && refundPence > 0) {
    let left = refundPence;
    for (const p of b.payments) {
      if (p.status !== 'succeeded' && p.status !== 'partially_refunded') continue;
      const give = Math.min(left, p.amountPence - p.refundedPence);
      if (give <= 0) continue;
      await tx.payment.update({ where: { id: p.id }, data: { refundedPence: p.refundedPence + give, status: p.refundedPence + give >= p.amountPence ? 'refunded_test' : 'partially_refunded' } });
      left -= give;
    }
  }
}

export type Decision = { kind: 'REFUND' | 'CHARGE' | 'PARTIAL' | 'WAIVE'; percent?: number; note?: string };

/** An Admin decides a customer's cancellation. Only while it is waiting for a decision. */
export async function decideCancellation(bookingId: string, actorId: string, d: Decision) {
  const b = await load(bookingId);
  if (b.status !== 'CANCELLED' || b.cancellationDecision !== 'PENDING') throw new CancellationError('This cancellation has already been dealt with.');
  const note = (d.note ?? '').trim().slice(0, 300);
  if (d.kind === 'WAIVE' && !note) throw new CancellationError('Say what the extenuating circumstances were.');
  if (d.kind === 'PARTIAL' && !(Number(d.percent) >= 1 && Number(d.percent) <= 99)) throw new CancellationError('Enter a charge between 1% and 99%.');
  const chargePence = d.kind === 'CHARGE' ? b.totalPence : d.kind === 'PARTIAL' ? Math.round((b.totalPence * Number(d.percent)) / 100) : 0;
  const decision = d.kind === 'REFUND' ? 'REFUNDED' : d.kind === 'CHARGE' ? 'CHARGED' : d.kind === 'PARTIAL' ? 'PART_CHARGED' : 'WAIVED';
  await db.$transaction(async (tx) => {
    const r = await tx.booking.updateMany({ where: { id: b.id, cancellationDecision: 'PENDING' }, data: { cancellationDecision: decision, cancellationChargePence: chargePence, cancellationNote: note || null, cancellationDecidedAt: new Date(), cancellationDecidedById: actorId } });
    if (!r.count) throw new CancellationError('This cancellation has already been dealt with.');
    await settleMoney(tx, b, chargePence);
    await tx.task.updateMany({ where: { type: 'CANCELLATION_REVIEW', recordId: b.id, status: 'OPEN' }, data: { status: 'DONE', doneAt: new Date(), assigneeId: actorId } });
    await tx.auditLog.create({ data: { actorId, action: 'CANCELLATION_DECIDED', recordType: 'Booking', recordId: b.id, after: { decision, chargePence, note } } });
  });
  if (b.method === 'CARD' && stripeEnabled() && chargePence < b.totalPence) await refundBooking(b.id, b.totalPence - chargePence);
  kickXero();
  const refund = b.totalPence - chargePence;
  const card = b.method === 'CARD';
  await sendEmail({
    to: b.booker.email, personId: b.booker.id, trigger: 'CANCELLATION_DECIDED', subject: `Your cancellation: ${b.course.title} (${b.reference})`,
    blocks: [
      { type: 'heading', text: decision === 'CHARGED' ? 'A cancellation charge applies' : decision === 'PART_CHARGED' ? 'Part of your booking is refunded' : decision === 'WAIVED' ? 'We have waived the charge' : 'Your refund is on its way' },
      { type: 'text', text: decision === 'REFUNDED' ? (card ? `Hello ${b.booker.firstName}, we have refunded ${money(refund)} for booking ${b.reference}. It reaches your card in 5 to 10 working days.` : `Hello ${b.booker.firstName}, booking ${b.reference} has been taken off your company statement.`)
        : decision === 'WAIVED' ? `Hello ${b.booker.firstName}, because of your circumstances we have waived the cancellation charge for booking ${b.reference}. ${card ? `${money(refund)} is refunded to your card in 5 to 10 working days.` : 'It has been taken off your company statement.'}`
        : decision === 'CHARGED' ? `Hello ${b.booker.firstName}, under our cancellation policy the full ${money(chargePence)} for booking ${b.reference} is charged. ${card ? 'There is no refund.' : 'It stays on your company statement.'}`
        : `Hello ${b.booker.firstName}, under our cancellation policy ${money(chargePence)} for booking ${b.reference} is charged and ${money(refund)} is ${card ? 'refunded to your card in 5 to 10 working days' : 'taken off your company statement'}.` },
      { type: 'summary', rows: [['Booking', b.reference], ['Course', b.course.title], ['Date', b.session ? `${fmtSessionDates(b.session.startsAt, b.session.endsAt)}, ${fmtTime(b.session.startsAt)}` : 'Start any time'], ['Charged', money(chargePence)], ['Refunded', money(refund)], ...(note ? [['Note', note] as [string, string]] : [])] },
      { type: 'text', text: `You can see our cancellation terms at ${SITE_URL}/legal/terms#cancellations-and-refunds. Questions? Call +44 (0) 1932 963463.` },
    ],
  });
  return { decision, chargePence, refund };
}

/**
 * Instead of cancelling for good, move the booking to another date (the customer accepted a transfer).
 * The booking is reinstated on the new date if it has the places; the payment or statement line stays as it was.
 */
export async function moveCancelledBooking(bookingId: string, actorId: string, sessionId: string, note?: string) {
  const b = await load(bookingId);
  if (b.status !== 'CANCELLED' || b.cancellationDecision !== 'PENDING') throw new CancellationError('This cancellation has already been dealt with.');
  const moved = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sessionId}))`;
    const s = await tx.session.findUnique({ where: { id: sessionId } });
    if (!s || s.courseId !== b.courseId || s.status !== 'PUBLISHED' || s.startsAt <= new Date()) throw new CancellationError('That date is not available.');
    const taken = await tx.booking.aggregate({ where: { sessionId: s.id, ...placesTakenWhere() }, _sum: { places: true } });
    const left = s.capacity - (taken._sum.places ?? 0) - (await placesOnOffer(tx, s.id));
    if (left < b.places) throw new CancellationError(`That date has only ${Math.max(0, left)} places left.`);
    await tx.booking.update({ where: { id: b.id }, data: { status: 'CONFIRMED', sessionId: s.id, cancellationDecision: 'MOVED', cancellationNote: (note ?? '').slice(0, 300) || null, cancellationDecidedAt: new Date(), cancellationDecidedById: actorId } });
    for (const a of b.attendees) {
      const reg = await tx.registration.findUnique({ where: { attendeeId: a.id } });
      await tx.attendee.update({ where: { id: a.id }, data: { status: !a.personId ? 'DETAILS_MISSING' : reg ? (reg.approval === 'APPROVED' ? 'APPROVED' : 'REGISTERED') : 'INVITED' } });
    }
    await tx.task.updateMany({ where: { type: 'CANCELLATION_REVIEW', recordId: b.id, status: 'OPEN' }, data: { status: 'DONE', doneAt: new Date(), assigneeId: actorId } });
    await tx.auditLog.create({ data: { actorId, action: 'CANCELLATION_MOVED', recordType: 'Booking', recordId: b.id, before: { sessionId: b.sessionId }, after: { sessionId: s.id } } });
    return s;
  });
  if (b.sessionId) await syncSessionMeeting(b.sessionId);
  await syncSessionMeeting(moved.id);
  await tellAll(b, `Moved to a new date: ${b.course.title} (${b.reference})`, (name) => [
    { type: 'heading', text: 'Your booking is moved' },
    { type: 'text', text: `Hello ${name}, instead of cancelling, booking ${b.reference} for ${b.course.title} has been moved to a new date. Nothing more to pay.` },
    { type: 'summary', rows: [['Course', b.course.title], ['New date', `${fmtSessionDates(moved.startsAt, moved.endsAt)}, ${fmtTime(moved.startsAt)} to ${fmtTime(moved.endsAt)} UK time`], ['Reference', b.reference]] },
    { type: 'button', label: 'View my booking', href: `/account/bookings/${b.reference}` },
  ], 'BOOKING_MOVED');
  return moved;
}
