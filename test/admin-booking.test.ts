import { describe, expect, it } from 'vitest';

describe('Admin add booking (ADM-12)', async () => {
  const { db } = await import('@/lib/db');
  const { createAdminBooking, AdminWarnings, PAY_LINK_HOURS } = await import('@/lib/admin-booking');
  const { availableCredit } = await import('@/lib/credit');
  const { CheckoutError } = await import('@/lib/booking');
  const { course } = await import('./fixtures');

  /** An active account with one booker. Course £185 + 20% VAT = £222 a place. */
  async function setup(opts: { limit?: number; poRule?: string; status?: 'ACTIVE' | 'ON_HOLD'; capacity?: number } = {}) {
    const id = Math.random().toString(36).slice(2, 10);
    const person = await db.person.create({ data: { email: `ab.${id}@example.com`, firstName: 'Priya', lastName: 'Shah', roles: ['DELEGATE', 'BOOKER'] } });
    const account = await db.account.create({
      data: { company: `Acme ${id}`, companyNumber: `X${id}`, registeredAddress: 'x', accountsName: 'x', accountsEmail: 'x@example.com', creditLimitPence: opts.limit ?? 100000, poRule: opts.poRule ?? 'NONE', status: opts.status ?? 'ACTIVE',
        members: { create: { personId: person.id, role: 'MAIN_BOOKER', status: 'ACTIVE' } } },
    });
    const admin = await db.person.create({ data: { email: `admin.${id}@example.com`, firstName: 'Ann', lastName: 'Admin', roles: ['ADMIN'] } });
    const { course: c, session } = await course({ capacity: opts.capacity ?? 10 });
    return { person, account, admin, c, session: session! };
  }
  const base = (s: Awaited<ReturnType<typeof setup>>) => ({ actorId: s.admin.id, person: { id: s.person.id }, courseId: s.c.id, sessionId: s.session.id, places: 1, bookerAttends: true });

  it('books on account, adds a statement line and audits who did it', async () => {
    const s = await setup();
    const { booking } = await createAdminBooking({ ...base(s), method: 'ACCOUNT', poNumber: 'PO-9' });
    expect(booking.status).toBe('CONFIRMED');
    expect(booking.method).toBe('ACCOUNT');
    expect(booking.accountId).toBe(s.account.id);
    expect(await availableCredit(db, s.account)).toBe(100000 - 22200);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: 'ADMIN_BOOKING_CREATED', recordId: booking.id } });
    expect(log.actorId).toBe(s.admin.id);
  });

  it('refuses a booking over the credit limit with a warning, saves nothing, and only saves with an override reason', async () => {
    const s = await setup({ limit: 10000 });
    const err = await createAdminBooking({ ...base(s), method: 'ACCOUNT' }).catch((e) => e);
    expect(err).toBeInstanceOf(AdminWarnings);
    expect((err as InstanceType<typeof AdminWarnings>).warnings.map((w) => w.code)).toEqual(['CREDIT']);
    expect(await db.booking.count({ where: { bookerId: s.person.id } })).toBe(0);
    const { booking } = await createAdminBooking({ ...base(s), method: 'ACCOUNT', override: { reason: 'Director agreed on the phone' } });
    expect(booking.status).toBe('CONFIRMED');
    const log = await db.auditLog.findFirstOrThrow({ where: { action: 'ADMIN_BOOKING_CREATED', recordId: booking.id } });
    expect(log.after).toMatchObject({ overridden: ['CREDIT'], overrideReason: 'Director agreed on the phone' });
  });

  it('warns for a full date, a missing PO and an account on hold, all at once', async () => {
    const s = await setup({ capacity: 1, poRule: 'PER_BOOKING', status: 'ON_HOLD' });
    await createAdminBooking({ ...base(s), method: 'PAID', note: 'Bank transfer' }); // takes the only place
    const err = await createAdminBooking({ ...base(s), method: 'ACCOUNT' }).catch((e) => e);
    expect(err).toBeInstanceOf(AdminWarnings);
    expect((err as InstanceType<typeof AdminWarnings>).warnings.map((w) => w.code).sort()).toEqual(['CAPACITY', 'ON_HOLD', 'PO_MISSING']);
  });

  it('a person who is not on a credit account cannot be booked on account, override or not', async () => {
    const s = await setup();
    const other = await db.person.create({ data: { email: `nobody.${Math.random().toString(36).slice(2)}@example.com`, firstName: 'No', lastName: 'Account' } });
    await expect(createAdminBooking({ ...base(s), person: { id: other.id }, method: 'ACCOUNT', override: { reason: 'try it' } })).rejects.toBeInstanceOf(CheckoutError);
  });

  it('a card link holds the places for 72 hours and emails a payment link', async () => {
    const s = await setup();
    const { booking, token } = await createAdminBooking({ ...base(s), method: 'CARD_LINK' });
    expect(booking.status).toBe('PAYMENT_PENDING');
    expect(booking.method).toBe('CARD');
    const hours = (booking.holdExpiresAt!.getTime() - Date.now()) / 3600000;
    expect(hours).toBeGreaterThan(PAY_LINK_HOURS - 0.1);
    expect(token).toBeTruthy();
    const mail = await db.emailLog.findFirst({ where: { to: s.person.email, trigger: 'PAYMENT_LINK' } });
    expect(mail).toBeTruthy();
  });

  it('already paid is confirmed as a manual payment with a payment row and the note audited', async () => {
    const s = await setup();
    const { booking } = await createAdminBooking({ ...base(s), method: 'PAID', paidHow: 'CASH', note: 'Cash taken at the desk' });
    expect(booking.status).toBe('CONFIRMED');
    expect(booking.method).toBe('MANUAL');
    const pay = await db.payment.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(pay.amountPence).toBe(22200);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: 'ADMIN_BOOKING_CREATED', recordId: booking.id } });
    expect(log.after).toMatchObject({ paidHow: 'CASH', note: 'Cash taken at the desk' });
    expect(pay.note).toBe('Cash: Cash taken at the desk');
    expect(await db.xeroJob.count({ where: { kind: 'CARD_INVOICE', recordId: booking.id } })).toBe(1); // the paid invoice is queued for Xero
  });

  it('adds a new person when the email is not known', async () => {
    const s = await setup();
    const email = `new.${Math.random().toString(36).slice(2)}@example.com`;
    const { booker } = await createAdminBooking({ ...base(s), person: { firstName: 'Neil', lastName: 'New', email }, method: 'PAID', note: 'Bank transfer' });
    expect(booker.email).toBe(email);
  });
});
