'use client';

import { useActionState, useState } from 'react';
import type { ServiceFormState } from '@/app/(app)/admin/services/actions';
import { SERVICE_FAQ_ROWS, STEP_ROWS, type ServiceForm as Wording } from '@/lib/service-content';

export type ServiceFormValues = { id?: string; title: string; slug: string; status: string; shortDescription: string; seoTitle: string; seoDescription: string; page: Wording };

const input = 'box-border h-[44px] w-full rounded-control border border-field bg-card px-3 text-[15px] text-ink aria-[invalid=true]:border-2 aria-[invalid=true]:border-bad-line';
const area = `${input} h-auto py-2`;
const label = 'flex flex-col gap-1.5 text-sm font-bold text-ink';
const hint = 'text-[13px] font-normal text-slate';
const card = 'rounded-card bg-card p-6 shadow-card';
const STATUS: [string, string, string][] = [['DRAFT', 'Draft', 'Not visible to customers.'], ['PUBLISHED', 'Published', 'On the website.'], ['WITHDRAWN', 'Withdrawn', 'Hidden.']];

export function ServiceForm({ action, initial, siteUrl, courseOptions, serviceOptions }: {
  action: (s: ServiceFormState, f: FormData) => Promise<ServiceFormState>; initial: ServiceFormValues; siteUrl: string;
  courseOptions: { slug: string; title: string }[]; serviceOptions: { slug: string; title: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = state.values ?? {};
  const f = state.fields ?? {};
  // After a refused save the form comes back from what was submitted, not from the stored service.
  const pv = (k: string, fallback: string) => v[k] ?? fallback;
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(!!initial.id || !!initial.slug);
  const [seoTitle, setSeoTitle] = useState(initial.seoTitle || initial.title);
  const [seoDesc, setSeoDesc] = useState(initial.seoDescription || initial.shortDescription);
  const p = initial.page;
  const err = (k: string) => (f[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-err` } : {});
  const E = ({ k }: { k: string }) => (f[k] ? <span id={`${k}-err`} className="text-[13px] font-semibold text-bad-fg">{f[k]}</span> : null);
  const autoSlug = (t: string) => t.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

  return (
    <form action={formAction} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start" noValidate>
      <input type="hidden" name="id" value={initial.id ?? ''} />
      <div className="flex min-w-0 flex-col gap-6">
        {state.error && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">{state.error}</p>}

        <section className={card} aria-labelledby="basics-h">
          <h2 id="basics-h" className="mb-4 text-lg font-extrabold text-ink">Basics</h2>
          <div className="grid gap-4">
            <label className={label}>Service name<input name="title" value={title} onChange={(e) => { setTitle(e.target.value); if (!slugTouched) setSlug(autoSlug(e.target.value)); }} className={input} {...err('title')} /><E k="title" /></label>
            <label className={label}>Short description <span className={hint}>One or two sentences under the title</span><textarea name="shortDescription" rows={3} maxLength={200} defaultValue={pv('shortDescription', initial.shortDescription)} className={area} {...err('shortDescription')} /><E k="shortDescription" /></label>
            <label className={label}>Label above the title <span className={hint}>For example Hazardous areas</span><input name="category" maxLength={60} defaultValue={pv('category', p.category)} className={input} /></label>
          </div>
        </section>

        <section className={card} aria-labelledby="what-h">
          <h2 id="what-h" className="mb-1 text-lg font-extrabold text-ink">The service in plain words</h2>
          <p className="mb-4 text-sm">Leave a box empty and that part of the page is left out. For lists, put one item on each line. Text in square brackets such as [Check: ...] stops the service being published.</p>
          <div className="grid gap-4">
            <label className={label}>What is it? <span className={hint}>Up to 6 paragraphs. Leave a blank line between paragraphs</span><textarea name="whatIsIt" rows={8} defaultValue={pv('whatIsIt', p.whatIsIt)} className={area} {...err('whatIsIt')} /><E k="whatIsIt" /></label>
            <fieldset className="grid gap-3 rounded-control bg-page p-4"><legend className="px-1 text-sm font-bold text-ink">Who needs it?</legend>
              <label className={label}>Opening line<input name="whoIntro" defaultValue={pv('whoIntro', p.whoIntro)} className={input} /></label>
              <label className={label}>The list <span className={hint}>One per line</span><textarea name="whoItems" rows={5} defaultValue={pv('whoItems', p.whoItems)} className={area} /></label>
              <label className={label}>Closing note<input name="whoNote" defaultValue={pv('whoNote', p.whoNote)} className={input} /></label></fieldset>
            <fieldset className="grid gap-3 rounded-control bg-page p-4"><legend className="px-1 text-sm font-bold text-ink">Why does it matter?</legend>
              <label className={label}>Opening line<input name="whyIntro" defaultValue={pv('whyIntro', p.whyIntro)} className={input} /></label>
              <label className={label}>The points <span className={hint}>One per line</span><textarea name="whyPoints" rows={5} defaultValue={pv('whyPoints', p.whyPoints)} className={area} /></label>
              <label className={label}>Closing line<input name="whyClosing" defaultValue={pv('whyClosing', p.whyClosing)} className={input} /></label></fieldset>
          </div>
        </section>

        <section className={card} aria-labelledby="steps-h">
          <h2 id="steps-h" className="mb-1 text-lg font-extrabold text-ink">Our approach, step by step</h2>
          <p className="mb-4 text-sm">Shown as a numbered process. Up to {STEP_ROWS} steps, in order. A step needs both a title and a line of detail.</p>
          <div className="grid gap-3">
            <label className={label}>Opening line<textarea name="approachIntro" rows={2} defaultValue={pv('approachIntro', p.approachIntro)} className={area} /></label>
            {Array.from({ length: STEP_ROWS }, (_, i) => (
              <div key={i} className="grid gap-2 rounded-control bg-page p-3 sm:grid-cols-[220px_1fr]">
                <label className={label}>Step {i + 1}<input name={`step_title_${i}`} maxLength={80} defaultValue={pv(`step_title_${i}`, p.steps[i]?.title ?? '')} className={input} /></label>
                <label className={label}>Detail<input name={`step_text_${i}`} maxLength={400} defaultValue={pv(`step_text_${i}`, p.steps[i]?.text ?? '')} className={input} /></label>
              </div>
            ))}
            <label className={label}>The result <span className={hint}>The closing line after the last step</span><textarea name="approachClosing" rows={2} defaultValue={pv('approachClosing', p.approachClosing)} className={area} /></label>
          </div>
        </section>

        <section className={card} aria-labelledby="facts-h">
          <h2 id="facts-h" className="mb-4 text-lg font-extrabold text-ink">What you get, and key facts</h2>
          <div className="grid gap-4">
            <label className={label}>What you get <span className={hint}>One per line. Also shown in the quote panel</span><textarea name="outcome" rows={4} defaultValue={pv('outcome', p.outcome)} className={area} /></label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className={label}>Standards <span className={hint}>One per line</span><textarea name="standards" rows={4} defaultValue={pv('standards', p.standards)} className={area} /></label>
              <label className={label}>Linked regulation<input name="linkedRegulation" defaultValue={pv('linkedRegulation', p.linkedRegulation)} className={input} /></label>
              <label className={label}>Review<input name="reviewFrequency" placeholder="Every 3 to 5 years" defaultValue={pv('reviewFrequency', p.reviewFrequency)} className={input} /></label>
            </div>
            <label className={label}>When to review <span className={hint}>The triggers, one per line</span><textarea name="triggers" rows={4} defaultValue={pv('triggers', p.triggers)} className={area} /></label>
            <label className={label}>Who we work with <span className={hint}>One per line</span><textarea name="whoWeWorkWith" rows={4} defaultValue={pv('whoWeWorkWith', p.whoWeWorkWith)} className={area} /></label>
          </div>
        </section>

        <section className={card} aria-labelledby="faq-h">
          <h2 id="faq-h" className="mb-1 text-lg font-extrabold text-ink">Questions and answers</h2>
          <p className="mb-4 text-sm">Up to {SERVICE_FAQ_ROWS}. They also appear in search results and to AI assistants.</p>
          <div className="grid gap-3">
            {Array.from({ length: SERVICE_FAQ_ROWS }, (_, i) => (
              <div key={i} className="grid gap-2 rounded-control bg-page p-3">
                <label className={label}>Question {i + 1}<input name={`faq_q_${i}`} maxLength={200} defaultValue={pv(`faq_q_${i}`, p.faqs[i]?.q ?? '')} className={input} /></label>
                <label className={label}>Answer<textarea name={`faq_a_${i}`} rows={2} maxLength={1200} defaultValue={pv(`faq_a_${i}`, p.faqs[i]?.a ?? '')} className={area} /></label>
              </div>
            ))}
          </div>
        </section>

        {(courseOptions.length > 0 || serviceOptions.length > 0) && (
          <section className={card} aria-labelledby="rel-h">
            <h2 id="rel-h" className="mb-3 text-lg font-extrabold text-ink">Often needed alongside</h2>
            {courseOptions.length > 0 && (
              <fieldset className="mb-4"><legend className="mb-2 text-sm font-bold text-ink">Training <span className={hint}>Tick up to 6</span></legend>
                <div className="flex flex-wrap gap-2">{courseOptions.map((o) => <label key={o.slug} className="flex min-h-11 items-center gap-2 rounded-control border border-hairline px-3 text-sm text-ink"><input type="checkbox" name="relatedCourses" value={o.slug} defaultChecked={state.values ? (state.relatedCourses ?? []).includes(o.slug) : p.relatedCourses.includes(o.slug)} className="size-5 accent-ink" />{o.title}</label>)}</div></fieldset>
            )}
            {serviceOptions.length > 0 && (
              <fieldset><legend className="mb-2 text-sm font-bold text-ink">Other consultancy <span className={hint}>Tick up to 6</span></legend>
                <div className="flex flex-wrap gap-2">{serviceOptions.map((o) => <label key={o.slug} className="flex min-h-11 items-center gap-2 rounded-control border border-hairline px-3 text-sm text-ink"><input type="checkbox" name="relatedServices" value={o.slug} defaultChecked={state.values ? (state.relatedServices ?? []).includes(o.slug) : p.relatedServices.includes(o.slug)} className="size-5 accent-ink" />{o.title}</label>)}</div></fieldset>
            )}
          </section>
        )}

        <section className={card} aria-labelledby="seo-h">
          <h2 id="seo-h" className="mb-4 text-lg font-extrabold text-ink">Search and sharing</h2>
          <div className="grid gap-4">
            <label className={label}>Web address<span className="flex items-center gap-1 font-normal"><span className="text-sm">/consultancy/</span><input name="slug" value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }} className={input} {...err('slug')} /></span><E k="slug" /></label>
            <label className={label}>Search title <span className={hint}>{seoTitle.length}/60</span><input name="seoTitle" maxLength={60} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className={input} /></label>
            <label className={label}>Search description <span className={hint}>{seoDesc.length}/155</span><textarea name="seoDescription" rows={2} maxLength={155} value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} className={area} /></label>
            <div className="rounded-control border border-hairline bg-[#FFFFFF] p-4 text-[#4D5156]" aria-label="Google result preview">
              <p className="text-xs">Preview in Google</p>
              <p className="mt-1 truncate text-[13px]">{siteUrl.replace(/^https?:\/\//, '')} › consultancy › {slug}</p>
              <p className="truncate text-lg text-[#1A0DAB]">{seoTitle || 'Service name'} | ECI-Hub</p>
              <p className="line-clamp-2 text-sm">{seoDesc || 'Search description'}</p>
            </div>
          </div>
        </section>
      </div>

      <aside className={`${card} flex flex-col gap-4 xl:sticky xl:top-6`}>
        <h2 className="text-lg font-extrabold text-ink">Status</h2>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Status">
          {STATUS.map(([k, t, d]) => (
            <label key={k} className="flex cursor-pointer gap-3 rounded-control border border-hairline p-3 has-[:checked]:border-2 has-[:checked]:border-ink">
              <input type="radio" name="status" value={k} defaultChecked={pv('status', initial.status) === k} className="mt-1 accent-ink" />
              <span><span className="block font-bold text-ink">{t}</span><span className="text-[13px]">{d}</span></span>
            </label>
          ))}
        </div>
        <button type="submit" disabled={pending} className="inline-flex min-h-[52px] items-center justify-center rounded-chip bg-cyan px-5 font-bold text-on-cyan disabled:opacity-60">{pending ? 'Saving…' : 'Save service'}</button>
      </aside>
    </form>
  );
}
