'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { applyForAccount, type ApplyState } from '@/app/(site)/accounts/apply/actions';

const input = 'box-border h-[46px] w-full rounded-control border border-field bg-white px-3.5 text-[15px] font-normal text-ink aria-[invalid=true]:border-2 aria-[invalid=true]:border-bad-fg';
const area = 'min-h-[88px] w-full rounded-control border border-field bg-white px-3.5 py-2.5 text-[15px] font-normal text-ink aria-[invalid=true]:border-2 aria-[invalid=true]:border-bad-fg';
const label = 'flex flex-col gap-1.5 text-sm font-bold text-ink';
const hint = 'text-[13px] font-normal text-slate';

function Step({ n, title, sub, children }: { n: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-hairline pt-6 first:border-0 first:pt-0">
      <legend className="mb-1 flex items-center gap-3 text-lg font-extrabold text-ink">
        <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-ink text-sm text-white">{n}</span>{title}
      </legend>
      {sub && <p className="mb-4 text-sm">{sub}</p>}
      <div className={`grid gap-4 sm:grid-cols-2 ${sub ? '' : 'mt-4'}`}>{children}</div>
    </fieldset>
  );
}

export function AccountApplicationForm({ industries }: { industries: string[] }) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyForAccount, {});
  const [others, setOthers] = useState(1);
  const [credit, setCredit] = useState('');
  const shown = Math.max(others, state.others ?? 1);
  const v = state.values ?? {};
  const f = state.fields ?? {};
  const err = (k: string) => (f[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-err` } : {});
  const E = ({ k }: { k: string }) => (f[k] ? <span id={`${k}-err`} className="text-[13px] font-semibold text-bad-fg">{f[k]}</span> : null);
  const creditValue = credit || v.creditLimit || '';

  if (state.ok) {
    return (
      <section role="status" className="rounded-card bg-white p-8 shadow-card">
        <p className="mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-slate">Application received</p>
        <h2 className="mb-2 text-[26px] font-extrabold text-ink">Thanks{state.firstName ? ` ${state.firstName}` : ''}, we&apos;re checking your application</h2>
        <p className="mb-6 leading-relaxed">You&apos;ll hear from us by email, usually within one working day.</p>
        <h3 className="mb-3 font-extrabold text-ink">What happens next</h3>
        <ol className="mb-6 flex flex-col gap-3">
          {[['We check', 'Companies House and a credit check.'], ['Account set up', 'We confirm your credit limit and set up invoicing.'], ['Sign-in links', 'You and your bookers get a link to start booking.']].map(([t, d], i) => (
            <li key={t} className="flex gap-3"><span className="font-extrabold text-ink">0{i + 1}</span><span><strong className="text-ink">{t}.</strong> {d}</span></li>
          ))}
        </ol>
        <Link href="/courses" className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-5 font-bold text-ink no-underline">Browse courses</Link>
      </section>
    );
  }

  return (
    <form action={action} noValidate className="flex flex-col gap-6 rounded-card bg-white p-6 shadow-card md:p-8">
      <div aria-hidden="true" className="absolute -left-[9999px]"><label>Leave blank<input name="url" tabIndex={-1} autoComplete="off" /></label></div>
      <input type="hidden" name="others" value={shown} />
      {state.error && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 font-semibold text-bad-fg">{state.error}</p>}

      <Step n={1} title="Company">
        <label className={`${label} sm:col-span-2`}>Company name<input name="company" autoComplete="organization" defaultValue={v.company} className={input} {...err('company')} /><E k="company" /></label>
        <label className={label}>Companies House number<input name="companyNumber" defaultValue={v.companyNumber} className={input} {...err('companyNumber')} /><span className={hint}>We check this automatically.</span><E k="companyNumber" /></label>
        <label className={label}>VAT number <span className="font-normal">(optional)</span><input name="vatNumber" defaultValue={v.vatNumber} className={input} /></label>
        <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-bold text-ink">Registered address</legend>
          <label className={`${label} sm:col-span-2`}>Address line 1<input name="reg_line1" autoComplete="address-line1" defaultValue={v.reg_line1} className={input} {...err('reg_line1')} /><E k="reg_line1" /></label>
          <label className={`${label} sm:col-span-2`}>Address line 2 <span className="font-normal">(optional)</span><input name="reg_line2" autoComplete="address-line2" defaultValue={v.reg_line2} className={input} /></label>
          <label className={label}>Town or city<input name="reg_town" autoComplete="address-level2" defaultValue={v.reg_town} className={input} {...err('reg_town')} /><E k="reg_town" /></label>
          <label className={label}>County <span className="font-normal">(optional)</span><input name="reg_county" defaultValue={v.reg_county} className={input} /></label>
          <label className={label}>Postcode<input name="reg_postcode" autoComplete="postal-code" defaultValue={v.reg_postcode} className={`${input} sm:max-w-[200px]`} {...err('reg_postcode')} /><E k="reg_postcode" /></label>
        </fieldset>
        <label className={label}>Website <span className="font-normal">(optional)</span><input name="website" type="url" inputMode="url" defaultValue={v.website} className={input} {...err('website')} /><E k="website" /></label>
        <label className={label}>Industry<select name="industry" defaultValue={v.industry ?? ''} className={input} {...err('industry')}><option value="" disabled>Choose…</option>{industries.map((i) => <option key={i}>{i}</option>)}</select><E k="industry" /></label>
      </Step>

      <Step n={2} title="You, the main booker">
        <label className={label}>First name<input name="firstName" autoComplete="given-name" defaultValue={v.firstName} className={input} {...err('firstName')} /><E k="firstName" /></label>
        <label className={label}>Last name<input name="lastName" autoComplete="family-name" defaultValue={v.lastName} className={input} {...err('lastName')} /><E k="lastName" /></label>
        <label className={label}>Work email<input name="email" type="email" autoComplete="email" defaultValue={v.email} className={input} {...err('email')} /><span className={hint}>Your sign-in link goes here once approved.</span><E k="email" /></label>
        <label className={label}>Phone<input name="phone" type="tel" autoComplete="tel" defaultValue={v.phone} className={input} {...err('phone')} /><E k="phone" /></label>
        <label className={label}>Job title<input name="jobTitle" autoComplete="organization-title" defaultValue={v.jobTitle} className={input} {...err('jobTitle')} /><E k="jobTitle" /></label>
      </Step>

      <Step n={3} title="Other bookers (optional)" sub="People who can book on the account. You can add more later.">
        {Array.from({ length: shown }, (_, i) => (
          <div key={i} className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
            <label className={label}>Name<input name={`other_name_${i}`} defaultValue={v[`other_name_${i}`]} className={input} {...err(`other_name_${i}`)} /><E k={`other_name_${i}`} /></label>
            <label className={label}>Email<input name={`other_email_${i}`} type="email" defaultValue={v[`other_email_${i}`]} className={input} {...err(`other_email_${i}`)} /><E k={`other_email_${i}`} /></label>
            <label className={label}>Job title <span className="font-normal">(optional)</span><input name={`other_job_${i}`} defaultValue={v[`other_job_${i}`]} className={input} /></label>
          </div>
        ))}
        {shown < 10 && <button type="button" onClick={() => setOthers(shown + 1)} className="inline-flex min-h-11 w-fit items-center rounded-chip border border-field bg-white px-4 text-sm font-bold text-ink">+ Add another booker</button>}
      </Step>

      <Step n={4} title="Billing and credit" sub="We bill once a month for everything booked that month, on 30-day terms.">
        <label className={label}>Accounts contact name<input name="accountsName" defaultValue={v.accountsName} className={input} {...err('accountsName')} /><E k="accountsName" /></label>
        <label className={label}>Accounts email<input name="accountsEmail" type="email" defaultValue={v.accountsEmail} className={input} {...err('accountsEmail')} /><span className={hint}>Monthly invoices are sent here.</span><E k="accountsEmail" /></label>
        <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-bold text-ink">Invoice address <span className="font-normal">(only if different from the registered address)</span></legend>
          <label className={`${label} sm:col-span-2`}>Address line 1<input name="inv_line1" defaultValue={v.inv_line1} className={input} /></label>
          <label className={`${label} sm:col-span-2`}>Address line 2 <span className="font-normal">(optional)</span><input name="inv_line2" defaultValue={v.inv_line2} className={input} /></label>
          <label className={label}>Town or city<input name="inv_town" defaultValue={v.inv_town} className={input} {...err('inv_town')} /><E k="inv_town" /></label>
          <label className={label}>County <span className="font-normal">(optional)</span><input name="inv_county" defaultValue={v.inv_county} className={input} /></label>
          <label className={label}>Postcode<input name="inv_postcode" defaultValue={v.inv_postcode} className={`${input} sm:max-w-[200px]`} {...err('inv_postcode')} /><E k="inv_postcode" /></label>
        </fieldset>
        <label className={label}>Accounts phone <span className="font-normal">(optional)</span><input name="accountsPhone" type="tel" defaultValue={v.accountsPhone} className={input} {...err('accountsPhone')} /><E k="accountsPhone" /></label>
        <label className={label}>Credit limit requested
          <select name="creditLimit" value={creditValue} onChange={(e) => setCredit(e.target.value)} className={input} {...err('creditLimit')}>
            <option value="" disabled>Choose…</option><option value="2500">£2,500</option><option value="5000">£5,000</option><option value="10000">£10,000</option><option value="25000">£25,000</option><option value="other">Other</option>
          </select><E k="creditLimit" />
        </label>
        {creditValue === 'other' ? (
          <label className={label}>Amount (£)<input name="creditOther" inputMode="numeric" defaultValue={v.creditOther} className={input} {...err('creditOther')} /><E k="creditOther" /></label>
        ) : <span className="hidden sm:block" />}
        <label className={label}>Do invoices need a PO number?
          <select name="poRule" defaultValue={v.poRule ?? 'NONE'} className={input} {...err('poRule')}><option value="NONE">No</option><option value="PER_BOOKING">Yes, one PO per booking</option><option value="PER_ACCOUNT">Yes, one PO for the account</option></select><E k="poRule" />
        </label>
        <label className={label}>Expected delegates per year <span className="font-normal">(optional)</span><input name="expectedDelegates" type="number" min={0} defaultValue={v.expectedDelegates} className={input} {...err('expectedDelegates')} /><E k="expectedDelegates" /></label>
      </Step>

      <div className="flex flex-col gap-3 border-t border-hairline pt-6">
        <label className="flex cursor-pointer items-start gap-3 text-[15px] text-ink">
          <input type="checkbox" name="terms" defaultChecked={v.terms === 'on'} className="mt-0.5 size-[22px] shrink-0 accent-ink" {...err('terms')} />
          <span>I accept the <Link href="/legal/terms" target="_blank">Terms &amp; Conditions for credit accounts</Link>, including 30-day payment terms, and I&apos;m authorised to open an account for this company.</span>
        </label>
        <E k="terms" />
        <button type="submit" disabled={pending} className="inline-flex min-h-[52px] items-center justify-center rounded-chip bg-cyan px-6 font-bold text-ink disabled:opacity-60 sm:w-fit">{pending ? 'Sending…' : 'Submit application'}</button>
        <p className="text-sm">Need to book today? <Link href="/courses">Book and pay by card</Link>.</p>
      </div>
    </form>
  );
}
