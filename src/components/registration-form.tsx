'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { submitRegistration, type RegState } from '@/app/register/[attendeeId]/actions';
import type { QuestionSet } from '@/lib/registration-sets';

type Props = {
  attendeeId: string;
  token: string;
  set: QuestionSet;
  prefill: Record<string, string>;
  filesOnFile: string[];
};

const input = 'box-border h-[46px] w-full rounded-control border border-field bg-white px-3.5 text-[15px] text-ink aria-[invalid=true]:border-2 aria-[invalid=true]:border-bad-fg';
const area = 'box-border min-h-[88px] w-full rounded-control border border-field bg-white px-3.5 py-2.5 text-[15px] text-ink';
const labelCls = 'flex flex-col gap-1.5 text-sm font-bold text-ink';
const hintCls = 'text-[13px] font-normal text-slate';

export function RegistrationForm({ attendeeId, token, set, prefill, filesOnFile }: Props) {
  const [state, action, pending] = useActionState<RegState, FormData>(submitRegistration, {});
  const f = state.fields ?? {};
  const v = state.values ?? {};
  const val = (k: string) => v[k] ?? prefill[k] ?? '';
  const err = (k: string) => (f[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-err` } : {});
  const E = ({ k }: { k: string }) => (f[k] ? <span id={`${k}-err`} className="text-[13px] font-semibold text-bad-fg">{f[k]}</span> : null);

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="attendeeId" value={attendeeId} />
      <input type="hidden" name="t" value={token} />
      {state.error && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 font-semibold text-bad-fg">{state.error}</p>}

      <section className="rounded-card bg-white p-6 shadow-card md:p-8" aria-labelledby="about-h">
        <h2 id="about-h" className="mb-5 text-[22px] font-extrabold text-ink">About you</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelCls}>First name<input name="firstName" autoComplete="given-name" defaultValue={val('firstName')} className={input} {...err('firstName')} /><E k="firstName" /></label>
          <label className={labelCls}>Last name<input name="lastName" autoComplete="family-name" defaultValue={val('lastName')} className={input} {...err('lastName')} /><E k="lastName" /></label>
          <label className={labelCls}>Email<input type="email" value={prefill.email} readOnly className={`${input} bg-page`} /><span className={hintCls}>To change this, contact us.</span></label>
          <label className={labelCls}>Mobile<input name="mobile" type="tel" autoComplete="tel" defaultValue={val('mobile')} className={input} {...err('mobile')} /><E k="mobile" /></label>
          <label className={labelCls}>Date of birth<input name="dob" inputMode="numeric" placeholder="DD/MM/YYYY" autoComplete="bday" defaultValue={val('dob')} className={input} {...err('dob')} /><span className={hintCls}>Needed by the awarding body.</span><E k="dob" /></label>
          <label className={labelCls}>Employer<input name="employer" autoComplete="organization" defaultValue={val('employer')} className={input} {...err('employer')} /><E k="employer" /></label>
        </div>
      </section>

      {set.questions.length > 0 && (
        <section className="rounded-card bg-white p-6 shadow-card md:p-8" aria-labelledby="course-h">
          <h2 id="course-h" className="mb-5 text-[22px] font-extrabold text-ink">For this course</h2>
          <div className="flex flex-col gap-5">
            {set.questions.map((q) =>
              q.kind === 'file' ? (
                <label key={q.key} className={labelCls}>
                  {q.label}
                  <input name={q.key} type="file" accept="image/jpeg,image/png,application/pdf" className="rounded-control border border-dashed border-field bg-page p-4 text-sm font-normal file:mr-3 file:min-h-11 file:rounded-chip file:border-0 file:bg-ink file:px-4 file:font-bold file:text-white" {...err(q.key)} />
                  <span className={hintCls}>{filesOnFile.includes(q.key) ? 'We already have this file. Upload a new one only to replace it.' : q.hint}</span>
                  <E k={q.key} />
                </label>
              ) : q.kind === 'textarea' ? (
                <label key={q.key} className={labelCls}>
                  {q.label}{q.optional && <span className="font-normal"> (optional)</span>}
                  <textarea name={q.key} defaultValue={val(q.key)} className={area} {...err(q.key)} />
                  {q.hint && <span className={hintCls}>{q.hint}</span>}
                  <E k={q.key} />
                </label>
              ) : (
                <label key={q.key} className={labelCls}>
                  <span>{q.label}{q.optional && <span className="font-normal"> (optional)</span>}</span>
                  <input name={q.key} defaultValue={val(q.key)} className={input} {...err(q.key)} />
                  {q.hint && <span className={hintCls}>{q.hint}</span>}
                  <E k={q.key} />
                </label>
              ),
            )}
          </div>
          {set.note && <p className="mt-5 rounded-control bg-cyan-soft px-4 py-3 text-sm text-ink">{set.note}</p>}
        </section>
      )}

      <div className="flex flex-col gap-3">
        <button type="submit" disabled={pending} className="inline-flex min-h-[56px] items-center justify-center rounded-chip bg-cyan px-6 text-base font-bold text-ink disabled:opacity-60">
          {pending ? 'Saving…' : 'Submit registration'}
        </button>
        <p className="text-sm">See our <Link href="/legal/privacy">privacy notice</Link> for how we use your details.</p>
      </div>
    </form>
  );
}
