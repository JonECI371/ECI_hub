'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { sendEnquiry, type EnquiryState } from '@/app/(site)/contact/actions';

const TOPICS: [string, string][] = [['team', 'Training for my team'], ['onsite', 'Training at our site'], ['consult', 'Consultancy'], ['account', 'Credit account'], ['other', 'Something else']];
const input = 'box-border h-[46px] w-full rounded-control border border-field bg-white px-3.5 text-[15px] text-ink aria-[invalid=true]:border-2 aria-[invalid=true]:border-bad-fg';
const label = 'flex flex-col gap-1.5 text-sm font-bold text-ink';

export function EnquiryForm({ courses, initialTopic }: { courses: string[]; initialTopic: string }) {
  const [state, action, pending] = useActionState<EnquiryState, FormData>(sendEnquiry, {});
  const [topic, setTopic] = useState(TOPICS.some(([t]) => t === initialTopic) ? initialTopic : 'team');
  const v = state.values ?? {};
  const f = state.fields ?? {};
  const err = (k: string) => (f[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-err` } : {});
  const E = ({ k }: { k: string }) => (f[k] ? <span id={`${k}-err`} className="text-[13px] font-semibold text-bad-fg">{f[k]}</span> : null);

  if (state.ok) {
    return (
      <section role="status" className="rounded-card bg-white p-8 shadow-card">
        <h2 className="mb-2 text-[24px] font-extrabold text-ink">Thanks, we have your enquiry</h2>
        <p className="leading-relaxed">We reply within one working day, usually by phone. A copy is on its way to your inbox.</p>
      </section>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-6 rounded-card bg-white p-6 shadow-card md:p-8" noValidate>
      <input type="hidden" name="topic" value={topic} />
      <div aria-hidden="true" className="absolute -left-[9999px]"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <fieldset>
        <legend className="mb-3 text-lg font-extrabold text-ink">What can we help with?</legend>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map(([t, l]) => (
            <label key={t} className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm ${topic === t ? 'border-ink bg-ink font-bold text-white' : 'border-hairline bg-white font-semibold text-ink'}`}>
              <input type="radio" name="topicRadio" checked={topic === t} onChange={() => setTopic(t)} className="sr-only" />{l}
            </label>
          ))}
        </div>
      </fieldset>
      {state.error && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 font-semibold text-bad-fg">{state.error}</p>}
      {topic === 'account' ? (
        <p className="rounded-control bg-cyan-soft px-4 py-3 text-ink">Credit accounts have their own short application so we can set up invoicing. <Link href="/accounts/apply">Apply for a credit account</Link>.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(topic === 'team' || topic === 'onsite') && (
            <>
              <label className={label}>Course<select name="course" defaultValue={v.course ?? ''} className={input}><option value="">Not sure yet</option>{courses.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label className={label}>Number of people (approx.)<input name="people" type="number" min={1} defaultValue={v.people} className={input} /></label>
            </>
          )}
          {topic === 'onsite' && (
            <>
              <label className={label}>Site location (town or postcode)<input name="location" defaultValue={v.location} className={input} {...err('location')} /><E k="location" /></label>
              <label className={label}>Preferred dates <span className="font-normal">(optional)</span><input name="dates" defaultValue={v.dates} className={input} /></label>
            </>
          )}
          {topic === 'consult' && (
            <label className={`${label} sm:col-span-2`}>Service<select name="service" defaultValue={v.service ?? ''} className={input}>{['DSEAR risk assessment', 'Hazardous area classification', 'Ex inspection and verification', 'Functional safety', 'Competence gap analysis', 'Something else'].map((s) => <option key={s}>{s}</option>)}</select></label>
          )}
          <label className={label}>Your name<input name="name" autoComplete="name" defaultValue={v.name} className={input} {...err('name')} /><E k="name" /></label>
          <label className={label}>Company<input name="company" autoComplete="organization" defaultValue={v.company} className={input} /></label>
          <label className={label}>Email<input name="email" type="email" autoComplete="email" defaultValue={v.email} className={input} {...err('email')} /><E k="email" /></label>
          <label className={label}>Phone<input name="phone" type="tel" autoComplete="tel" defaultValue={v.phone} className={input} {...err('phone')} /><E k="phone" /></label>
          <label className={`${label} sm:col-span-2`}>Anything else we should know? <span className="font-normal">(optional)</span><textarea name="message" defaultValue={v.message} className="min-h-[110px] rounded-control border border-field px-3.5 py-2.5 text-[15px] font-normal" /></label>
          <label className="flex cursor-pointer items-start gap-3 text-[15px] text-ink sm:col-span-2"><input type="checkbox" name="marketing" defaultChecked={v.marketing === 'on'} className="mt-0.5 size-[22px] shrink-0 accent-ink" /><span>Send me news about ECI-Hub courses and services. (Optional)</span></label>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <button type="submit" disabled={pending} className="inline-flex min-h-[52px] items-center justify-center rounded-chip bg-cyan px-6 font-bold text-ink disabled:opacity-60">{pending ? 'Sending…' : 'Send enquiry'}</button>
            <p className="text-sm">We use your details to reply. See our <Link href="/legal/privacy">privacy notice</Link>.</p>
          </div>
        </div>
      )}
    </form>
  );
}
