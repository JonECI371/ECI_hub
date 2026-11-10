import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { createPendingBooking, confirmCardBooking } from '@/lib/booking';
import { cancelSessionMeeting, syncSessionMeeting } from '@/lib/integrations/teams';
import { course } from './fixtures';

type Call = { url: string; method: string; body?: Record<string, unknown> };

describe('Teams meetings', () => {
  let calls: Call[];
  let failWith: number | null;
  beforeEach(() => {
    Object.assign(process.env, { MS_TENANT_ID: 't', MS_CLIENT_ID: 'c', MS_CLIENT_SECRET: 's', MS_MEETING_HOST: 'host@ecfio.co.uk', MS_INVITE_ALLOWLIST: '@ecfio.co.uk' });
    calls = [];
    failWith = null;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method: String(init.method), body });
      if (failWith) return new Response(JSON.stringify({ error: { code: 'ErrorAccessDenied', message: 'no' } }), { status: failWith });
      if (url.endsWith('/cancel')) return new Response(null, { status: 202 });
      return new Response(JSON.stringify({ id: 'evt1', onlineMeeting: { joinUrl: 'https://teams.example/join' } }), { status: init.method === 'POST' ? 201 : 200 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  async function bookedSession(emails: string[]) {
    const { course: c, session } = await course({ capacity: 10 });
    for (const email of emails) {
      const b = await createPendingBooking({ courseId: c.id, sessionId: session!.id, places: 1, booker: { firstName: 'A', lastName: 'B', email, marketingOptIn: false }, bookerAttends: true, others: null });
      await confirmCardBooking(b.id, `pi_${b.id}`);
    }
    return session!;
  }

  it('creates one meeting, invites only allow-listed people while testing, then updates it', async () => {
    const s = await bookedSession([`in${Date.now()}@ecfio.co.uk`, `out${Date.now()}@gmail.com`]);
    await syncSessionMeeting(s.id);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('/users/host%40ecfio.co.uk/events');
    const invited = (calls[0].body!.attendees as { emailAddress: { address: string } }[]).map((a) => a.emailAddress.address);
    expect(invited).toHaveLength(1);
    expect(invited[0]).toMatch(/@ecfio\.co\.uk$/);
    const saved = await db.session.findUniqueOrThrow({ where: { id: s.id } });
    expect(saved.meetingId).toBe('evt1');
    expect(saved.joinUrl).toBe('https://teams.example/join');

    await syncSessionMeeting(s.id);
    expect(calls[1].method).toBe('PATCH');

    await cancelSessionMeeting(s.id);
    expect(calls[2].url).toMatch(/\/events\/evt1\/cancel$/);
    expect((await db.session.findUniqueOrThrow({ where: { id: s.id } })).meetingId).toBeNull();
  });

  it('raises a task instead of failing the booking when Microsoft refuses', async () => {
    const s = await bookedSession([`x${Date.now()}@ecfio.co.uk`]);
    failWith = 403;
    await expect(syncSessionMeeting(s.id)).resolves.toBeUndefined();
    expect(await db.task.count({ where: { type: 'INTEGRATION_FAILURE', recordId: s.id } })).toBe(1);
  });
});
