import { describe, expect, it } from 'vitest';

describe('in-person venues', async () => {
  const { db } = await import('@/lib/db');
  const { whereText, sendVenueChanged } = await import('@/lib/notifications');
  const { createPendingBooking, confirmCardBooking } = await import('@/lib/booking');
  const { course, booker } = await import('./fixtures');

  const venue = { id: 'v', name: 'Summit House', address: '33 Hanworth Road, Sunbury-on-Thames', postcode: 'TW16 5DA', directions: null, isClientSite: false };
  const session = { venue } as never;
  const c = (approvalRequired: boolean, venueRelease: 'ON_CONFIRMATION' | 'AFTER_APPROVAL') => ({ deliveryType: 'IN_PERSON', venueRelease, subject: { approvalRequired } }) as never;

  it('shows the address on confirmation unless approval or registration is needed first', () => {
    expect(whereText(c(false, 'ON_CONFIRMATION'), session)).toContain('TW16 5DA');
    expect(whereText(c(true, 'ON_CONFIRMATION'), session)).toBe('Summit House (full address once your registration is approved)');
    expect(whereText(c(false, 'AFTER_APPROVAL'), session)).not.toContain('TW16');
    expect(whereText(c(true, 'ON_CONFIRMATION'), session, true)).toContain('TW16 5DA');
  });

  it('emails everyone booked once when the venue changes, without leaking a held-back address', async () => {
    const { course: crs, session: s, subject } = await course({ delivery: 'IN_PERSON', capacity: 5 });
    await db.subject.update({ where: { id: subject.id }, data: { approvalRequired: true } });
    const v = await db.venue.create({ data: { name: 'Client site', address: '1 Works Lane, Reading', postcode: 'RG1 1AA' } });
    await db.session.update({ where: { id: s!.id }, data: { venueId: v.id } });
    const b = await createPendingBooking({ courseId: crs.id, sessionId: s!.id, places: 2, booker: booker(), bookerAttends: true, others: [{ name: 'Alex Swap', email: `alex.${Date.now()}@example.com` }] });
    await confirmCardBooking(b.id, `pi_${b.id}`);
    await sendVenueChanged(s!.id);
    const logs = await db.emailLog.findMany({ where: { trigger: `VENUE_CHANGED:${s!.id}` } });
    expect(logs).toHaveLength(2); // booker (also attending) and Alex, once each
  });
});
