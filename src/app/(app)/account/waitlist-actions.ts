'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requirePerson } from '@/lib/auth';
import { offerFreedPlaces } from '@/lib/waitlist';

/** Leave a waitlist. If a place was on offer to you, it passes to the next person straight away. */
export async function leaveWaitlist(form: FormData) {
  const me = await requirePerson();
  const e = await db.waitlistEntry.findFirst({ where: { id: String(form.get('entryId')), personId: me.id } });
  if (e) {
    await db.waitlistEntry.delete({ where: { id: e.id } });
    await db.auditLog.create({ data: { actorId: me.id, action: 'WAITLIST_LEFT', recordType: 'Session', recordId: e.sessionId, after: { hadOffer: !!e.offerToken } } });
    await offerFreedPlaces(e.sessionId);
  }
  revalidatePath('/account');
  redirect('/account?msg=leftwaitlist');
}
