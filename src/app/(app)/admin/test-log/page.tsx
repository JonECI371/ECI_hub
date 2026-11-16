import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePerson } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Test log', robots: { index: false } };

const KINDS: Record<string, string> = {
  ODD_VALUE: 'Odd value',
  FAST_SUBMIT: 'Very fast',
  AUTOMATED_BROWSER: 'Automated browser',
  NO_INTERACTION: 'No keys or clicks',
  PASTED_TEXT: 'Lots pasted',
};
const dt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' });

export default async function TestLog() {
  await requirePerson(['SUPER_ADMIN'], '/admin/test-log');
  const rows = await db.testAnomaly.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  const people = await db.person.findMany({ where: { id: { in: rows.flatMap((r) => (r.personId ? [r.personId] : [])) } }, select: { id: true, email: true } });
  const who = new Map(people.map((p) => [p.id, p.email]));
  return (
    <>
      <div>
        <p className="mb-1.5 text-xs"><Link href="/admin/settings">Settings</Link> › Test log</p>
        <h1 className="text-[30px] font-extrabold tracking-tight text-ink">Test log</h1>
        <p className="mt-2 max-w-3xl text-sm">Odd input on the booking, credit account and registration forms: placeholder text, hidden characters, very fast or automated-looking submissions, and large pastes. Each line is a prompt to look, not proof. Autofill and password managers can look like &quot;no keys or clicks&quot;, and a quick typist can be fast. Only a Super Admin can see this page, and it is covered by the staff monitoring notice.</p>
      </div>
      <section aria-labelledby="log-h" className="overflow-hidden rounded-card bg-card shadow-card">
        <h2 id="log-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">Latest {rows.length} entries</h2>
        {rows.length === 0 ? <p className="px-6 py-6 text-sm">Nothing logged yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead><tr className="border-b border-hairline text-xs"><th className="px-6 py-3">When</th><th className="px-3 py-3">Signal</th><th className="px-3 py-3">Form</th><th className="px-3 py-3">Field and value</th><th className="px-3 py-3">Detail</th><th className="px-6 py-3">Signed in as</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-hairline last:border-0 align-top">
                    <td className="px-6 py-3 whitespace-nowrap">{dt.format(r.createdAt)}</td>
                    <td className="px-3 py-3 font-bold text-ink">{KINDS[r.kind] ?? r.kind}</td>
                    <td className="px-3 py-3">{r.form}</td>
                    <td className="px-3 py-3">{r.field ? <><span className="font-bold text-ink">{r.field}</span>: {r.value}</> : ''}</td>
                    <td className="px-3 py-3">{r.detail}</td>
                    <td className="px-6 py-3">{r.personId ? who.get(r.personId) ?? 'Unknown' : 'Not signed in'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
