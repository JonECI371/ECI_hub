'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requirePerson } from '@/lib/auth';
import { myMembership } from '@/lib/booker';
import { AccountRuleError, inviteBooker, removeBooker } from '@/lib/accounts';

const back = (msg: string, detail?: string): never => redirect(`/account/team?msg=${msg}${detail ? `&detail=${encodeURIComponent(detail)}` : ''}`);

export async function invite(form: FormData) {
  const me = await requirePerson();
  const m = await myMembership(me.id);
  if (!m) redirect('/account');
  const name = String(form.get('name') ?? '').trim().slice(0, 120);
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!name || !z.string().email().safeParse(email).success) back('invalid');
  try {
    await inviteBooker(m.accountId, me.id, { name, email, jobTitle: String(form.get('jobTitle') ?? '').trim().slice(0, 80) || undefined });
  } catch (e) {
    if (e instanceof AccountRuleError) back('rule', e.message);
    throw e;
  }
  revalidatePath('/account/team');
  back('invited');
}

export async function remove(form: FormData) {
  const me = await requirePerson();
  const m = await myMembership(me.id);
  if (!m) redirect('/account');
  try {
    await removeBooker(m.accountId, me.id, String(form.get('memberId') ?? ''));
  } catch (e) {
    if (e instanceof AccountRuleError) back('rule', e.message);
    throw e;
  }
  revalidatePath('/account/team');
  back('removed');
}
