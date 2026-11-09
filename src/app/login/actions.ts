'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { SITE_URL } from '@/lib/format';
import {
  CODE_TTL_MS, MAX_ATTEMPTS, clearMfa, enrolSecret, hashCode, linkToken, newCode, pendingMfa, safeNext, sign,
  startSession, verify,
} from '@/lib/auth';
import { finishFirstStep } from '@/lib/login';
import { verifyTotp } from '@/lib/totp';
import { emailLive, sendEmail } from '@/lib/integrations/email';

const LOGIN_COOKIE = 'eci_login';
export type LoginState = { cid: string | null; masked: string; next: string; devCode?: string; exp: number };

const mask = (email: string) => {
  const [u, d] = email.split('@');
  return `${u.slice(0, 1)}•••@${d}`;
};

/** Step 1: email in, code out. Unknown addresses get the same response, so the form never reveals who has an account. */
export async function requestCode(form: FormData) {
  const parsed = z.string().trim().toLowerCase().email().max(254).safeParse(form.get('email'));
  const next = safeNext(String(form.get('next') ?? ''));
  if (!parsed.success) redirect(`/login?error=email&next=${encodeURIComponent(next)}`);
  const email = parsed.data;

  const person = await db.person.findUnique({ where: { email } });
  let cid: string | null = null;
  let devCode: string | undefined;
  if (person) {
    // Rate limit: at most 5 live codes per person in any 15 minutes.
    const live = await db.loginCode.count({ where: { personId: person.id, expiresAt: { gt: new Date() } } });
    if (live >= 5) redirect(`/login?error=toomany&next=${encodeURIComponent(next)}`);
    const code = newCode();
    const row = await db.loginCode.create({ data: { personId: person.id, codeHash: 'pending', expiresAt: new Date(Date.now() + CODE_TTL_MS) } });
    const codeHash = hashCode(row.id, code);
    await db.loginCode.update({ where: { id: row.id }, data: { codeHash } });
    cid = row.id;
    const link = `${SITE_URL}/login/link?c=${row.id}&t=${linkToken(row.id, codeHash)}&next=${encodeURIComponent(next)}`;
    await sendEmail({
      to: email,
      personId: person.id,
      trigger: 'SIGN_IN_CODE',
      subject: `Your ECI-Hub code: ${code}`,
      text: `Your ECI-Hub sign-in code is ${code}. It expires in 15 minutes.\n\nOr sign in with this link: ${link}\n\nIf you did not ask for this, you can ignore this email.`,
    });
    if (!emailLive()) devCode = code;
  }
  const state: LoginState = { cid, masked: mask(email), next, devCode, exp: Date.now() + CODE_TTL_MS };
  (await cookies()).set(LOGIN_COOKIE, sign(state), { httpOnly: true, sameSite: 'lax', path: '/login', secure: SITE_URL.startsWith('https://') });
  redirect('/login?step=code');
}

/** Step 2: check the 6-digit code. */
export async function verifyCode(form: FormData) {
  const jar = await cookies();
  const state = verify<LoginState>(jar.get(LOGIN_COOKIE)?.value);
  if (!state) redirect('/login?error=expired');
  const code = String(form.get('code') ?? '').replace(/\D/g, '');
  const trust = form.get('trust') === 'on';
  if (!state.cid) redirect('/login?step=code&error=wrong');

  const row = await db.loginCode.findUnique({ where: { id: state.cid } });
  if (!row || row.usedAt || row.expiresAt < new Date()) redirect('/login?error=expired');
  if (row.attempts >= MAX_ATTEMPTS) redirect('/login?error=locked');
  if (hashCode(row.id, code) !== row.codeHash) {
    await db.loginCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    redirect(`/login?step=code&error=${row.attempts + 1 >= MAX_ATTEMPTS ? 'locked' : 'wrong'}`);
  }
  await db.loginCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  jar.delete({ name: LOGIN_COOKIE, path: '/login' });
  await finishFirstStep(row.personId, trust, state.next);
}

/** Step 3 (staff and trainers): authenticator code, or first-time set-up. */
export async function verifyStaffCode(form: FormData) {
  const mfa = await pendingMfa();
  if (!mfa) redirect('/login?error=expired');
  const code = String(form.get('code') ?? '').replace(/\D/g, '');
  const person = await db.person.findUniqueOrThrow({ where: { id: mfa.pid } });

  let secret = person.totpSecret;
  if (!secret) {
    secret = enrolSecret(person.id, mfa.exp);
    if (!verifyTotp(secret, code)) redirect('/login?step=staff&error=wrong');
    await db.person.update({ where: { id: person.id }, data: { totpSecret: secret } });
    await db.auditLog.create({ data: { actorId: person.id, action: 'TOTP_ENROLLED', recordType: 'Person', recordId: person.id } });
  } else if (!verifyTotp(secret, code)) {
    redirect('/login?step=staff&error=wrong');
  }
  await clearMfa();
  await startSession(person.id, mfa.trust);
  redirect(mfa.next.startsWith('/account') && person.roles.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN') ? '/admin' : mfa.next);
}

export async function useDifferentEmail() {
  (await cookies()).delete({ name: LOGIN_COOKIE, path: '/login' });
  redirect('/login');
}
