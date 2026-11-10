import { describe, expect, it } from 'vitest';

describe('trainer app', async () => {
  const { db } = await import('@/lib/db');
  const { saveAttendance, saveAvailability, flagConflict, TrainerRuleError } = await import('@/lib/trainer-app');
  const { createPendingBooking, confirmCardBooking } = await import('@/lib/booking');
  const { course, booker } = await import('./fixtures');

  async function setup(startOffsetDays: number) {
    const id = Math.random().toString(36).slice(2, 10);
    const trainer = await db.person.create({ data: { email: `t.${id}@example.com`, firstName: 'Dan', lastName: 'Hughes', roles: ['TRAINER'], trainerProfile: { create: { status: 'APPROVED' } } } });
    const other = await db.person.create({ data: { email: `o.${id}@example.com`, firstName: 'Aisha', lastName: 'Khan', roles: ['TRAINER'] } });
    const { course: c, session } = await course({ delivery: 'IN_PERSON', capacity: 5 });
    const b = await createPendingBooking({ courseId: c.id, sessionId: session!.id, places: 2, booker: booker(), bookerAttends: true, others: [{ name: 'Alex Swap', email: `alex.${id}@example.com` }] });
    await confirmCardBooking(b.id, `pi_${b.id}`);
    const start = new Date(Date.now() + startOffsetDays * 86400000);
    await db.session.update({ where: { id: session!.id }, data: { trainerId: trainer.id, startsAt: start, endsAt: new Date(start.getTime() + 8 * 3600000) } });
    const atts = await db.attendee.findMany({ where: { bookingId: b.id } });
    return { trainer, other, sessionId: session!.id, atts };
  }

  it('only the assigned trainer marks attendance, from the first day, and the office gets one certificate task', async () => {
    const s = await setup(0);
    const marks = { [s.atts[0].id]: 'ATTENDED', [s.atts[1].id]: 'NO_SHOW' } as const;
    await expect(saveAttendance(s.other.id, s.sessionId, marks)).rejects.toBeInstanceOf(TrainerRuleError);
    const r = await saveAttendance(s.trainer.id, s.sessionId, marks);
    expect(r).toEqual({ attended: 1, total: 2, marked: 2 });
    await saveAttendance(s.trainer.id, s.sessionId, { [s.atts[1].id]: 'ATTENDED' }); // correcting a mark
    expect((await db.attendee.findUniqueOrThrow({ where: { id: s.atts[1].id } })).status).toBe('ATTENDED');
    expect(await db.task.count({ where: { type: 'CERTIFICATE_UPLOAD', recordId: s.sessionId, status: 'OPEN' } })).toBe(1);
  });

  it('attendance does not open before the session starts', async () => {
    const s = await setup(5);
    await expect(saveAttendance(s.trainer.id, s.sessionId, { [s.atts[0].id]: 'ATTENDED' })).rejects.toThrow(/first day/);
  });

  it('a conflict becomes a task; availability replaces the month', async () => {
    const s = await setup(10);
    await flagConflict(s.trainer.id, s.sessionId, 'On another job that week');
    expect(await db.task.count({ where: { type: 'TRAINER_CONFLICT', recordId: s.sessionId } })).toBe(1);
    const next = new Date(); next.setUTCMonth(next.getUTCMonth() + 1);
    const ym = next.toISOString().slice(0, 7);
    expect(await saveAvailability(s.trainer.id, ym, [`${ym}-03`, `${ym}-04`, `${ym}-04`, '1999-01-01'], '08:00', '17:00')).toBe(2);
    expect(await saveAvailability(s.trainer.id, ym, [`${ym}-10`], '09:00', '16:00')).toBe(1);
    const rows = await db.availability.findMany({ where: { personId: s.trainer.id } });
    expect(rows.map((r) => r.date.toISOString().slice(0, 10))).toEqual([`${ym}-10`]);
    await expect(saveAvailability(s.trainer.id, ym, [], '17:00', '08:00')).rejects.toBeInstanceOf(TrainerRuleError);
  });
});
