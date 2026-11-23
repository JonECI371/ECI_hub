import 'server-only';
import { sign, verify } from '@/lib/auth';

/** Staff, trainers and Admins sign in with the authenticator app alone. These are the rules around that. */
export const MAX_TOTP_FAILURES = 5;
export const TOTP_LOCK_MS = 15 * 60 * 1000;
export const SETUP_LINK_MS = 24 * 3600 * 1000;

export const isLocked = (lockedUntil: Date | null | undefined, now = Date.now()) => !!lockedUntil && lockedUntil.getTime() > now;

/** What to store after a wrong authenticator code: count it, and lock the sign-in at the limit (the count then starts again). */
export function afterWrongCode(failures: number, now = Date.now()): { totpFailures: number; totpLockedUntil: Date | null } {
  const next = failures + 1;
  return next >= MAX_TOTP_FAILURES ? { totpFailures: 0, totpLockedUntil: new Date(now + TOTP_LOCK_MS) } : { totpFailures: next, totpLockedUntil: null };
}

type SetupPayload = { pid: string; exp: number; purpose: 'staff-setup' };

/** One-time setup link for a new authenticator. It stops working once the person has set one up, and after 24 hours. */
export const setupToken = (personId: string, now = Date.now()) => sign({ pid: personId, exp: now + SETUP_LINK_MS, purpose: 'staff-setup' } satisfies SetupPayload);
export function readSetupToken(token: string | null | undefined): string | null {
  const p = verify<SetupPayload>(token ?? undefined);
  return p && p.purpose === 'staff-setup' ? p.pid : null;
}
