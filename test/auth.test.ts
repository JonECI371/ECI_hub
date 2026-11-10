import { describe, expect, it } from 'vitest';
import { safeNext, sign, verify } from '@/lib/auth';
import { totpAt, verifyTotp } from '@/lib/totp';

describe('signed tokens', () => {
  it('accept their own, reject tampered or expired ones', () => {
    const t = sign({ pid: 'abc', exp: Date.now() + 60000 });
    expect(verify<{ pid: string; exp: number }>(t)?.pid).toBe('abc');
    expect(verify(t.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')))).toBeNull();
    const [body, mac] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ pid: 'admin', exp: Date.now() + 60000 })).toString('base64url');
    expect(verify(`${forged}.${mac}`)).toBeNull();
    expect(verify(sign({ pid: 'x', exp: Date.now() - 1 }))).toBeNull();
    expect(body.length).toBeGreaterThan(0);
  });
  it('only allow same-site redirects after log-in', () => {
    expect(safeNext('/admin')).toBe('/admin');
    expect(safeNext('//evil.example')).toBe('/account');
    expect(safeNext('https://evil.example')).toBe('/account');
  });
});

describe('authenticator codes (RFC 6238)', () => {
  it('match the published test vector and allow one step of clock drift', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(totpAt(secret, 1)).toBe('287082');
    const now = 59000;
    expect(verifyTotp(secret, totpAt(secret, Math.floor(now / 30000)), now)).toBe(true);
    expect(verifyTotp(secret, '000000', now)).toBe(false);
    expect(verifyTotp(secret, 'abc', now)).toBe(false);
  });
});
