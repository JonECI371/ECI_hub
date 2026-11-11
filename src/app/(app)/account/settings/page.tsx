import type { Metadata } from 'next';
import { requirePerson } from '@/lib/auth';
import { saveMyDetails, signOutEverywhere } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings', robots: { index: false } };

const input = 'box-border h-[46px] w-full rounded-control border border-field bg-white px-3.5 text-[15px] text-ink';
const label = 'flex flex-col gap-1.5 text-sm font-bold text-ink';

export default async function Settings({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const me = await requirePerson();
  const { msg } = await searchParams;
  return (
    <>
      <h1 className="text-[30px] font-extrabold tracking-tight text-ink">Settings</h1>
      {msg === 'saved' && <p role="status" className="rounded-control bg-cyan-soft px-4 py-3 text-sm font-semibold text-ink">Your details are saved.</p>}
      {msg === 'invalid' && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">Check your details: names are required and the mobile number can only contain digits and spaces.</p>}
      <section className="max-w-[760px] rounded-card bg-white p-6 shadow-card md:p-8" aria-labelledby="me-h">
        <h2 id="me-h" className="mb-5 text-[22px] font-extrabold text-ink">My details</h2>
        <form action={saveMyDetails} className="grid gap-4 sm:grid-cols-2">
          <label className={label}>First name<input name="firstName" required defaultValue={me.firstName} autoComplete="given-name" className={input} /></label>
          <label className={label}>Last name<input name="lastName" required defaultValue={me.lastName === '-' ? '' : me.lastName} autoComplete="family-name" className={input} /></label>
          <label className={label}>Email<input value={me.email} readOnly className={`${input} bg-page`} /><span className="text-[13px] font-normal">To change your email, contact us.</span></label>
          <label className={label}>Mobile<input name="mobile" type="tel" defaultValue={me.mobile ?? ''} autoComplete="tel" className={input} /></label>
          <label className={`${label} sm:col-span-2`}>Employer<input name="employer" defaultValue={me.employer ?? ''} autoComplete="organization" className={input} /></label>
          <label className="flex cursor-pointer items-start gap-3 text-[15px] text-ink sm:col-span-2">
            <input type="checkbox" name="marketing" defaultChecked={me.marketingOptIn} className="mt-0.5 size-[22px] shrink-0 accent-ink" />
            <span>Send me news about courses and offers</span>
          </label>
          <div className="sm:col-span-2"><button type="submit" className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-6 font-bold text-ink">Save my details</button></div>
        </form>
      </section>
      <section className="max-w-[760px] rounded-card bg-white p-6 shadow-card md:p-8" aria-labelledby="sec-h">
        <h2 id="sec-h" className="mb-2 text-[22px] font-extrabold text-ink">Signing in</h2>
        <p className="mb-4 text-sm">You sign in with a code or link sent to your email. There is no password to manage. If you lost a device or used a shared computer, sign out everywhere: every browser you are signed in on stops working, including this one.</p>
        <form action={signOutEverywhere}><button type="submit" className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-5 text-sm font-bold text-ink">Sign out of all devices</button></form>
      </section>
    </>
  );
}
