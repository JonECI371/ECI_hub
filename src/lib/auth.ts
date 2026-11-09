import 'server-only';
import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Person, Role } from '@prisma/client';
import { db } from '@/lib/db';
import { SITE_URL } from '@/lib/format';

const SESSION_COOKIE = 'eci_session';
const MFA_COOKIE = 'eci_mfa';
export const CODE_TTL_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
const TRUSTED_DAYS = 30;
const STAFF: Role[] = ['TRAINER', 'ADMIN', 'SUPER_ADMIN'];

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET must be set (32+ characters).');
  return s;
}
const secure = () => SITE_URL.startsWith('https://');

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString();
const mac = (data: string) => createHmac('sha256', secret()).update(data).digest('base64url');
function safeEq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Signed, expiring token: base64url(json).mac */
export function sign(payload: Record<string, unknown>): string {
  const body = b64(JSON.stringify(payload));
  return `${body}.${mac(body)}`;
}
export function verify<T extends { exp: number }>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig || !safeEq(sig, mac(body))) return null;
  try {
    const p = JSON.parse(unb64(body)) as T;
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

/** First-time authenticator secret, derived from the pending sign-in so nothing is stored until it is confirmed. */
export function enrolSecret(personId: string, mfaExp: number): string {
  const raw = createHmac('sha256', secret()).update(`enrol:${personId}:${mfaExp}`).digest().subarray(0, 20);
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const b of raw) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += A[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

export const isStaff = (roles: Role[]) => roles.some((r) => STAFF.includes(r));

// ---------- Codes ----------

export const hashCode = (codeId: string, code: string) => createHash('sha256').update(`${codeId}:${code}:${secret()}`).digest('hex');
/** Magic link token for a code: derived from the stored hash, so nothing extra is kept. */
export const linkToken = (codeId: string, codeHash: string) => mac(`link:${codeId}:${codeHash}`);
export const linkTokenOk = (codeId: string, codeHash: string, token: string) => safeEq(token, linkToken(codeId, codeHash));
export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

// ---------- Sessions ----------

type SessionPayload = { pid: string; exp: number; v: 1 };

export async function startSession(personId: string, trusted: boolean) {
  const exp = Date.now() + (trusted ? TRUSTED_DAYS * 86400000 : 12 * 3600000);
  (await cookies()).set(SESSION_COOKIE, sign({ pid: personId, exp, v: 1 }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: secure(),
    path: '/',
    ...(trusted ? { expires: new Date(exp) } : {}),
  });
}
export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(MFA_COOKIE);
}

/** The signed-in person, or null. Checked on the server for every request that needs it. */
export async function currentPerson(): Promise<Person | null> {
  const s = verify<SessionPayload>((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return null;
  return db.person.findUnique({ where: { id: s.pid } });
}

/** Require a signed-in person (optionally with one of the given roles); otherwise send them to log in. */
export async function requirePerson(roles?: Role[], next = '/account'): Promise<Person> {
  const p = await currentPerson();
  if (!p) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (roles && !p.roles.some((r) => roles.includes(r))) redirect('/no-access');
  return p;
}

// ---------- Staff second step ----------

type MfaPayload = { pid: string; exp: number; trust: boolean; next: string };

export async function startMfa(personId: string, trust: boolean, next: string) {
  (await cookies()).set(MFA_COOKIE, sign({ pid: personId, exp: Date.now() + 10 * 60000, trust, next }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: secure(),
    path: '/login',
  });
}
export async function pendingMfa(): Promise<MfaPayload | null> {
  return verify<MfaPayload>((await cookies()).get(MFA_COOKIE)?.value);
}
export async function clearMfa() {
  (await cookies()).delete({ name: MFA_COOKIE, path: '/login' });
}

/** Only allow same-site paths as a post-login destination. */
export function safeNext(next: string | undefined | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/account';
}
