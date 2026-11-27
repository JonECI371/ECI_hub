'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveDelegateAction, type DelegateState } from '@/app/(site)/book/outcome/actions';

export type DelegateRow = {
  attendeeId: string;
  you: boolean;
  status: 'done' | 'sent' | 'needed';
  first: string; last: string; email: string;
  d: string; m: string; y: string;
  phone: string; skillguard: string; invoiceRef: string;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YEARS = Array.from({ length: 71 }, (_, i) => 2010 - i);
const input = 'box-border h-[46px] w-full min-w-0 rounded-control border border-field bg-white px-3.5 text-[15px] text-ink aria-[invalid=true]:border-bad-fg aria-[invalid=true]:border-2';
const labelCls = 'flex flex-col gap-1.5 text-sm font-bold text-ink';
const hint = 'text-[13px] font-normal';

function Err({ id, msg }: { id: string; msg?: string }) {
  return msg ? <span id={id} className="text-[13px] font-semibold text-bad-fg">{msg}</span> : null;
}

function Row({ row, n, bookingId, authority, showInvoiceRef }: { row: DelegateRow; n: number; bookingId: string; authority: boolean; showInvoiceRef: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<'now' | 'link'>(row.status === 'sent' ? 'link' : 'now');
  const [state, action, pending] = useActionState<DelegateState, FormData>(saveDelegateAction, {});
  useEffect(() => { if (state.ok) router.refresh(); }, [state, router]);
  const f = state.fields ?? {};
  const bad = (k: string) => (f[k] ? { 'aria-invalid': true as const, 'aria-describedby': `r${n}-${k}` } : {});
  const done = row.status === 'done' || row.status === 'sent';
  const chip = row.status === 'done' ? (row.you ? 'Complete (you)' : 'Entered by you') : row.status === 'sent' ? 'Link sent' : 'Details needed';
  const k = (s: string) => `${row.attendeeId}-${row.status}-${s}`;

  return (
    <section aria-label={`Delegate ${n}`} className={`flex flex-col gap-4 rounded-card bg-white p-5 shadow-card md:p-6 ${done ? 'ring-2 ring-cyan' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-extrabold text-ink">Delegate {n}{row.you ? ' (you)' : ''}{row.first ? `: ${row.first} ${row.last}` : ''}</h3>
        <span className={`rounded-chip px-3 py-1 text-xs font-bold ${done ? 'bg-cyan-soft text-ink' : 'bg-warn-bg text-warn-fg'}`}>{chip}</span>
      </div>
      {!row.you && (
        <div role="group" aria-label={`How to complete delegate ${n}`} className="inline-flex self-start overflow-hidden rounded-control border-[1.5px] border-field">
          {(['now', 'link'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`min-h-11 px-4 text-sm font-bold ${mode === m ? 'bg-ink text-white' : 'bg-white text-ink'}`}>
              {m === 'now' ? 'Fill in now' : 'Email them a link'}
            </button>
          ))}
        </div>
      )}
      <form action={action} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="attendeeId" value={row.attendeeId} />
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="authority" value={authority ? 'on' : ''} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelCls}>First name *<input key={k('first')} name="first" defaultValue={row.first} autoComplete="off" className={input} {...bad('first')} /><Err id={`r${n}-first`} msg={f.first} /></label>
          <label className={labelCls}>Last name *<input key={k('last')} name="last" defaultValue={row.last} autoComplete="off" className={input} {...bad('last')} /><Err id={`r${n}-last`} msg={f.last} /></label>
          <label className={`${labelCls} sm:col-span-2`}>Email *<span className={hint}>{mode === 'link' ? 'We send the link here.' : 'Used for joining details, reminders and their certificate.'}</span>
            <input key={k('email')} name="email" type="email" defaultValue={row.email} autoComplete="off" readOnly={row.you} className={input} {...bad('email')} /><Err id={`r${n}-email`} msg={f.email} /></label>
          {mode === 'now' && (
            <>
              <fieldset className="flex flex-col gap-1.5 sm:col-span-2">
                <legend className="mb-1.5 text-sm font-bold text-ink">Date of birth *<span className={`${hint} ml-2`}>Used to match them in SkillGuard.</span></legend>
                <div className="grid grid-cols-[72px_1fr_96px] gap-2">
                  <select key={k('d')} name="dobD" aria-label="Day" defaultValue={row.d} className={input} {...bad('dob')}><option value="">Day</option>{Array.from({ length: 31 }, (_, i) => i + 1).map((v) => <option key={v} value={v}>{v}</option>)}</select>
                  <select key={k('m')} name="dobM" aria-label="Month" defaultValue={row.m} className={input} {...bad('dob')}><option value="">Month</option>{MONTHS.map((v, i) => <option key={v} value={i + 1}>{v}</option>)}</select>
                  <select key={k('y')} name="dobY" aria-label="Year" defaultValue={row.y} className={input} {...bad('dob')}><option value="">Year</option>{YEARS.map((v) => <option key={v} value={v}>{v}</option>)}</select>
                </div>
                <Err id={`r${n}-dob`} msg={f.dob} />
              </fieldset>
              <label className={labelCls}>Telephone <span className={hint}>Optional</span><input key={k('phone')} name="phone" type="tel" defaultValue={row.phone} autoComplete="off" className={input} {...bad('phone')} /><Err id={`r${n}-phone`} msg={f.phone} /></label>
              <label className={labelCls}>SkillGuard number <span className={hint}>Optional now. Needed before the certificate is issued.</span><input key={k('sg')} name="skillguard" defaultValue={row.skillguard} autoComplete="off" className={input} {...bad('skillguard')} /><Err id={`r${n}-skillguard`} msg={f.skillguard} /></label>
            </>
          )}
          {showInvoiceRef && (
            <label className={`${labelCls} sm:col-span-2`}>PO or reference for invoicing <span className={hint}>Optional. Printed on the invoice line so your accounts team can pay it.</span><input key={k('ref')} name="invoiceRef" defaultValue={row.invoiceRef} maxLength={50} className={input} /></label>
          )}
        </div>
        <Err id={`r${n}-authority`} msg={f.authority} />
        {done && mode === 'now' && !row.skillguard && (
          <p className="rounded-control bg-warn-bg px-4 py-3 text-sm text-warn-fg">No SkillGuard number yet. The certificate cannot be issued until one is added, and we will remind {row.you ? 'you' : 'them'} after the course.</p>
        )}
        {state.message && <p role="status" className={`text-sm font-semibold ${state.ok ? 'text-ink' : 'text-bad-fg'}`}>{state.message}</p>}
        <div>
          <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center rounded-chip bg-cyan px-6 font-bold text-ink disabled:opacity-60">
            {pending ? 'Saving…' : mode === 'link' ? (row.status === 'sent' ? 'Resend link' : 'Send link') : done ? 'Update details' : 'Save details'}
          </button>
        </div>
      </form>
    </section>
  );
}

export function DelegateDetails({ bookingId, rows, showInvoiceRef }: { bookingId: string; rows: DelegateRow[]; showInvoiceRef: boolean }) {
  const [authority, setAuthority] = useState(false);
  const complete = rows.filter((r) => r.status !== 'needed').length;
  const others = rows.some((r) => !r.you);
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1 rounded-card bg-cyan-soft p-6 md:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink">Thank you for booking</p>
        <h2 className="text-[22px] font-extrabold text-ink">We just need a few more details ahead of the course</h2>
        <p className="text-[15px]">We use them to record each delegate&apos;s competencies after the training.</p>
      </section>
      <section aria-live="polite" className="flex flex-col gap-2 rounded-card bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-extrabold text-ink">{complete} of {rows.length} {complete === rows.length ? 'delegates done' : 'delegates complete'}</h3><span className="text-sm">About 1 minute each</span></div>
        <div className="h-2.5 overflow-hidden rounded-chip bg-hairline" aria-hidden="true"><div className="h-full bg-cyan transition-all" style={{ width: `${(complete / rows.length) * 100}%` }} /></div>
      </section>
      {rows.map((r, i) => <Row key={r.attendeeId} row={r} n={i + 1} bookingId={bookingId} authority={authority} showInvoiceRef={showInvoiceRef} />)}
      {others && (
        <section className="rounded-card bg-white p-5 shadow-card">
          <label className="flex items-start gap-3 text-[15px] font-semibold text-ink"><input type="checkbox" checked={authority} onChange={(e) => setAuthority(e.target.checked)} className="mt-1 size-6 shrink-0" />
            <span>I am authorised to give these details. Each delegate is emailed a copy to check or correct.</span></label>
          <p className="mt-2 text-[13px]">Tick this once before you save anyone else&apos;s details. It is not needed for your own.</p>
        </section>
      )}
      <p className="text-sm">We email you and anyone still outstanding 5 days before the course. A SkillGuard number must be on record before the certificate is issued; we remind the delegate and you after the course until it is added.</p>
    </div>
  );
}
