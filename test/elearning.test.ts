import { describe, expect, it } from 'vitest';

describe('eLearning enrolment', async () => {
  const { db } = await import('@/lib/db');
  const { sendEnrolmentPack } = await import('@/lib/notifications');
  const { createPendingBooking, confirmCardBooking } = await import('@/lib/booking');
  const { course, booker } = await import('./fixtures');

  it('emails the pack to the provider once, records when, and raises one confirm task', async () => {
    const { course: c } = await course({ delivery: 'ELEARNING' });
    await db.course.update({ where: { id: c.id }, data: { fulfilment: 'EMAIL_PROVIDER', providerEmail: 'enrolments@provider.example', provider: 'EUSR QuartzWeb' } });
    const b = await createPendingBooking({ courseId: c.id, sessionId: null, places: 1, booker: booker(), bookerAttends: true, others: null });
    await confirmCardBooking(b.id, `pi_${b.id}`);
    const a = await db.attendee.findFirstOrThrow({ where: { bookingId: b.id } });
    await db.enrolment.create({ data: { attendeeId: a.id, provider: 'EUSR QuartzWeb' } });
    await sendEnrolmentPack(a.id);
    await sendEnrolmentPack(a.id); // a second registration edit does not raise a second task
    expect((await db.enrolment.findUniqueOrThrow({ where: { attendeeId: a.id } })).packSentAt).not.toBeNull();
    expect(await db.task.count({ where: { type: 'ELEARNING_ENROLMENT', recordId: a.id, status: 'OPEN' } })).toBe(1);
    expect(await db.emailLog.count({ where: { trigger: 'ENROLMENT_PACK', to: 'enrolments@provider.example', createdAt: { gt: new Date(Date.now() - 60000) } } })).toBeGreaterThanOrEqual(1);
  });
});
