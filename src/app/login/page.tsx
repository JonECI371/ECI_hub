import Link from 'next/link';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { enrolSecret, pendingMfa, safeNext, verify } from '@/lib/auth';
import { otpauthUri } from '@/lib/totp';
import { requestCode, useDifferentEmail, verifyCode, verifyStaffCode, type LoginState } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Log in', robots: { index: false } };

type Search = Promise<{ step?: string; error?: string; next?: string }>;

const ERRORS: Record<string, string> = {
  email: 'Enter a valid email address, like name@company.co.uk.',
  wrong: 'That code is not right. Check the email and try again.',
  expired: 'That code or link has expired. Ask for a new code.',
  locked: 'Too many wrong codes. Ask for a new code.',
  toomany: 'You have asked for several codes in a short time. Wait 15 minutes, then try again.',
};

const field = 'box-border h-[46px] w-full rounded-control border border-field bg-white px-3.5 text-[15px] text-ink';
const codeField = `${field} !h-[60px] text-center text-[28px] tracking-[0.4em]`;
const primary = 'inline-flex min-h-[52px] w-full items-center justify-center rounded-chip bg-cyan px-5 text-base font-bold text-ink';

function Shell({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 justify-center px-4 pb-24 pt-12 md:pt-[72px]">
      <section className="w-full max-w-[460px] rounded-card bg-white p-7 shadow-card md:p-9">
        <p className="mb-2.5 text-xs font-extrabold uppercase tracking-[0.1em] text-ink">{eyebrow}</p>
        <h1 className="mb-2 text-[32px] font-extrabold text-ink">{title}</h1>
        <div className="mb-6 text-[15px] leading-relaxed">{intro}</div>
        {children}
      </section>
    </div>
  );
}

function ErrorMsg({ id, code }: { id: string; code?: string }) {
  if (!code || !ERRORS[code]) return null;
  return <p id={id} role="alert" className="mb-4 rounded-control bg-bad-bg px-3.5 py-3 text-sm font-semibold text-bad-fg">{ERRORS[code]}</p>;
}

export default async function LoginPage({ searchParams }: { searchParams: Search }) {
  const { step, error, next } = await searchParams;

  if (step === 'staff') {
    const mfa = await pendingMfa();
    if (mfa) {
      const person = await db.person.findUnique({ where: { id: mfa.pid } });
      const setup = person && !person.totpSecret;
      const secret = setup ? enrolSecret(person.id, mfa.exp) : null;
      const qr = secret && person ? await QRCode.toDataURL(otpauthUri(secret, person.email), { margin: 1, width: 180 }) : null;
      return (
        <Shell
          eyebrow="Staff and trainers"
          title={setup ? 'Set up your authenticator' : 'One more step'}
          intro={setup
            ? 'Admin and trainer accounts need an authenticator app, such as Microsoft Authenticator or Google Authenticator. Scan this code with the app, then enter the 6-digit code it shows.'
            : 'Admin and trainer accounts also need a code from your authenticator app.'}
        >
          <ErrorMsg id="staff-error" code={error} />
          {setup && qr && secret && (
            <div className="mb-6 flex flex-col items-center gap-3 rounded-control bg-page p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR code to add ECI-Hub to your authenticator app" width={180} height={180} />
              <p className="text-center text-[13px]">Cannot scan? Enter this key in the app:</p>
              <code className="break-all rounded-chip bg-white px-3 py-2 text-center font-mono text-sm tracking-wider text-ink">{secret.match(/.{1,4}/g)?.join(' ')}</code>
            </div>
          )}
          <form action={verifyStaffCode} className="flex flex-col gap-[18px]">
            <label className="flex flex-col gap-1.5 text-sm font-bold text-ink">
              Authenticator code
              <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required autoFocus aria-describedby={error ? 'staff-error' : undefined} className={codeField} />
            </label>
            <button type="submit" className={primary}>Log in</button>
          </form>
          <p className="mt-5 text-sm">Lost your device? Ask a Super Admin to reset it.</p>
        </Shell>
      );
    }
  }

  if (step === 'code') {
    const state = verify<LoginState>((await cookies()).get('eci_login')?.value);
    if (state) {
      return (
        <Shell eyebrow="Check your email" title="Enter your code" intro={<>We sent a code to {state.masked}. Or tap the link in the same email.</>}>
          {state.devCode && (
            <p className="mb-5 rounded-control bg-warn-bg px-3.5 py-3 text-sm text-warn-fg">
              <strong>Test mode:</strong> emails are not sent here. Your code is <strong className="font-mono text-base">{state.devCode}</strong>
            </p>
          )}
          <ErrorMsg id="code-error" code={error} />
          <form action={verifyCode} className="flex flex-col gap-[18px]">
            <label className="flex flex-col gap-1.5 text-sm font-bold text-ink">
              6-digit code
              <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required autoFocus placeholder="••••••" aria-describedby={error ? 'code-error code-help' : 'code-help'} className={codeField} />
              <span id="code-help" className="text-[13px] font-normal text-slate">Expires in 15 minutes.</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-normal text-ink">
              <input type="checkbox" name="trust" defaultChecked className="mt-0.5 size-[22px] shrink-0 accent-ink" />
              <span>Keep me logged in on this device for 30 days</span>
            </label>
            <button type="submit" className={primary}>Log in</button>
          </form>
          <div className="mt-5 flex justify-between gap-4 text-sm">
            <Link href={`/login?next=${encodeURIComponent(state.next)}`} className="inline-flex min-h-11 items-center">Send a new code</Link>
            <form action={useDifferentEmail}>
              <button type="submit" className="min-h-11 text-ink underline decoration-cyan decoration-2 underline-offset-[3px]">Use a different email</button>
            </form>
          </div>
        </Shell>
      );
    }
  }

  return (
    <Shell eyebrow="ECI-Hub account" title="Log in" intro="Enter your email and we'll send you a 6-digit code. No password to remember.">
      <ErrorMsg id="email-error" code={error} />
      <form action={requestCode} className="flex flex-col gap-[18px]">
        <input type="hidden" name="next" value={safeNext(next)} />
        <label className="flex flex-col gap-1.5 text-sm font-bold text-ink">
          Email address
          <input type="email" name="email" autoComplete="email" required autoFocus aria-describedby={error ? 'email-error' : undefined} className={field} />
        </label>
        <button type="submit" className={primary}>Send my code</button>
      </form>
      <p className="mt-[22px] text-sm leading-relaxed">New to ECI-Hub? Your account is created when you <Link href="/courses">book a course</Link>.</p>
    </Shell>
  );
}
