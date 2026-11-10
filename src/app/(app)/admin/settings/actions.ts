'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { audit } from '@/lib/admin';
import { requirePerson } from '@/lib/auth';

const DISPLAY = ['ALWAYS', 'WHEN_LOW', 'NEVER'];

/** Super Admin: subject rules (shown places, change and cancel cut-off, registration approval, live). */
export async function saveSubjects(form: FormData) {
  const me = await requirePerson(['SUPER_ADMIN'], '/admin/settings');
  const subjects = await db.subject.findMany();
  for (const s of subjects) {
    const hours = Math.round(Number(form.get(`cutoff_${s.id}`)));
    const data = {
      live: form.get(`live_${s.id}`) === 'on',
      placesLeftDisplay: DISPLAY.includes(String(form.get(`display_${s.id}`))) ? String(form.get(`display_${s.id}`)) : s.placesLeftDisplay,
      changeCutoffHours: Number.isFinite(hours) && hours >= 0 && hours <= 24 * 60 ? hours : s.changeCutoffHours,
      approvalRequired: form.get(`approval_${s.id}`) === 'on',
    };
    const changed = (Object.keys(data) as (keyof typeof data)[]).some((k) => data[k] !== s[k]);
    if (!changed) continue;
    await db.subject.update({ where: { id: s.id }, data });
    await audit(me.id, 'SUBJECT_UPDATED', 'Subject', s.id, { live: s.live, placesLeftDisplay: s.placesLeftDisplay, changeCutoffHours: s.changeCutoffHours, approvalRequired: s.approvalRequired }, data);
  }
  revalidatePath('/', 'layout');
  redirect('/admin/settings?msg=saved#subjects');
}
