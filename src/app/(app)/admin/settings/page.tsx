import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { teamsConfigured } from '@/lib/integrations/teams';
import { publishableKey, stripeEnabled } from '@/lib/integrations/payments';
import { emailLive } from '@/lib/integrations/email';
import { Chip } from '@/components/ui';
import { checkXeroSetupAction, disconnectXeroAction, retryXeroAction, saveBilling, saveCancellationPolicy, saveSubjects } from './actions';
import { xeroStatus } from '@/lib/integrations/xero';
import { xeroQueueCounts } from '@/lib/xero-sync';
import { loadPolicy, policyLines } from '@/lib/cancellation-policy';
import { creditDefaults } from '@/lib/accounts';
import { xeroSettings } from '@/lib/billing';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings', robots: { index: false } };

const card = 'rounded-card bg-white p-6 shadow-card';
const input = 'h-11 rounded-control border border-field bg-white px-3 text-sm text-ink disabled:bg-page';

export default async function Settings({ searchParams }: { searchParams: Promise<{ msg?: string; detail?: string }> }) {
  const me = await requireAdmin('/admin/settings');
  const isSuper = me.roles.includes('SUPER_ADMIN');
  const { msg, detail } = await searchParams;
  const [subjects, teamsFails, staff] = await Promise.all([
    db.subject.findMany({ orderBy: { name: 'asc' } }),
    db.task.count({ where: { type: 'INTEGRATION_FAILURE', status: 'OPEN' } }),
    db.person.count({ where: { roles: { hasSome: ['ADMIN', 'SUPER_ADMIN'] } } }),
  ]);
  const [credit, xero, policy, xs, xq] = await Promise.all([creditDefaults(), xeroSettings(), loadPolicy(), xeroStatus(), xeroQueueCounts()]);
  const sandbox = publishableKey().startsWith('pk_test_');
  const integrations: [string, string, 'soft' | 'warn' | 'grey' | 'bad', string][] = [
    ['Microsoft Teams', teamsConfigured() ? 'Connected' : 'Not connected', teamsConfigured() ? 'soft' : 'warn', `One meeting per virtual session, invites to delegates, booker and trainer. Host: ${process.env.MS_MEETING_HOST || 'not set'}.${process.env.MS_INVITE_ALLOWLIST ? ` Test safety: invites only to ${process.env.MS_INVITE_ALLOWLIST}.` : ''}`],
    ['Stripe', stripeEnabled() ? (sandbox ? 'Sandbox' : 'Live') : 'Test buttons', stripeEnabled() ? (sandbox ? 'warn' : 'soft') : 'grey', stripeEnabled() ? (sandbox ? 'Card payments through the Stripe sandbox. No real money moves.' : 'Taking real card payments.') : 'Stand-in payment buttons. Connect Stripe to take cards.'],
    ['Email sending', emailLive() ? 'Sending' : 'Test mode', emailLive() ? 'soft' : 'warn', emailLive() ? `From ${process.env.EMAIL_FROM}.` : 'Emails are logged, not sent. Log-in codes show on screen. Needs the eci-hub.co.uk domain set up in Amazon SES.'],
    ['Xero', xs.connected ? 'Connected' : xs.configured ? 'Not connected' : 'Not set up', xs.connected ? 'soft' : 'warn', xs.connected ? `Connected to ${xs.tenantName}. Card bookings go to Xero as paid invoices straight away; account statements become draft invoices each month.` : 'Card bookings and account statements go to Xero automatically once it is connected. Until then the month-end Xero import file still works.'],
    ['Zoom', 'Phase 3', 'grey', 'Same as Teams, for courses set to Zoom.'],
    ['Learning platform (SCORM)', 'Phase 3', 'grey', 'Host eLearning on ECI-Hub, or enrol learners on provider platforms by API.'],
  ];

  return (
    <>
      <div><p className="mb-1.5 text-xs">Admin › Settings</p><h1 className="text-[30px] font-extrabold tracking-tight text-ink">Settings</h1></div>
      {(msg === 'saved' || msg === 'billingsaved') && <p role="status" className="rounded-control bg-cyan-soft px-4 py-3 text-sm font-semibold text-ink">{msg === 'saved' ? 'Subjects saved.' : 'Credit and Xero settings saved.'}</p>}
      {msg === 'xeroconnected' && <p role="status" className="rounded-control bg-cyan-soft px-4 py-3 text-sm font-semibold text-ink">Xero connected{detail ? `: ${detail}` : ''}. Anything waiting in the queue will now be sent.</p>}
      {msg === 'xerodisconnected' && <p role="status" className="rounded-control bg-cyan-soft px-4 py-3 text-sm font-semibold text-ink">Xero disconnected. Work keeps queuing and is sent when you reconnect.</p>}
      {msg === 'xerocheck' && (
        <ul role="status" className="flex flex-col gap-1 rounded-control bg-white px-4 py-3 text-sm shadow-card">
          {(detail ?? '').split('|').map((l) => <li key={l} className={l.startsWith('OK') ? 'font-semibold text-ink' : 'font-semibold text-bad-fg'}>{l.startsWith('OK') ? '\u2713 ' : '\u2717 '}{l.replace(/^(OK|PROBLEM): /, '')}</li>)}
        </ul>
      )}
      {msg === 'xeroretried' && <p role="status" className="rounded-control bg-cyan-soft px-4 py-3 text-sm font-semibold text-ink">Retried: {detail}.</p>}
      {msg === 'xeronotset' && <p role="alert" className="rounded-control bg-warn-bg px-4 py-3 text-sm font-semibold text-warn-fg">The Xero client ID and secret have not been added to the server yet. See docs/xero-setup.md.</p>}
      {msg === 'xeroerror' && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">Xero did not connect: {detail ?? 'unknown reason'}</p>}
      {msg === 'policysaved' && <p role="status" className="rounded-control bg-cyan-soft px-4 py-3 text-sm font-semibold text-ink">Cancellation policy saved. The public terms and checkout wording now match it.</p>}
      {msg === 'policyinvalid' && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">{detail ?? 'Check the cancellation policy.'}</p>}
      {msg === 'billinginvalid' && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">Check the credit and Xero values: amounts in pounds, terms up to 120 days, account code and tax rate filled in.</p>}
      {teamsFails > 0 && <Link href="/admin/tasks?type=INTEGRATION_FAILURE" className="rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg no-underline">{teamsFails} integration {teamsFails === 1 ? 'problem needs' : 'problems need'} attention in Tasks →</Link>}

      <section className={card} aria-labelledby="int-h">
        <h2 id="int-h" className="mb-1 text-lg font-extrabold text-ink">Integrations</h2>
        <p className="mb-4 text-sm">Connected once here; courses then use them automatically. Keys are kept in AWS Secrets Manager, never on this page.</p>
        <ul className="grid gap-3 md:grid-cols-2">
          {integrations.map(([name, state, tone, text]) => (
            <li key={name} className="rounded-control border border-hairline p-4">
              <div className="mb-1 flex items-center justify-between gap-3"><span className="font-bold text-ink">{name}</span><Chip tone={tone}>{state}</Chip></div>
              <p className="text-sm">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="subjects" className={card} aria-labelledby="sub-h">
        <h2 id="sub-h" className="mb-1 text-lg font-extrabold text-ink">Subjects</h2>
        <p className="mb-4 text-sm">Rules for every course in the subject. {isSuper ? '' : 'Only Super Admins can change these.'}</p>
        <form action={saveSubjects}>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-[#FAFAFA] text-xs uppercase tracking-[0.06em]"><tr>{['Subject', 'Live', 'Places left shown', 'Change or cancel cut-off (hours)', 'Check registrations first'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
              <tbody>
                {subjects.map((s) => (
                  <tr key={s.id} className="border-t border-hairline">
                    <td className="px-3 py-2 font-bold text-ink">{s.name}</td>
                    <td className="px-3 py-2"><input type="checkbox" name={`live_${s.id}`} defaultChecked={s.live} disabled={!isSuper} aria-label={`${s.name} live`} className="size-5 accent-ink" /></td>
                    <td className="px-3 py-2"><select name={`display_${s.id}`} defaultValue={s.placesLeftDisplay} disabled={!isSuper} aria-label={`${s.name} places left shown`} className={input}><option value="ALWAYS">Always</option><option value="WHEN_LOW">When 3 or fewer</option><option value="NEVER">Never</option></select></td>
                    <td className="px-3 py-2"><input type="number" min={0} max={1440} name={`cutoff_${s.id}`} defaultValue={s.changeCutoffHours} disabled={!isSuper} aria-label={`${s.name} cut-off hours`} className={`${input} w-28`} /> <span className="text-xs">{s.changeCutoffHours % 24 === 0 ? `${s.changeCutoffHours / 24} days` : ''}</span></td>
                    <td className="px-3 py-2"><input type="checkbox" name={`approval_${s.id}`} defaultChecked={s.approvalRequired} disabled={!isSuper} aria-label={`${s.name} check registrations first`} className="size-5 accent-ink" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isSuper && <button type="submit" className="mt-4 inline-flex min-h-11 items-center rounded-chip bg-cyan px-5 text-sm font-bold text-ink">Save subjects</button>}
        </form>
      </section>

      <section className={card} aria-labelledby="ven-h">
        <h2 id="ven-h" className="mb-1 text-lg font-extrabold text-ink">Venues</h2>
        <p className="mb-3 text-sm">Training rooms and client sites used for in-person dates, with directions sent once the address is released.</p>
        <Link href="/admin/venues" className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-4 text-sm font-bold text-ink no-underline">Manage venues</Link>
      </section>

      <section className={card} aria-labelledby="users-h">
        <h2 id="users-h" className="mb-1 text-lg font-extrabold text-ink">Admin users</h2>
        <p className="mb-3 text-sm">{staff} staff {staff === 1 ? 'account' : 'accounts'}. Add staff, change roles and reset authenticators in People.</p>
        <Link href="/admin/people?show=staff" className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-4 text-sm font-bold text-ink no-underline">Manage staff in People</Link>
      </section>

      <section id="xero" className={card} aria-labelledby="xero-h">
        <h2 id="xero-h" className="mb-1 text-lg font-extrabold text-ink">Xero</h2>
        <p className="mb-3 text-sm">Card bookings are sent to Xero the moment they are paid, as an invoice already paid into your Stripe clearing account. Refunds become credit notes. At month end each company account becomes one draft invoice with a line per booking, ready for you to review, approve and send in Xero. When you mark it paid in Xero, the company&apos;s credit comes back here by itself.</p>
        <dl className="mb-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 border-b border-hairline py-1"><dt>Connection</dt><dd className="font-semibold text-ink">{xs.connected ? `Connected to ${xs.tenantName}` : xs.configured ? 'Not connected' : 'Not set up on the server'}</dd></div>
          <div className="flex justify-between gap-4 border-b border-hairline py-1"><dt>Waiting to send</dt><dd className="font-semibold text-ink">{xq.pending}</dd></div>
          <div className="flex justify-between gap-4 border-b border-hairline py-1"><dt>Sent so far</dt><dd className="font-semibold text-ink">{xq.done}</dd></div>
          <div className="flex justify-between gap-4 border-b border-hairline py-1"><dt>Needs attention</dt><dd className={`font-semibold ${xq.failed ? 'text-bad-fg' : 'text-ink'}`}>{xq.failed}</dd></div>
        </dl>
        {xq.lastError && <p className="mb-3 rounded-control bg-warn-bg px-4 py-3 text-sm text-warn-fg">Last problem: {xq.lastError}</p>}
        {isSuper ? (
          <div className="flex flex-wrap gap-2">
            {!xs.connected && <a href="/admin/xero/connect" className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-5 text-sm font-bold text-ink no-underline">Connect Xero</a>}
            {xs.connected && <form action={checkXeroSetupAction}><button type="submit" className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-5 text-sm font-bold text-ink">Check Xero setup</button></form>}
            {xs.connected && <form action={retryXeroAction}><button type="submit" className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-5 text-sm font-bold text-ink">Send now and retry failed</button></form>}
            {xs.connected && <form action={disconnectXeroAction}><button type="submit" className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-5 text-sm font-bold text-ink">Disconnect</button></form>}
          </div>
        ) : <p className="text-sm">Only a Super Admin can connect Xero.</p>}
      </section>

      <section id="cancellation" className={card} aria-labelledby="canc-h">
        <h2 id="canc-h" className="mb-1 text-lg font-extrabold text-ink">Cancellation policy</h2>
        <p className="mb-4 text-sm">One place for the policy. Admins see it as a steer on every cancellation, checkout shows it, and the public Terms page prints it, so they can never disagree.{!isSuper && ' Only a Super Admin can change it.'}</p>
        <form action={saveCancellationPolicy} className="flex flex-col gap-4">
          <fieldset disabled={!isSuper} className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-bold text-ink">Tiers: cancelled at least this many days before the start, charge this share of the price</legend>
            {Array.from({ length: 5 }, (_, i) => {
              const t = policy.tiers[i];
              return (
                <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="flex items-center gap-2"><span className="w-12">Days</span><input name={`days_${i}`} type="number" min={0} max={365} defaultValue={t?.daysBefore ?? ''} className={`${input} w-24`} /></label>
                  <label className="flex items-center gap-2"><span className="w-16">Charge %</span><input name={`pct_${i}`} type="number" min={0} max={100} defaultValue={t?.chargePercent ?? ''} className={`${input} w-24`} /></label>
                </div>
              );
            })}
            <p className="text-xs">Leave a row blank to skip it. The last tier must be 0 days (anything later than the other tiers).</p>
            <label className="flex items-center gap-2 text-sm font-bold text-ink">Late cancellation window (hours before the start)<input name="lateHours" type="number" min={0} max={168} defaultValue={policy.lateHours} className={`${input} w-24`} /></label>
            <label className="flex flex-col gap-1 text-sm font-bold text-ink">Opening wording on the public terms<textarea name="intro" rows={3} defaultValue={policy.intro} className="rounded-control border border-field bg-white px-3 py-2 text-sm font-normal" /></label>
          </fieldset>
          <div className="rounded-control bg-page p-4 text-sm"><p className="mb-1 font-bold text-ink">What customers will read</p><ul className="list-disc pl-5">{policyLines(policy).map((l) => <li key={l}>{l}</li>)}</ul></div>
          {isSuper && <div><button type="submit" className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-5 text-sm font-bold text-ink">Save cancellation policy</button></div>}
        </form>
      </section>

      <section id="billing" className={card} aria-labelledby="bill-h">
        <h2 id="bill-h" className="mb-1 text-lg font-extrabold text-ink">Credit accounts and Xero</h2>
        <p className="mb-4 text-sm">Defaults for new credit accounts, and the values written into the month-end Xero import file. Check the account code and tax rate against your Xero chart of accounts.{!isSuper && ' Only a Super Admin can change these.'}</p>
        <form action={saveBilling} className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-bold text-ink">Default credit limit (£)<input name="defaultLimit" inputMode="numeric" defaultValue={credit.defaultLimitPence / 100} disabled={!isSuper} className={input} /><span className="text-xs font-normal">The limit a new account starts with when none is asked for.</span></label>
          <label className="flex flex-col gap-1 text-sm font-bold text-ink">Admin approval ceiling (£)<input name="adminLimit" inputMode="numeric" defaultValue={credit.adminLimitPence / 100} disabled={!isSuper} className={input} /><span className="text-xs font-normal">Admins can set any limit up to this, in any amount. Above it needs a Super Admin.</span></label>
          <label className="flex flex-col gap-1 text-sm font-bold text-ink">Low credit warning (£)<input name="lowCredit" inputMode="numeric" defaultValue={credit.lowCreditWarnPence / 100} disabled={!isSuper} className={input} /><span className="text-xs font-normal">Bookers are emailed when available credit drops below this.</span></label>
          <label className="flex flex-col gap-1 text-sm font-bold text-ink">Payment terms (days)<input name="termsDays" type="number" min={0} max={120} defaultValue={credit.termsDays} disabled={!isSuper} className={input} /></label>
          <label className="flex flex-col gap-1 text-sm font-bold text-ink">Xero sales account code<input name="accountCode" defaultValue={xero.accountCode} disabled={!isSuper} className={input} /><span className="text-xs font-normal">Xero&apos;s default is 200 (Sales).</span></label>
          <label className="flex flex-col gap-1 text-sm font-bold text-ink">Xero tax rate<input name="taxType" defaultValue={xero.taxType} disabled={!isSuper} className={input} /><span className="text-xs font-normal">Exactly as named in Xero, e.g. 20% (VAT on Income).</span></label>
          <label className="flex flex-col gap-1 text-sm font-bold text-ink">Xero tax code (live connection)<input name="taxCode" defaultValue={xero.taxCode} disabled={!isSuper} className={input} /><span className="text-xs font-normal">The code, not the name: OUTPUT2 is 20% (VAT on Income) in UK organisations.</span></label>
          <label className="flex flex-col gap-1 text-sm font-bold text-ink">Stripe clearing account code<input name="stripeClearingCode" defaultValue={xero.stripeClearingCode} disabled={!isSuper} className={input} /><span className="text-xs font-normal">The Xero account that card payments are recorded against. Needed before card bookings can be sent.</span></label>
          <label className="flex flex-col gap-1 text-sm font-bold text-ink">Invoice number prefix<input name="invoicePrefix" defaultValue={xero.invoicePrefix} disabled={!isSuper} className={input} /><span className="text-xs font-normal">Used until you enter Xero&apos;s own invoice number.</span></label>
          {isSuper && <div className="sm:col-span-3"><button type="submit" className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-5 text-sm font-bold text-ink">Save credit and Xero settings</button></div>}
        </form>
      </section>

      <section className={card} aria-labelledby="later-h">
        <h2 id="later-h" className="mb-1 text-lg font-extrabold text-ink">Coming in later phases</h2>
        <p className="text-sm">Email template editor and legal document editor (Phase 3).</p>
      </section>
    </>
  );
}
