import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePerson } from '@/lib/auth';
import { qualState, readQuals } from '@/lib/trainers';
import { Chip } from '@/components/ui';
import { addMyQualification, saveProfile } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Profile and qualifications', robots: { index: false } };

const SUBJECTS = ['CompEx', 'EUSR', 'Thames Water', 'Process safety', 'DSEAR', 'Functional safety'];
const input = 'h-11 w-full rounded-control border border-field bg-white px-3 text-sm text-ink';
const label = 'flex flex-col gap-1 text-sm font-bold text-ink';
const dmy = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const STATE = { valid: ['soft', 'Valid'], soon: ['warn', ''], expired: ['bad', 'Expired'], none: ['grey', 'No expiry'] } as const;

export default async function TrainerProfile({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requirePerson(['TRAINER'], '/trainer');
  const { saved, error } = await searchParams;
  const tp = await db.trainerProfile.findUnique({ where: { personId: me.id } });
  const quals = readQuals(tp?.qualifications).sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999'));
  const expired = quals.filter((q) => qualState(q) === 'expired').length;
  const soon = quals.filter((q) => qualState(q) === 'soon').length;
  const days = (s: string) => Math.ceil((new Date(s).getTime() - Date.now()) / 86400000);

  return (
    <>
      <div><p className="mb-1 text-xs font-bold uppercase tracking-[0.08em]">Trainer</p><h1 className="text-[26px] font-extrabold tracking-tight text-ink">Profile and qualifications</h1></div>
      {saved && <p role="status" className="rounded-control bg-cyan-soft px-4 py-3 text-sm font-semibold text-ink">{saved === 'qual' ? 'Qualification added. The office can see it straight away.' : 'Your details are saved.'}</p>}
      {error && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">{error}</p>}
      {tp?.status === 'PENDING' && <p className="rounded-control bg-warn-bg px-4 py-3 text-sm text-warn-fg">Your trainer account is waiting for approval by ECI-Hub. Add your qualifications below so it can be checked.</p>}
      {(expired > 0 || soon > 0) && (
        <div role="alert" className={`rounded-control px-4 py-3 text-sm ${expired ? 'bg-bad-bg text-bad-fg' : 'bg-warn-bg text-warn-fg'}`}>
          <p className="font-bold">{[expired && `${expired} ${expired === 1 ? 'qualification has' : 'qualifications have'} expired`, soon && `${soon} ${soon === 1 ? 'expires' : 'expire'} within 90 days`].filter(Boolean).join(' and ')}.</p>
          {expired > 0 && <p>You can&apos;t be scheduled for courses while a qualification has expired. Upload the new certificate to fix this.</p>}
        </div>
      )}

      <section aria-labelledby="me-h" className="rounded-card bg-white p-5 shadow-card">
        <h2 id="me-h" className="mb-1 text-lg font-extrabold text-ink">{me.firstName} {me.lastName}</h2>
        <p className="mb-4 text-sm">{tp?.employment === 'EMPLOYED' ? 'Employed trainer' : tp?.employment === 'ASSOCIATE' ? 'Freelance trainer' : 'Trainer'} · {me.email}</p>
        <form action={saveProfile} className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Mobile<input name="mobile" type="tel" defaultValue={me.mobile ?? ''} className={input} /></label>
          <label className={label}>Based in<input name="homeBase" defaultValue={tp?.homeBase ?? ''} placeholder="Guildford" className={input} /></label>
          <fieldset className="sm:col-span-2"><legend className="mb-2 text-sm font-bold text-ink">Delivers</legend>
            <div className="flex flex-wrap gap-2">{SUBJECTS.map((s) => <label key={s} className="flex min-h-11 items-center gap-2 rounded-chip border border-field px-3 text-sm"><input type="checkbox" name="subjects" value={s} defaultChecked={tp?.subjects.includes(s)} className="size-5 accent-ink" />{s}</label>)}</div>
          </fieldset>
          <div><button type="submit" className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-5 text-sm font-bold text-ink">Save details</button></div>
        </form>
      </section>

      <section aria-labelledby="q-h" className="overflow-hidden rounded-card bg-white shadow-card">
        <h2 id="q-h" className="border-b border-hairline px-5 py-4 text-lg font-extrabold text-ink">Qualifications</h2>
        {quals.length === 0 ? <p className="px-5 py-6 text-sm">None yet. Add your first below.</p> : (
          <ul>
            {quals.map((q) => {
              const st = qualState(q);
              const [tone, word] = STATE[st];
              return (
                <li key={q.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4 last:border-0">
                  <div>
                    <p className="font-bold text-ink">{q.name}</p>
                    <p className="text-[13px]">{q.issuer || 'Issuer not given'}{q.expiresAt ? ` · expires ${dmy(q.expiresAt)}` : ''}</p>
                    <div className="mt-1"><Chip tone={tone}>{st === 'soon' ? `Expires in ${days(q.expiresAt!)} days` : word}</Chip></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {q.fileKey && <a href={`/trainer/files/${q.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-4 text-sm font-bold text-ink no-underline">View</a>}
                    {(st === 'expired' || st === 'soon') && <a href={`#add`} className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-4 text-sm font-bold text-ink no-underline">Upload new</a>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section id="add" aria-labelledby="add-h" className="rounded-card bg-white p-5 shadow-card">
        <h2 id="add-h" className="mb-3 text-lg font-extrabold text-ink">Add or renew a qualification</h2>
        <form action={addMyQualification} encType="multipart/form-data" className="grid gap-3 sm:grid-cols-2">
          <label className={`${label} sm:col-span-2`}>Replaces <span className="font-normal">(when renewing)</span><select name="replaces" className={input}><option value="">Nothing, this is new</option>{quals.map((q) => <option key={q.id} value={q.id}>{q.name}{q.expiresAt ? `, ${dmy(q.expiresAt)}` : ''}</option>)}</select></label>
          <label className={label}>Qualification<input name="name" required placeholder="CompEx Ex12 instructor" className={input} /></label>
          <label className={label}>Issued by<input name="issuer" placeholder="EngTech Ltd" className={input} /></label>
          <label className={label}>Expires<input name="expiresAt" type="date" className={input} /></label>
          <label className={label}>Certificate<input name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="text-sm font-normal" /></label>
          <div className="sm:col-span-2"><button type="submit" className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-5 text-sm font-bold text-ink">Add qualification</button></div>
        </form>
      </section>
    </>
  );
}
