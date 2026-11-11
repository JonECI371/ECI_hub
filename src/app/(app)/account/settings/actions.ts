'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePerson } from '@/lib/auth';

export async function saveMyDetails(form: FormData) {
  const me = await requirePerson();
  const r = z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    mobile: z.string().trim().max(20).regex(/^[0-9 +()-]*$/),
    employer: z.string().trim().max(120),
  }).safeParse(Object.fromEntries(form));
  if (!r.success) redirect('/account/settings?msg=invalid');
  const data = { ...r.data, mobile: r.data.mobile || null, employer: r.data.employer || null, marketingOptIn: form.get('marketing') === 'on' };
  await db.person.update({ where: { id: me.id }, data });
  await db.auditLog.create({ data: { actorId: me.id, action: 'PERSON_UPDATED', recordType: 'Person', recordId: me.id, before: { firstName: me.firstName, lastName: me.lastName, mobile: me.mobile, employer: me.employer, marketingOptIn: me.marketingOptIn }, after: data } });
  redirect('/account/settings?msg=saved');
}

/** Sign out of every device: all sessions started before now stop working, including this one. */
export async function signOutEverywhere() {
  const me = await requirePerson();
  await db.person.update({ where: { id: me.id }, data: { sessionsValidFrom: new Date() } });
  await db.auditLog.create({ data: { actorId: me.id, action: 'SIGNED_OUT_EVERYWHERE', recordType: 'Person', recordId: me.id } });
  redirect('/login?next=/account/settings');
}
