'use client';
import { useActionState, useState } from 'react';
import { addBooking, type AdminBookingState } from '@/app/(app)/admin/bookings/new/actions';

export type SlotOption = { value: string; label: string };

const input = 'h-11 w-full rounded-control border border-field bg-card px-3 text-sm text-ink';
const label = 'flex flex-col gap-1 text-sm font-bold text-ink';

export function AdminBookingForm({ slots }: { slots: SlotOption[] }) {
  const [state, action, pending] = useActionState<AdminBookingState, FormData>(addBooking, {});
  const v = state.values ?? {};
  const [method, setMethod] = useState(v.method ?? 'ACCOUNT');
  const warned = !!state.warnings?.length;
  return (
    <form action={action} className="flex max-w-[760px] flex-col gap-6">
      {state.error && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">{state.error}</p>}

      <fieldset className="grid gap-3 rounded-card bg-card p-6 shadow-card sm:grid-cols-2">
        <legend className="sr-only">Who is booking</legend>
        <h2 className="text-lg font-extrabold text-ink sm:col-span-2">Who is booking</h2>
        <label className={`${label} sm:col-span-2`}>Email<input name="email" type="email" required defaultValue={v.email} placeholder="name@company.com" className={input} /><span className="text-xs font-normal">If this email is already in People we use that person. If not, fill in the names to add them.</span></label>
        <label className={label}>First name <span className="font-normal">(new people only)</span><input name="firstName" defaultValue={v.firstName} className={input} /></label>
        <label className={label}>Last name <span className="font-normal">(new people only)</span><input name="lastName" defaultValue={v.lastName} className={input} /></label>
      </fieldset>

      <fieldset className="grid gap-3 rounded-card bg-card p-6 shadow-card sm:grid-cols-2">
        <legend className="sr-only">Course and date</legend>
        <h2 className="text-lg font-extrabold text-ink sm:col-span-2">Course and date</h2>
        <label className={`${label} sm:col-span-2`}>Course and date
          <select name="slot" required defaultValue={v.slot ?? ''} className={input}>
            <option value="">Choose…</option>
            {slots.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className={label}>Places<input name="places" type="number" min={1} max={100} required defaultValue={v.places ?? '1'} className={input} /></label>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm text-ink"><input type="checkbox" name="bookerAttends" defaultChecked={v.bookerAttends === 'on'} className="size-5 accent-ink" />The booker is one of the delegates</label>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-card bg-card p-6 shadow-card">
        <legend className="sr-only">How it is paid</legend>
        <h2 className="text-lg font-extrabold text-ink">How it is paid</h2>
        {([['ACCOUNT', 'On the company credit account (needs the booker to be on an account)'], ['CARD_LINK', 'By card: email the booker a payment link'], ['PAID', 'Already paid by cash or bank transfer']] as const).map(([k, l]) => (
          <label key={k} className="flex min-h-11 items-center gap-3 text-sm text-ink"><input type="radio" name="method" value={k} checked={method === k} onChange={() => setMethod(k)} className="size-5 accent-ink" />{l}</label>
        ))}
        {method === 'ACCOUNT' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>PO number<input name="poNumber" defaultValue={v.poNumber} className={input} /></label>
            <label className={label}>PO amount <span className="font-normal">(optional, £)</span><input name="poValue" inputMode="decimal" defaultValue={v.poValue} className={input} /></label>
          </div>
        )}
        {method === 'CARD_LINK' && <p className="text-sm">The places are held for 72 hours. When the booker pays, they get the normal confirmation and the Teams invite.</p>}
        {method === 'PAID' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>Paid by<select name="paidHow" defaultValue={v.paidHow ?? 'BANK'} className={input}><option value="BANK">Bank transfer</option><option value="CASH">Cash</option></select></label>
            <label className={`${label} sm:col-span-2`}>Note <span className="font-normal">(how and when it was paid)</span><input name="note" defaultValue={v.note} className={input} /></label>
            <p className="text-sm sm:col-span-2">This is recorded as paid, with the confirmation email and Teams invite sent as normal. It does not go to Xero by itself yet, and a refund has to be made by hand.</p>
          </div>
        )}
      </fieldset>

      {warned && (
        <fieldset role="alert" className="flex flex-col gap-3 rounded-card border-2 border-warn-line bg-warn-bg p-6 text-warn-fg">
          <legend className="sr-only">Warning: this booking breaks a rule</legend>
          <h2 className="text-lg font-extrabold">Warning: this booking breaks a rule</h2>
          <ul className="list-disc pl-5 text-sm font-semibold">{state.warnings!.map((w) => <li key={w.code}>{w.text}</li>)}</ul>
          <p className="text-sm">Nothing has been saved. To go ahead anyway, tick the box, say why, and press the button again. The override and your reason are written to the audit log.</p>
          <label className="flex min-h-11 items-center gap-3 text-sm font-bold"><input type="checkbox" name="override" className="size-5" />I understand, and I want to override this.</label>
          <label className="flex flex-col gap-1 text-sm font-bold">Reason<input name="reason" className={input} /></label>
        </fieldset>
      )}

      <div><button type="submit" disabled={pending} className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-6 text-sm font-bold text-on-cyan">{warned ? 'Book with override' : 'Add booking'}</button></div>
    </form>
  );
}
