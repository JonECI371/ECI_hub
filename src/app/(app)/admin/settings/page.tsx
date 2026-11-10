import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { teamsConfigured } from '@/lib/integrations/teams';
import { publishableKey, stripeEnabled } from '@/lib/integrations/payments';
import { emailLive } from '@/lib/integrations/email';
import { Chip } from '@/components/ui';
import { saveSubjects } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings', robots: { index: false } };

const card = 'rounded-card bg-white p-6 shadow-card';
const input = 'h-11 rounded-control border border-field bg-white px-3 text-sm text-ink disabled:bg-page';

export default async function Settings({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const me = await requireAdmin('/admin/settings');
  const isSuper = me.roles.includes('SUPER_ADMIN');
  const { msg } = await searchParams;
  const [subjects, teamsFails, staff] = await Promise.all([
    db.subject.findMany({ orderBy: { name: 'asc' } }),
    db.task.count({ where: { type: 'INTEGRATION_FAILURE', status: 'OPEN' } }),
    db.person.count({ where: { roles: { hasSome: ['ADMIN', 'SUPER_ADMIN'] } } }),
  ]);
  const sandbox = publishableKey().startsWith('pk_test_');
  const integrations: [string, string, 'soft' | 'warn' | 'grey' | 'bad', string][] = [
    ['Microsoft Teams', teamsConfigured() ? 'Connected' : 'Not connected', teamsConfigured() ? 'soft' : 'warn', `One meeting per virtual session, invites to delegates, booker and trainer. Host: ${process.env.MS_MEETING_HOST || 'not set'}.${process.env.MS_INVITE_ALLOWLIST ? ` Test safety: invites only to ${process.env.MS_INVITE_ALLOWLIST}.` : ''}`],
    ['Stripe', stripeEnabled() ? (sandbox ? 'Sandbox' : 'Live') : 'Test buttons', stripeEnabled() ? (sandbox ? 'warn' : 'soft') : 'grey', stripeEnabled() ? (sandbox ? 'Card payments through the Stripe sandbox. No real money moves.' : 'Taking real card payments.') : 'Stand-in payment buttons. Connect Stripe to take cards.'],
    ['Email sending', emailLive() ? 'Sending' : 'Test mode', emailLive() ? 'soft' : 'warn', emailLive() ? `From ${process.env.EMAIL_FROM}.` : 'Emails are logged, not sent. Log-in codes show on screen. Needs the eci-hub.co.uk domain set up in Amazon SES.'],
    ['Xero', 'CSV (Phase 2)', 'grey', 'Month-end statements export as a Xero import file. The API connection comes in Phase 3.'],
    ['Zoom', 'Phase 3', 'grey', 'Same as Teams, for courses set to Zoom.'],
    ['Learning platform (SCORM)', 'Phase 3', 'grey', 'Host eLearning on ECI-Hub, or enrol learners on provider platforms by API.'],
  ];

  return (
    <>
      <div><p className="mb-1.5 text-xs">Admin › Settings</p><h1 className="text-[30px] font-extrabold tracking-tight text-ink">Settings</h1></div>
      {msg === 'saved' && <p role="status" className="rounded-control bg-cyan-soft px-4 py-3 text-sm font-semibold text-ink">Subjects saved.</p>}
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

      <section className={card} aria-labelledby="users-h">
        <h2 id="users-h" className="mb-1 text-lg font-extrabold text-ink">Admin users</h2>
        <p className="mb-3 text-sm">{staff} staff {staff === 1 ? 'account' : 'accounts'}. Add staff, change roles and reset authenticators in People.</p>
        <Link href="/admin/people?show=staff" className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-4 text-sm font-bold text-ink no-underline">Manage staff in People</Link>
      </section>

      <section className={card} aria-labelledby="later-h">
        <h2 id="later-h" className="mb-1 text-lg font-extrabold text-ink">Coming in later phases</h2>
        <p className="text-sm">Credit account defaults (Phase 2), email template editor and legal document editor (Phase 3).</p>
      </section>
    </>
  );
}
