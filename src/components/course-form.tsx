'use client';

import { DURATION_UNITS } from '@/lib/duration';
import { useActionState, useState } from 'react';
import type { DeliveryType } from '@prisma/client';
import type { CourseFormState } from '@/app/(app)/admin/courses/actions';

export type CourseFormValues = {
  id?: string; title: string; slug: string; subjectId: string; pricePounds: string; vatRatePercent: string; shortDescription: string; description: string;
  deliveryType: DeliveryType; durationText: string; durationValue: string; durationUnit: string; defaultStartTime: string; defaultEndTime: string; placesPerSession: string; meetingPlatform: string; meetingHost: string; defaultVenueId: string; venueRelease: string;
  provider: string; fulfilment: string; providerEmail: string; daysToComplete: string; validityYears: string; accreditation: string; seoTitle: string; seoDescription: string; status: string; photoUrl: string; photoAlt: string;
};

const input = 'box-border h-[44px] w-full rounded-control border border-field bg-white px-3 text-[15px] text-ink aria-[invalid=true]:border-2 aria-[invalid=true]:border-bad-fg';
const label = 'flex flex-col gap-1.5 text-sm font-bold text-ink';
const hint = 'text-[13px] font-normal text-slate';
const card = 'rounded-card bg-white p-6 shadow-card';
const DELIVERY: [DeliveryType, string, string][] = [
  ['ELEARNING', 'eLearning', 'Self-paced. No dates. Enrol on a provider platform.'],
  ['VIRTUAL_CLASSROOM', 'Virtual classroom', 'Live on Teams or Zoom. Fixed dates and a place limit.'],
  ['IN_PERSON', 'In person', 'At our centre or a client site. Fixed dates and a place limit.'],
];

export function CourseForm({ action, initial, subjects, venues, siteUrl }: {
  action: (s: CourseFormState, f: FormData) => Promise<CourseFormState>;
  initial: CourseFormValues; subjects: { id: string; name: string }[]; venues: { id: string; name: string }[]; siteUrl: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = { ...initial, ...(state.values ?? {}) } as CourseFormValues;
  const [delivery, setDelivery] = useState<DeliveryType>(initial.deliveryType);
  const [seoTitle, setSeoTitle] = useState(initial.seoTitle || initial.title);
  const [seoDesc, setSeoDesc] = useState(initial.seoDescription || initial.shortDescription);
  const [slug, setSlug] = useState(initial.slug);
  const f = state.fields ?? {};
  const err = (k: string) => (f[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-err` } : {});
  const E = ({ k }: { k: string }) => (f[k] ? <span id={`${k}-err`} className="text-[13px] font-semibold text-bad-fg">{f[k]}</span> : null);

  return (
    <form action={formAction} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start" noValidate>
      <input type="hidden" name="id" value={initial.id ?? ''} />
      <input type="hidden" name="deliveryType" value={delivery} />
      <div className="flex min-w-0 flex-col gap-6">
        {state.error && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 font-semibold text-bad-fg">{state.error}</p>}
        <section className={card} aria-labelledby="basics-h">
          <h2 id="basics-h" className="mb-4 text-lg font-extrabold text-ink">Basics</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={`${label} sm:col-span-2`}>Course name<input name="title" defaultValue={v.title} className={input} {...err('title')} /><E k="title" /></label>
            <label className={label}>Subject<select name="subjectId" defaultValue={v.subjectId} className={input}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className={label}>Price per place (excl. VAT, £)<input name="pricePounds" inputMode="decimal" defaultValue={v.pricePounds} className={input} {...err('pricePounds')} /><span className={hint}>Leave at 0 to show &ldquo;Price on request&rdquo;. Online booking needs a price.</span><E k="pricePounds" /></label>
            <label className={label}>VAT rate (%)<input name="vatRatePercent" inputMode="numeric" defaultValue={v.vatRatePercent} className={input} /></label>
            <div className={label}>
              <span>Duration</span>
              <span className="flex gap-2">
                <input name="durationValue" type="number" min={1} max={999} aria-label="Duration number" defaultValue={v.durationValue} placeholder="2" className={`${input} w-24`} {...err('durationValue')} />
                <select name="durationUnit" aria-label="Duration unit" defaultValue={v.durationUnit || 'days'} className={input}>{DURATION_UNITS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </span>
              <span className={hint}>Choose Half day or Self-paced if there is no number. A new date fills in its last day from this.</span>
              <E k="durationValue" />
            </div>
            {delivery !== 'ELEARNING' && (
              <>
                <label className={label}>Usual start time<input name="defaultStartTime" type="time" defaultValue={v.defaultStartTime} className={input} /><span className={hint}>Used when adding a date. You can change it per date.</span></label>
                <label className={label}>Usual end time<input name="defaultEndTime" type="time" defaultValue={v.defaultEndTime} className={input} /></label>
              </>
            )}
            <label className={`${label} sm:col-span-2`}>Short description<input name="shortDescription" maxLength={160} defaultValue={v.shortDescription} className={input} {...err('shortDescription')} /><span className={hint}>On the course card. Up to 160 characters.</span><E k="shortDescription" /></label>
            <label className={`${label} sm:col-span-2`}>Description<textarea name="description" defaultValue={v.description} className="min-h-[110px] rounded-control border border-field px-3 py-2 text-[15px] font-normal" {...err('description')} /><span className={hint}>The opening paragraph on the course page. Needed to publish.</span><E k="description" /></label>
          </div>
        </section>

        <section className={card} aria-labelledby="photo-h">
          <h2 id="photo-h" className="mb-1 text-lg font-extrabold text-ink">Course photo</h2>
          <p className="mb-4 text-sm">Shown on the course card and when the page is shared. Landscape works best, at least 1200 pixels wide.</p>
          <input type="hidden" name="currentPhoto" value={initial.photoUrl} />
          <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
            {initial.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={initial.photoUrl} alt={initial.photoAlt} className="aspect-[3/2] w-full rounded-control object-cover" />
            ) : (
              <div className="flex aspect-[3/2] w-full items-center justify-center rounded-control bg-[#D9DBDF] text-xs font-bold uppercase tracking-[0.08em] text-slate">No photo yet</div>
            )}
            <div className="flex flex-col gap-3">
              <label className={label}>{initial.photoUrl ? 'Replace photo' : 'Upload a photo'}<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="text-sm font-normal" {...err('photo')} /><span className={hint}>JPEG, PNG or WebP, up to 5MB.</span><E k="photo" /></label>
              <label className={label}>Describe the photo<input name="photoAlt" defaultValue={v.photoAlt} placeholder="Delegate checking an Ex d enclosure on a training rig" className={input} {...err('photoAlt')} /><span className={hint}>Read out by screen readers. Say what the photo shows.</span><E k="photoAlt" /></label>
              {initial.photoUrl && <label className="flex min-h-11 items-center gap-2 text-sm text-ink"><input type="checkbox" name="removePhoto" className="size-5 accent-ink" />Remove the photo</label>}
            </div>
          </div>
        </section>

        <section className={card} aria-labelledby="del-h">
          <h2 id="del-h" className="mb-1 text-lg font-extrabold text-ink">How is it delivered?</h2>
          <p className="mb-4 text-sm">This sets the booking journey, registration questions, emails and admin tasks.</p>
          <div className="mb-5 grid gap-3 md:grid-cols-3" role="radiogroup" aria-labelledby="del-h">
            {DELIVERY.map(([d, t, desc]) => (
              <label key={d} className={`flex cursor-pointer gap-3 rounded-control border p-4 ${delivery === d ? 'border-2 border-ink bg-cyan-soft' : 'border-hairline'}`}>
                <input type="radio" name="deliveryRadio" checked={delivery === d} onChange={() => setDelivery(d)} className="mt-1 accent-ink" />
                <span><span className="block font-bold text-ink">{t}</span><span className="text-[13px]">{desc}</span></span>
              </label>
            ))}
          </div>
          {delivery === 'ELEARNING' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={label}>Provider name<input name="provider" defaultValue={v.provider} placeholder="EUSR QuartzWeb, Trainor" className={input} {...err('provider')} /><E k="provider" /></label>
              <label className={label}>Days to complete<input name="daysToComplete" inputMode="numeric" defaultValue={v.daysToComplete} className={input} /></label>
              <fieldset className="sm:col-span-2"><legend className="mb-2 text-sm font-bold text-ink">After registration</legend>
                {[['ADMIN_TASK', 'Add an enrolment task for admin'], ['EMAIL_PROVIDER', 'Email the enrolment pack to the provider']].map(([val, t]) => (
                  <label key={val} className="mb-2 flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-ink"><input type="radio" name="fulfilment" value={val} defaultChecked={(v.fulfilment || 'ADMIN_TASK') === val} className="accent-ink" />{t}</label>
                ))}
              </fieldset>
              <label className={`${label} sm:col-span-2`}>Provider email (for emailed packs)<input name="providerEmail" type="email" defaultValue={v.providerEmail} className={input} {...err('providerEmail')} /><E k="providerEmail" /></label>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={label}>Places per session<input name="placesPerSession" inputMode="numeric" defaultValue={v.placesPerSession} className={input} {...err('placesPerSession')} /><E k="placesPerSession" /></label>
              {delivery === 'VIRTUAL_CLASSROOM' ? (
                <>
                  <label className={label}>Meeting platform<select name="meetingPlatform" defaultValue={v.meetingPlatform || 'TEAMS'} className={input}><option value="TEAMS">Microsoft Teams</option><option value="ZOOM">Zoom</option></select></label>
                  <label className={`${label} sm:col-span-2`}>Host mailbox<input name="meetingHost" type="email" defaultValue={v.meetingHost} placeholder="training@eci-hub.co.uk" className={input} /><span className={hint}>One meeting is created per session and sent to every delegate, the booker and the trainer.</span></label>
                </>
              ) : (
                <>
                  <label className={label}>Default venue<select name="defaultVenueId" defaultValue={v.defaultVenueId} className={input}><option value="">Client site (set per session)</option>{venues.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                  <fieldset className="sm:col-span-2"><legend className="mb-2 text-sm font-bold text-ink">When delegates see the venue address</legend>
                    {[['ON_CONFIRMATION', 'In their booking confirmation'], ['AFTER_APPROVAL', 'After their registration is approved']].map(([val, t]) => (
                      <label key={val} className="mb-2 flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-ink"><input type="radio" name="venueRelease" value={val} defaultChecked={(v.venueRelease || 'ON_CONFIRMATION') === val} className="accent-ink" />{t}</label>
                    ))}
                  </fieldset>
                </>
              )}
            </div>
          )}
        </section>

        <section className={card} aria-labelledby="after-h">
          <h2 id="after-h" className="mb-4 text-lg font-extrabold text-ink">After the course</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>Certificate valid for (years)<input name="validityYears" inputMode="numeric" defaultValue={v.validityYears} placeholder="Leave empty if it does not expire" className={input} /></label>
            <label className={label}>Awarded by<input name="accreditation" defaultValue={v.accreditation} placeholder="CompEx, EUSR, Cogent Skills" className={input} /></label>
          </div>
          <p className="mt-3 text-[13px]">Registration questions and approval come from the subject, in Settings.</p>
        </section>

        <section className={card} aria-labelledby="seo-h">
          <h2 id="seo-h" className="mb-4 text-lg font-extrabold text-ink">Search and sharing</h2>
          <div className="grid gap-4">
            <label className={label}>Web address<span className="flex items-center gap-1 font-normal"><span className="text-sm">/courses/</span><input name="slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} className={input} {...err('slug')} /></span><span className={hint}>Changing this breaks old links. Leave it once a course is live.</span><E k="slug" /></label>
            <label className={label}>Search title <span className={hint}>{seoTitle.length}/60</span><input name="seoTitle" maxLength={60} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className={input} /></label>
            <label className={label}>Search description <span className={hint}>{seoDesc.length}/155</span><textarea name="seoDescription" maxLength={155} value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} className="min-h-[72px] rounded-control border border-field px-3 py-2 text-[15px] font-normal" /></label>
            <div className="rounded-control border border-hairline p-4" aria-label="Google result preview">
              <p className="text-xs">Preview in Google</p>
              <p className="mt-1 truncate text-[13px] text-[#4D5156]">{siteUrl.replace(/^https?:\/\//, '')} › courses › {slug}</p>
              <p className="truncate text-lg text-[#1A0DAB]">{seoTitle || 'Course name'} | ECI-Hub</p>
              <p className="line-clamp-2 text-sm text-[#4D5156]">{seoDesc || 'Search description'}</p>
            </div>
          </div>
        </section>
      </div>

      <aside className={`${card} flex flex-col gap-4 xl:sticky xl:top-6`}>
        <h2 className="text-lg font-extrabold text-ink">Status</h2>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Status</legend>
          {[['DRAFT', 'Draft', 'Not visible to customers.'], ['PUBLISHED', 'Published', 'On the website and bookable.'], ['WITHDRAWN', 'Withdrawn', 'Hidden. Existing bookings stay.']].map(([val, t, d]) => (
            <label key={val} className="flex cursor-pointer gap-3 rounded-control border border-hairline p-3"><input type="radio" name="status" value={val} defaultChecked={v.status === val} className="mt-1 accent-ink" /><span><span className="block font-bold text-ink">{t}</span><span className="text-[13px]">{d}</span></span></label>
          ))}
        </fieldset>
        <button type="submit" disabled={pending} className="inline-flex min-h-[52px] items-center justify-center rounded-chip bg-cyan px-5 font-bold text-ink disabled:opacity-60">{pending ? 'Saving…' : 'Save course'}</button>
      </aside>
    </form>
  );
}
