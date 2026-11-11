'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import type { DeliveryType } from '@prisma/client';
import { startCheckout, type CheckoutState } from '@/app/(site)/book/actions';
import { DeliveryChip, Chip } from '@/components/ui';

export type CheckoutProps = {
  courseId: string;
  sessionId: string | null;
  title: string;
  deliveryType: DeliveryType;
  subjectName: string;
  when: string[];
  pricePence: number;
  vatRate: number;
  maxPlaces: number;
  needsWaiver: boolean;
  cutoffText: string;
  prefill: { firstName: string; lastName: string; email: string; mobile: string } | null;
  backHref: string;
  addTo: string | null;
  account: { company: string; role: string; available: number; onHold: boolean; poRequired: boolean; lastPo: string; statementText: string; bookerName: string; bookerEmail: string } | null;
};

const money = (p: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(p / 100);
const input = 'box-border h-[46px] w-full rounded-control border border-field bg-white px-3.5 text-[15px] text-ink aria-[invalid=true]:border-bad-fg aria-[invalid=true]:border-2';
const labelCls = 'flex flex-col gap-1.5 text-sm font-bold text-ink';
const card = 'rounded-card bg-white p-6 shadow-card md:p-8';

function FieldError({ id, msg }: { id: string; msg?: string }) {
  return msg ? <span id={id} className="text-[13px] font-semibold text-bad-fg">{msg}</span> : null;
}

export function CheckoutForm(p: CheckoutProps) {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(startCheckout, {});
  const [places, setPlaces] = useState(1);
  const [bookerAttends, setBookerAttends] = useState(!p.addTo);
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [pay, setPay] = useState<'account' | 'card'>(p.account && !p.account.onHold ? 'account' : 'card');
  const onAccount = pay === 'account' && !!p.account;
  // Keep the stepper and choices in step with what was submitted (React resets uncontrolled fields after an action).
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.values?.places) setPlaces(Number(state.values.places));
    if (state.values) setBookerAttends(state.values.bookerAttends === 'on');
    if (state.values?.mode === 'later' || state.values?.mode === 'now') setMode(state.values.mode);
    if (state.values?.method === 'account' || state.values?.method === 'card') setPay(state.values.method);
  }
  const f = state.fields ?? {};
  const v = state.values ?? {};
  const val = (k: string, fallback = '') => v[k] ?? fallback;
  const chk = (k: string) => v[k] === 'on';
  const err = (k: string) => (f[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-err` } : {});

  const others = Math.max(0, places - (bookerAttends ? 1 : 0));
  const sub = p.pricePence * places;
  const vat = Math.round((sub * p.vatRate) / 100);

  return (
    <form action={action} className="flex flex-col gap-8 px-4 pb-16 pt-8 md:px-20 lg:flex-row lg:items-start" noValidate>
      <input type="hidden" name="courseId" value={p.courseId} />
      <input type="hidden" name="sessionId" value={p.sessionId ?? ''} />
      <input type="hidden" name="places" value={places} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="needsWaiver" value={p.needsWaiver ? '1' : '0'} />
      <input type="hidden" name="method" value={onAccount ? 'account' : 'card'} />
      {p.addTo && <input type="hidden" name="addTo" value={p.addTo} />}

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div>
          <Link href={p.backHref} className="text-sm">← Back to course</Link>
          <h1 className="mt-3 text-[32px] font-extrabold tracking-tight text-ink">{p.addTo ? 'Add places' : 'Book your places'}</h1>
          {p.addTo && <p className="mt-1 text-sm">These places are added to booking {p.addTo}, on the same date. They are paid for separately and appear under it.</p>}
        </div>

        {state.error && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 font-semibold text-bad-fg">{state.error}</p>}

        <section className={card} aria-labelledby="places-h">
          <h2 id="places-h" className="mb-4 text-[22px] font-extrabold text-ink">How many places?</h2>
          <div className="mb-5 flex items-center gap-4">
            <button type="button" aria-label="One fewer place" disabled={places <= 1} onClick={() => setPlaces(places - 1)} className="size-11 rounded-control border border-field bg-white text-xl font-bold text-ink disabled:opacity-40">−</button>
            <output aria-live="polite" className="min-w-[3ch] text-center text-2xl font-extrabold text-ink">{places}</output>
            <button type="button" aria-label="One more place" disabled={places >= p.maxPlaces} onClick={() => setPlaces(places + 1)} className="size-11 rounded-control border border-field bg-white text-xl font-bold text-ink disabled:opacity-40">+</button>
            {places >= p.maxPlaces && <span className="text-[13px]">That is all the places left on this date.</span>}
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-[15px] text-ink">
            <input type="checkbox" name="bookerAttends" checked={bookerAttends} onChange={(e) => setBookerAttends(e.target.checked)} className="mt-0.5 size-[22px] shrink-0 accent-ink" />
            <span>I'm one of the attendees</span>
          </label>

          {others > 0 && (
            <fieldset className="mt-6 border-t border-hairline pt-5">
              <legend className="sr-only">Who else is attending?</legend>
              <h3 className="mb-1 text-lg font-bold text-ink">Who else is attending?</h3>
              <p className="mb-4 text-sm">Everyone needs their own email address for their joining details and certificate. Personal addresses are fine.</p>
              <div className="mb-5 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="When to add attendees">
                {([['now', 'Add their details now', 'Each person gets their own joining details'], ['later', 'Add them later', 'From your dashboard. We remind you 5 days before.']] as const).map(([v, t, d]) => (
                  <label key={v} className={`flex cursor-pointer gap-3 rounded-control border p-4 ${mode === v ? 'border-2 border-ink bg-cyan-soft' : 'border-hairline'}`}>
                    <input type="radio" name="modeRadio" checked={mode === v} onChange={() => setMode(v)} className="mt-1 accent-ink" />
                    <span><span className="block font-bold text-ink">{t}</span><span className="text-[13px]">{d}</span></span>
                  </label>
                ))}
              </div>
              {mode === 'now' && (
                <ol className="flex flex-col gap-4">
                  {Array.from({ length: others }, (_, i) => (
                    <li key={i} className="grid gap-3 rounded-control bg-page p-4 sm:grid-cols-2">
                      <p className="text-sm font-bold text-ink sm:col-span-2">Attendee {i + (bookerAttends ? 2 : 1)}</p>
                      <label className={labelCls}>Full name<input name={`other_name_${i}`} defaultValue={val(`other_name_${i}`)} autoComplete="off" className={input} {...err(`other_name_${i}`)} /><FieldError id={`other_name_${i}-err`} msg={f[`other_name_${i}`]} /></label>
                      <label className={labelCls}>Email<input name={`other_email_${i}`} defaultValue={val(`other_email_${i}`)} type="email" autoComplete="off" className={input} {...err(`other_email_${i}`)} /><FieldError id={`other_email_${i}-err`} msg={f[`other_email_${i}`]} /></label>
                    </li>
                  ))}
                </ol>
              )}
            </fieldset>
          )}
        </section>

        {onAccount && p.account ? (
          <section className={card} aria-labelledby="you-h">
            <h2 id="you-h" className="mb-3 text-[22px] font-extrabold text-ink">Booking as</h2>
            <p className="font-bold text-ink">{p.account.bookerName} · {p.account.company}</p>
            <p className="text-sm">{p.account.bookerEmail} · {p.account.role}</p>
            <p className="mt-2 text-sm">Not you? <Link href="/logout">Log out</Link></p>
          </section>
        ) : (
        <section className={card} aria-labelledby="you-h">
          <h2 id="you-h" className="mb-2 text-[22px] font-extrabold text-ink">Your details</h2>
          {!p.prefill && (
            <p className="mb-5 text-sm">Already booked with us? <Link href={`/login?next=${encodeURIComponent(p.sessionId ? `/book/${p.sessionId}` : p.backHref.replace('/courses/', '/book/course/'))}`}>Log in</Link> and we fill this in. New here? We set up your account from these details. No password needed.</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>First name<input name="firstName" autoComplete="given-name" defaultValue={val("firstName", p.prefill?.firstName)} className={input} {...err('firstName')} /><FieldError id="firstName-err" msg={f.firstName} /></label>
            <label className={labelCls}>Last name<input name="lastName" autoComplete="family-name" defaultValue={val("lastName", p.prefill?.lastName)} className={input} {...err('lastName')} /><FieldError id="lastName-err" msg={f.lastName} /></label>
            <label className={labelCls}>Email<input name="email" type="email" autoComplete="email" defaultValue={val("email", p.prefill?.email)} readOnly={!!p.prefill} className={input} {...err('email')} /><span className="text-[13px] font-normal">Your confirmation and sign-in link go here.</span><FieldError id="email-err" msg={f.email} /></label>
            <label className={labelCls}>Mobile<input name="mobile" type="tel" autoComplete="tel" defaultValue={val("mobile", p.prefill?.mobile)} className={input} /></label>
          </div>
        </section>
        )}
        <section className={card} aria-labelledby="terms-h">
          <h2 id="terms-h" className="mb-2 text-[22px] font-extrabold text-ink">Terms</h2>
          <p className="mb-4 text-sm">{p.cutoffText} Full details in our <Link href="/legal/terms#cancellations-and-refunds">cancellation terms</Link>.</p>
          <div className="flex flex-col gap-3.5">
            <label className="flex cursor-pointer items-start gap-3 text-[15px] text-ink">
              <input type="checkbox" name="terms" defaultChecked={chk("terms")} className="mt-0.5 size-[22px] shrink-0 accent-ink" {...err('terms')} />
              <span>I accept the <Link href="/legal/terms">Terms &amp; Conditions</Link>{onAccount ? ' for credit accounts' : <> and have read the <Link href="/legal/privacy">privacy notice</Link></>}.</span>
            </label>
            <FieldError id="terms-err" msg={f.terms} />
            {p.needsWaiver && (
              <>
                <label className="flex cursor-pointer items-start gap-3 text-[15px] text-ink">
                  <input type="checkbox" name="waiver" defaultChecked={chk("waiver")} className="mt-0.5 size-[22px] shrink-0 accent-ink" {...err('waiver')} />
                  <span>This course starts within 14 days. I want it to go ahead within my cancellation period.</span>
                </label>
                <FieldError id="waiver-err" msg={f.waiver} />
              </>
            )}
            <label className="flex cursor-pointer items-start gap-3 text-[15px] text-ink">
              <input type="checkbox" name="marketing" defaultChecked={chk("marketing")} className="mt-0.5 size-[22px] shrink-0 accent-ink" />
              <span>Send me news about courses and offers. (Optional)</span>
            </label>
          </div>
        </section>

        {p.account && (
          <section className={card} aria-labelledby="pay-h">
            <h2 id="pay-h" className="mb-4 text-[22px] font-extrabold text-ink">Payment</h2>
            {p.account.onHold && <p role="alert" className="mb-4 rounded-control bg-warn-bg px-4 py-3 text-sm font-semibold text-warn-fg">Your company account is on hold because an invoice is overdue, so this booking needs a card payment. Contact us to sort out the account.</p>}
            <div className="mb-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="How to pay">
              {([['account', 'On account', p.account.statementText], ['card', 'Pay by card', 'Card, Apple Pay or Google Pay now.']] as const).map(([m, t, d]) => (
                <label key={m} className={`flex cursor-pointer gap-3 rounded-control border p-4 ${pay === m ? 'border-2 border-ink bg-cyan-soft' : 'border-hairline'} ${m === 'account' && p.account!.onHold ? 'pointer-events-none opacity-50' : ''}`}>
                  <input type="radio" name="payRadio" checked={pay === m} disabled={m === 'account' && p.account!.onHold} onChange={() => setPay(m)} className="mt-1 accent-ink" />
                  <span><span className="block font-bold text-ink">{t}</span><span className="text-[13px]">{d}</span></span>
                </label>
              ))}
            </div>
            {onAccount && (
              <>
                <div className="mb-4 flex items-center justify-between rounded-control bg-page px-4 py-3 text-sm"><span>Available credit</span><span className="text-base font-extrabold text-ink">{money(p.account.available)}</span></div>
                {sub + vat > p.account.available && <p role="alert" className="mb-4 rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">This booking is more than your available credit. Pay by card, or contact us to raise your limit.</p>}
                <label className={labelCls}>Your reference or PO number{p.account.poRequired ? '' : <span className="font-normal"> (optional)</span>}
                  <input name="poNumber" defaultValue={val('poNumber', p.account.lastPo)} maxLength={50} placeholder="PO 4500-221" className={`${input} sm:max-w-[320px]`} {...err('poNumber')} />
                  <span className="text-[13px] font-normal">{p.account.poRequired ? 'Your company needs a PO number on every booking. ' : ''}Shown on the invoice line.</span>
                  <FieldError id="poNumber-err" msg={f.poNumber} />
                </label>
              </>
            )}
          </section>
        )}

        <button type="submit" disabled={pending} className="inline-flex min-h-[56px] items-center justify-center rounded-chip bg-cyan px-6 text-base font-bold text-ink disabled:opacity-60">
          {onAccount ? (pending ? 'Booking…' : `Confirm booking · ${money(sub + vat)}`) : pending ? 'Holding your places…' : `Continue to payment · ${money(sub + vat)}`}
        </button>
        {onAccount && <p className="-mt-3 text-sm">No payment now. Everyone booked gets their joining details straight away.</p>}
        {!p.account && <p className="text-sm">Booking for a company? <Link href="/accounts/apply">Apply for a credit account</Link></p>}
      </div>

      <aside aria-label="Your booking" className="w-full overflow-hidden rounded-card bg-white shadow-card lg:sticky lg:top-6 lg:w-[380px] lg:shrink-0">
        <p className="bg-ink px-6 py-4 font-bold text-white">Your booking</p>
        <div className="flex flex-col gap-3 p-6">
          <div className="flex flex-wrap gap-1.5"><DeliveryChip type={p.deliveryType} /><Chip>{p.subjectName}</Chip></div>
          <h3 className="text-lg font-bold text-ink">{p.title}</h3>
          <p className="text-sm leading-relaxed">{p.when.map((w, i) => <span key={i} className="block">{w}</span>)}</p>
          <dl className="mt-2 flex flex-col gap-2 border-t border-hairline pt-4 text-sm">
            <div className="flex justify-between"><dt>Price per place</dt><dd>{money(p.pricePence)}</dd></div>
            <div className="flex justify-between"><dt>Places</dt><dd>{places}</dd></div>
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(sub)}</dd></div>
            <div className="flex justify-between"><dt>VAT ({p.vatRate}%)</dt><dd>{money(vat)}</dd></div>
            <div className="flex justify-between border-t border-hairline pt-3 text-base font-extrabold text-ink"><dt>Total</dt><dd>{money(sub + vat)}</dd></div>
          </dl>
          {p.sessionId && !onAccount && <p className="text-[13px]">Places held for you for 5 minutes once you continue to payment.</p>}
        </div>
      </aside>
    </form>
  );
}
