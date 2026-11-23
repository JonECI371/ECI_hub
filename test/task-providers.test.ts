import { describe, expect, it } from 'vitest';

describe('enrolment task providers', async () => {
  const { db } = await import('@/lib/db');
  const { enrolmentProviders, attendeeIdsForProvider } = await import('@/lib/task-providers');
  const { course, booker } = await import('./fixtures');
  const { createPendingBooking, confirmCardBooking } = await import('@/lib/booking');

  async function enrolment(provider: string) {
    const { course: c } = await course({ delivery: 'ELEARNING' });
    await db.course.update({ where: { id: c.id }, data: { provider, fulfilment: 'ADMIN_TASK' } });
    const b = await createPendingBooking({ courseId: c.id, sessionId: null, places: 1, booker: booker(), bookerAttends: true, others: null });
    await confirmCardBooking(b.id, `pi_${b.id}`);
    const a = await db.attendee.findFirstOrThrow({ where: { bookingId: b.id } });
    await db.task.create({ data: { type: 'ELEARNING_ENROLMENT', title: `Enrol on ${provider}`, recordType: 'Attendee', recordId: a.id } });
    return a.id;
  }

  it('lists each provider with its open enrolment tasks and finds the right people for a filter', async () => {
    const tag = Math.random().toString(36).slice(2, 7);
    const a1 = await enrolment(`Prov A ${tag}`);
    const a2 = await enrolment(`Prov B ${tag}`);
    const a3 = await enrolment(`Prov B ${tag}`);
    const list = await enrolmentProviders();
    expect(list.find((x) => x.provider === `Prov A ${tag}`)?.open).toBe(1);
    expect(list.find((x) => x.provider === `Prov B ${tag}`)?.open).toBe(2);
    expect(await attendeeIdsForProvider(`Prov A ${tag}`)).toEqual([a1]);
    expect((await attendeeIdsForProvider(`Prov B ${tag}`)).sort()).toEqual([a2, a3].sort());
  });

  it('keeps a provider in the list after its tasks are done', async () => {
    const tag = Math.random().toString(36).slice(2, 7);
    const a = await enrolment(`Prov C ${tag}`);
    await db.task.updateMany({ where: { recordId: a }, data: { status: 'DONE', doneAt: new Date() } });
    expect((await enrolmentProviders()).find((x) => x.provider === `Prov C ${tag}`)?.open).toBe(0);
  });
});
