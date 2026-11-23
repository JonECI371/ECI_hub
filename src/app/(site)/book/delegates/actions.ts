'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { currentPerson } from '@/lib/auth';
import { findOrCreatePerson } from '@/lib/booking';
import { bookingForDelegates, delegatesPath } from '@/lib/delegates';
import { registrationLink } from '@/lib/registration-link';
import { sendJoiningDetails } from '@/lib/notifications';
import { syncSessionMeeting } from '@/lib/integrations/teams';

/**
 * Name a delegate on a booking, then either email them their link ("link") or let the booker fill the form in now ("now").
 * Works for an empty place, or one already named whose registration has not been submitted.
 */
export async function assignDelegate(form: FormData) {
  const ref = String(form.get('ref') ?? '');
  const attendeeId = String(form.get('attendeeId') ?? '');
  const intent = form.get('intent') === 'now' ? 'now' : 'link';
  const b = await bookingForDelegates(ref);
  if (!b) redirect('/no-access');
  const bounce = (msg: string): never => redirect(`${delegatesPath(ref)}&msg=${msg}`);

  const a = b.attendees.find((x) => x.id === attendeeId);
  if (!a || a.status === 'CANCELLED' || a.personId === b.bookerId || a.registration) return bounce('error');
  const first = z.string().trim().min(1).max(80).safeParse(form.get('firstName'));
  const last = z.string().trim().min(1).max(80).safeParse(form.get('lastName'));
  const email = z.string().trim().toLowerCase().email().max(254).safeParse(form.get('email'));
  if (!first.success || !last.success || !email.success) return bounce('invalid');

  const me = await currentPerson();
  const person = await db.$transaction(async (tx) => {
    const p = await findOrCreatePerson(tx, { email: email.data!, firstName: first.data!, lastName: last.data! });
    if (b.attendees.some((x) => x.id !== a.id && x.personId === p.id && x.status !== 'CANCELLED')) return null;
    await tx.attendee.update({ where: { id: a.id }, data: { personId: p.id, status: intent === 'link' ? 'INVITED' : 'DETAILS_MISSING' } });
    await tx.auditLog.create({ data: { actorId: me?.id ?? b.bookerId, action: a.personId ? 'ATTENDEE_SWAPPED' : 'ATTENDEE_ADDED', recordType: 'Booking', recordId: b.id, before: { personId: a.personId }, after: { personId: p.id, how: intent } } });
    return p;
  });
  if (!person) return bounce('duplicate');
  if (b.sessionId) await syncSessionMeeting(b.sessionId);
  if (intent === 'link') {
    await sendJoiningDetails(a.id);
    return bounce('linked');
  }
  redirect(`${registrationLink(a.id)}&for=1`);
}
