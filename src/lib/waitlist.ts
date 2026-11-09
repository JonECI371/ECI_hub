import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { SITE_URL, fmtSessionDates, fmtTime } from '@/lib/format';
import { placesTakenWhere } from '@/lib/sessions';
import { sendEmail } from '@/lib/integrations/email';

export const OFFER_HOURS = 24;

/** Places promised to waitlisted people whose claim link is still live. */
export async function placesOnOffer(tx: Prisma.TransactionClient, sessionId: string, exceptEntryId?: string): Promise<number> {
  const r = await tx.waitlistEntry.aggregate({
    where: { sessionId, offerExpiresAt: { gt: new Date() }, ...(exceptEntryId ? { id: { not: exceptEntryId } } : {}) },
    _sum: { places: true },
  });
  return r._sum.places ?? 0;
}

export async function joinWaitlist(sessionId: string, personId: string, places: number) {
  return db.$transaction(async (tx) => {
    const existing = await tx.waitlistEntry.findFirst({ where: { sessionId, personId } });
    if (existing) return existing;
    const last = await tx.waitlistEntry.aggregate({ where: { sessionId }, _max: { position: true } });
    const e = await tx.waitlistEntry.create({ data: { sessionId, personId, places, position: (last._max.position ?? 0) + 1 } });
    await tx.auditLog.create({ data: { actorId: personId, action: 'WAITLIST_JOINED', recordType: 'Session', recordId: sessionId, after: { places, position: e.position } } });
    return e;
  });
}

/** Position counting only people still waiting ahead of this entry. */
export async function queuePosition(entryId: string): Promise<number> {
  const e = await db.waitlistEntry.findUniqueOrThrow({ where: { id: entryId } });
  return (await db.waitlistEntry.count({ where: { sessionId: e.sessionId, position: { lt: e.position } } })) + 1;
}

/**
 * Offers freed places to the waitlist, in order. Expired offers are removed first, so their
 * places pass to the next person. Safe to call any time; it only offers places that are free.
 */
export async function offerFreedPlaces(sessionId: string) {
  const offers = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sessionId}))`;
    const s = await tx.session.findUnique({ where: { id: sessionId } });
    if (!s || s.status !== 'PUBLISHED' || s.startsAt <= new Date()) return []; // FULL means an admin closed it
    await tx.waitlistEntry.deleteMany({ where: { sessionId, offerExpiresAt: { lte: new Date() } } });
    const taken = (await tx.booking.aggregate({ where: { sessionId, ...placesTakenWhere() }, _sum: { places: true } }))._sum.places ?? 0;
    let free = s.capacity - taken - (await placesOnOffer(tx, sessionId));
    const waiting = await tx.waitlistEntry.findMany({ where: { sessionId, offerToken: null }, orderBy: { position: 'asc' }, include: { person: true } });
    const made: { token: string; entry: (typeof waiting)[number] }[] = [];
    for (const w of waiting) {
      if (free <= 0) break;
      if (w.places > free) continue; // a smaller request further down may still fit
      const token = randomBytes(24).toString('base64url');
      await tx.waitlistEntry.update({ where: { id: w.id }, data: { offerToken: token, offerExpiresAt: new Date(Date.now() + OFFER_HOURS * 3600000) } });
      free -= w.places;
      made.push({ token, entry: w });
    }
    return made.map((m) => ({ ...m, session: s }));
  });
  if (!offers.length) return 0;
  const course = await db.course.findUniqueOrThrow({ where: { id: offers[0].session.courseId } });
  for (const o of offers) {
    await sendEmail({
      to: o.entry.person.email,
      personId: o.entry.personId,
      trigger: 'WAITLIST_OFFER',
      subject: `A place is free: ${course.title}`,
      text: `Hello ${o.entry.person.firstName},\n\n${o.entry.places === 1 ? 'A place has' : `${o.entry.places} places have`} come up on ${course.title}, ${fmtSessionDates(o.session.startsAt, o.session.endsAt)} at ${fmtTime(o.session.startsAt)} UK time.\n\nClaim ${o.entry.places === 1 ? 'it' : 'them'} within 24 hours. One click, no code: ${SITE_URL}/waitlist/claim/${o.token}\n\nAfter 24 hours the place goes to the next person on the list.`,
    });
  }
  return offers.length;
}
