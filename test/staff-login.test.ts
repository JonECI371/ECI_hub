import { describe, expect, it } from 'vitest';
import { MAX_TOTP_FAILURES, SETUP_LINK_MS, TOTP_LOCK_MS, afterWrongCode, isLocked, readSetupToken, setupToken } from '@/lib/staff-login';
import { sign } from '@/lib/auth';

describe('staff sign-in with the authenticator app alone', () => {
  it('counts wrong codes and locks for 15 minutes on the fifth, then starts counting again', () => {
    const now = 1_000_000;
    let failures = 0;
    for (let i = 1; i < MAX_TOTP_FAILURES; i++) {
      const r = afterWrongCode(failures, now);
      expect(r.totpLockedUntil).toBeNull();
      failures = r.totpFailures;
      expect(failures).toBe(i);
    }
    const last = afterWrongCode(failures, now);
    expect(last.totpLockedUntil?.getTime()).toBe(now + TOTP_LOCK_MS);
    expect(last.totpFailures).toBe(0);
  });

  it('is locked only until the lock time has passed', () => {
    const now = 5_000;
    expect(isLocked(null, now)).toBe(false);
    expect(isLocked(new Date(now + 1), now)).toBe(true);
    expect(isLocked(new Date(now), now)).toBe(false);
    expect(isLocked(new Date(now - 1), now)).toBe(false);
  });

  it('setup links name the person, last 24 hours and cannot be forged or reused as another kind of token', () => {
    const now = Date.now();
    const t = setupToken('person-1', now);
    expect(readSetupToken(t)).toBe('person-1');
    expect(readSetupToken(t.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')))).toBeNull();
    expect(readSetupToken(setupToken('person-1', now - SETUP_LINK_MS - 1000))).toBeNull(); // expired
    expect(readSetupToken(sign({ pid: 'person-1', exp: now + 60000, purpose: 'login' }))).toBeNull(); // wrong purpose
    expect(readSetupToken(sign({ pid: 'person-1', exp: now + 60000 }))).toBeNull();
    expect(readSetupToken(null)).toBeNull();
    expect(readSetupToken('garbage')).toBeNull();
  });
});
