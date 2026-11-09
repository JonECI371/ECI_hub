import 'server-only';
import { db } from '@/lib/db';
import { SITE_URL } from '@/lib/format';

/**
 * Teams meetings through Microsoft Graph (app-only, client credentials).
 * One calendar event with a Teams link per virtual session, in the host mailbox's calendar.
 * Outlook sends the invites, updates and cancellations to everyone on it.
 *
 * Env: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_MEETING_HOST (default host mailbox),
 * MS_INVITE_ALLOWLIST (optional, comma-separated emails or @domains; outside production only
 * these get invites, so test bookings never email real people).
 * Every failure creates an INTEGRATION_FAILURE task instead of breaking the booking.
 */

const GRAPH = 'https://graph.microsoft.com/v1.0';
let cached: { token: string; exp: number } | null = null;

export const teamsConfigured = () => !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);

async function token(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60000) return cached.token;
  const res = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.MS_CLIENT_ID!, client_secret: process.env.MS_CLIENT_SECRET!, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw new Error(`Microsoft sign-in failed (${res.status})`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

async function graph(method: string, path: string, body?: unknown, attempt = 1): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  // Retry throttling and transient errors, safely: creates are only retried before Graph accepted them.
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await new Promise((r) => setTimeout(r, Number(res.headers.get('retry-after') ?? 2) * 1000 * attempt));
    return graph(method, path, body, attempt + 1);
  }
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    throw new Error(`Graph ${method} ${path.split('?')[0]} ${res.status}: ${e.error?.code ?? ''} ${e.error?.message?.slice(0, 200) ?? ''}`);
  }
  return res.status === 204 || res.status === 202 ? {} : ((await res.json()) as Record<string, unknown>);
}

function allowed(email: string): boolean {
  if (process.env.NODE_ENV === 'production' && !process.env.MS_INVITE_ALLOWLIST) return true;
  const list = (process.env.MS_INVITE_ALLOWLIST ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const e = email.toLowerCase();
  return list.some((x) => (x.startsWith('@') ? e.endsWith(x) : e === x));
}

async function fail(sessionId: string, what: string, err: unknown) {
  const msg = (err as Error).message ?? String(err);
  console.error(`[teams] ${what} failed for session ${sessionId}: ${msg}`);
  const open = await db.task.findFirst({ where: { type: 'INTEGRATION_FAILURE', recordType: 'Session', recordId: sessionId, status: 'OPEN', title: { startsWith: 'Teams' } } });
  if (!open) {
    await db.task.create({ data: { type: 'INTEGRATION_FAILURE', title: `Teams invite not sent: ${what}`, detail: msg, recordType: 'Session', recordId: sessionId } });
  }
}

/**
 * Creates or updates the session's Teams meeting so it matches the session now:
 * date, time, and everyone who should be on it (confirmed attendees, their bookers, the trainer).
 * Safe to call after any change; does nothing for sessions that are not virtual Teams sessions.
 */
export async function syncSessionMeeting(sessionId: string): Promise<void> {
  const s = await db.session.findUnique({
    where: { id: sessionId },
    include: { course: true, trainer: true, bookings: { where: { status: 'CONFIRMED' }, include: { booker: true, attendees: { where: { status: { not: 'CANCELLED' } }, include: { person: true } } } } },
  });
  if (!s || s.course.deliveryType !== 'VIRTUAL_CLASSROOM' || (s.course.meetingPlatform ?? 'TEAMS') !== 'TEAMS') return;
  if (!teamsConfigured()) return;
  if (s.status === 'CANCELLED') return cancelSessionMeeting(sessionId);
  if (s.status !== 'PUBLISHED' && s.status !== 'FULL' && s.status !== 'RUNNING') return;

  const host = s.course.meetingHost || process.env.MS_MEETING_HOST;
  if (!host) return fail(sessionId, 'no host mailbox set', new Error('Set a host mailbox on the course or MS_MEETING_HOST.'));

  const people = new Map<string, string>();
  for (const b of s.bookings) {
    people.set(b.booker.email.toLowerCase(), `${b.booker.firstName} ${b.booker.lastName}`);
    for (const a of b.attendees) if (a.person) people.set(a.person.email.toLowerCase(), `${a.person.firstName} ${a.person.lastName}`);
  }
  if (s.trainer) people.set(s.trainer.email.toLowerCase(), `${s.trainer.firstName} ${s.trainer.lastName}`);
  people.delete(host.toLowerCase());
  const attendees = [...people].filter(([email]) => allowed(email)).map(([address, name]) => ({ emailAddress: { address, name }, type: 'required' }));

  const event = {
    subject: `${s.course.title} (ECI-Hub)`,
    body: {
      contentType: 'HTML',
      content: `<p>Your ECI-Hub course: <b>${s.course.title}</b>.</p><p>Join with the Teams link in this invite. Please join 10 minutes early with your camera working.</p><p>Manage your booking: <a href="${SITE_URL}/account">${SITE_URL}/account</a></p>`,
    },
    start: { dateTime: s.startsAt.toISOString().replace('Z', ''), timeZone: 'UTC' },
    end: { dateTime: s.endsAt.toISOString().replace('Z', ''), timeZone: 'UTC' },
    attendees,
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    allowNewTimeProposals: false,
    isReminderOn: true,
    reminderMinutesBeforeStart: 60,
    responseRequested: false,
  };
  const path = `/users/${encodeURIComponent(host)}/events`;
  try {
    if (s.meetingId) {
      const ev = await graph('PATCH', `${path}/${encodeURIComponent(s.meetingId)}`, event);
      const join = (ev.onlineMeeting as { joinUrl?: string } | undefined)?.joinUrl;
      if (join && join !== s.joinUrl) await db.session.update({ where: { id: s.id }, data: { joinUrl: join } });
    } else {
      const ev = await graph('POST', path, event);
      const join = (ev.onlineMeeting as { joinUrl?: string } | undefined)?.joinUrl ?? null;
      await db.session.update({ where: { id: s.id }, data: { meetingId: String(ev.id), joinUrl: join } });
      await db.auditLog.create({ data: { action: 'TEAMS_MEETING_CREATED', recordType: 'Session', recordId: s.id, after: { host, attendees: attendees.length } } });
    }
  } catch (err) {
    await fail(sessionId, s.meetingId ? 'update' : 'create', err);
  }
}

/** Cancels the session's meeting; Outlook tells everyone on it. */
export async function cancelSessionMeeting(sessionId: string, comment = 'This session has been cancelled. ECI-Hub will be in touch about other dates.'): Promise<void> {
  const s = await db.session.findUnique({ where: { id: sessionId }, include: { course: true } });
  if (!s?.meetingId || !teamsConfigured()) return;
  const host = s.course.meetingHost || process.env.MS_MEETING_HOST;
  try {
    await graph('POST', `/users/${encodeURIComponent(host!)}/events/${encodeURIComponent(s.meetingId)}/cancel`, { comment });
    await db.session.update({ where: { id: s.id }, data: { meetingId: null, joinUrl: null } });
    await db.auditLog.create({ data: { action: 'TEAMS_MEETING_CANCELLED', recordType: 'Session', recordId: s.id } });
  } catch (err) {
    await fail(sessionId, 'cancel', err);
  }
}
