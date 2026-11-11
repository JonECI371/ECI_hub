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

/** Super Admin: credit account defaults and the Xero import values. */
export async function saveBilling(form: FormData) {
  const me = await requirePerson(['SUPER_ADMIN'], '/admin/settings');
  const pence = (k: string) => Math.round(Number(String(form.get(k) ?? '').replace(/[£,\s]/g, '')) * 100);
  const credit = { defaultLimitPence: pence('defaultLimit'), lowCreditWarnPence: pence('lowCredit'), termsDays: Number(form.get('termsDays')) };
  const xero = { accountCode: String(form.get('accountCode') ?? '').trim().slice(0, 20), taxType: String(form.get('taxType') ?? '').trim().slice(0, 60), invoicePrefix: String(form.get('invoicePrefix') ?? '').trim().slice(0, 10) };
  const ok = Object.values(credit).every((n) => Number.isFinite(n) && n >= 0) && credit.termsDays <= 120 && Number.isInteger(credit.termsDays) && xero.accountCode && xero.taxType;
  if (!ok) redirect('/admin/settings?msg=billinginvalid#billing');
  const before = await db.setting.findMany({ where: { key: { in: ['credit', 'xero'] } } });
  await db.setting.upsert({ where: { key: 'credit' }, create: { key: 'credit', value: credit }, update: { value: credit } });
  await db.setting.upsert({ where: { key: 'xero' }, create: { key: 'xero', value: xero }, update: { value: xero } });
  await audit(me.id, 'SETTINGS_BILLING_SAVED', 'Setting', 'credit,xero', Object.fromEntries(before.map((b) => [b.key, b.value])), { credit, xero });
  revalidatePath('/admin/settings');
  redirect('/admin/settings?msg=billingsaved#billing');
}

/** Super Admin: the cancellation policy, in one place. It drives the Admin steer, checkout wording and the public terms. */
export async function saveCancellationPolicy(form: FormData) {
  const me = await requirePerson(['SUPER_ADMIN'], '/admin/settings');
  const { policyProblem, sortTiers } = await import('@/lib/cancellation-policy');
  const tiers: { daysBefore: number; chargePercent: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const d = String(form.get(`days_${i}`) ?? '').trim(), c = String(form.get(`pct_${i}`) ?? '').trim();
    if (d === '' && c === '') continue;
    tiers.push({ daysBefore: Number(d), chargePercent: Number(c) });
  }
  const policy = { tiers: sortTiers(tiers), lateHours: Number(form.get('lateHours')), intro: String(form.get('intro') ?? '').trim().slice(0, 600) };
  const problem = policyProblem(policy);
  if (problem) redirect(`/admin/settings?msg=policyinvalid&detail=${encodeURIComponent(problem)}#cancellation`);
  const before = await db.setting.findUnique({ where: { key: 'cancellation' } });
  await db.setting.upsert({ where: { key: 'cancellation' }, create: { key: 'cancellation', value: policy }, update: { value: policy } });
  await audit(me.id, 'SETTINGS_CANCELLATION_POLICY_SAVED', 'Setting', 'cancellation', before?.value as never, policy);
  revalidatePath('/', 'layout');
  redirect('/admin/settings?msg=policysaved#cancellation');
}
