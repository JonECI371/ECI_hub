import 'server-only';
import { sign, verify } from '@/lib/auth';

/** Signed registration link for one attendee: works from the email without logging in, for 60 days. */
export const registrationLink = (attendeeId: string) =>
  `/register/${attendeeId}?t=${encodeURIComponent(sign({ aid: attendeeId, exp: Date.now() + 60 * 86400000 }))}`;

export const registrationTokenOk = (attendeeId: string, token: string | undefined) =>
  verify<{ aid: string; exp: number }>(token)?.aid === attendeeId;
