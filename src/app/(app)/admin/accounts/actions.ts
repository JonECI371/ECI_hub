'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { audit, requireAdmin } from '@/lib/admin';
import { markStatementPaid } from '@/lib/billing';
import { PO_RULES, creditDefaults } from '@/lib/accounts';

const back = (id: string, msg: string): never => redirect(`/admin/accounts/${id}?msg=${msg}`);

export async function statementPaid(form: FormData) {
  const me = await requireAdmin('/admin/accounts');
  const st = await db.statement.findUniqueOrThrow({ where: { id: String(form.get('statementId')) } });
  await markStatementPaid(st.id, me.id, String(form.get('invoiceNo') ?? '').trim().slice(0, 40) || undefined);
  revalidatePath('/admin', 'layout');
  back(st.accountId, 'paid');
}

export async function setInvoiceNo(form: FormData) {
  const me = await requireAdmin('/admin/accounts');
  const st = await db.statement.findUniqueOrThrow({ where: { id: String(form.get('statementId')) } });
  const no = String(form.get('invoiceNo') ?? '').trim().slice(0, 40) || null;
  await db.statement.update({ where: { id: st.id }, data: { xeroInvoiceNo: no } });
  await audit(me.id, 'STATEMENT_INVOICE_SET', 'Statement', st.id, { xeroInvoiceNo: st.xeroInvoiceNo }, { xeroInvoiceNo: no });
  back(st.accountId, 'saved');
}

/** Change limit, terms or PO rule. Limits above the default need a Super Admin. */
export async function updateTerms(form: FormData) {
  const me = await requireAdmin('/admin/accounts');
  const a = await db.account.findUniqueOrThrow({ where: { id: String(form.get('accountId')) } });
  const limit = Math.round(Number(String(form.get('limit') ?? '').replace(/[£,\s]/g, '')) * 100);
  const terms = Number(form.get('terms'));
  const poRule = String(form.get('poRule'));
  if (!Number.isFinite(limit) || limit < 0 || !Number.isInteger(terms) || terms < 0 || terms > 120 || !(poRule in PO_RULES)) back(a.id, 'invalid');
  const d = await creditDefaults();
  if (limit > d.defaultLimitPence && limit !== a.creditLimitPence && !me.roles.includes('SUPER_ADMIN')) back(a.id, 'needsuper');
  await db.account.update({ where: { id: a.id }, data: { creditLimitPence: limit, paymentTermsDays: terms, poRule } });
  await audit(me.id, 'ACCOUNT_TERMS_CHANGED', 'Account', a.id, { creditLimitPence: a.creditLimitPence, paymentTermsDays: a.paymentTermsDays, poRule: a.poRule }, { creditLimitPence: limit, paymentTermsDays: terms, poRule });
  back(a.id, 'saved');
}

/** Close an account (no more on-account bookings) or reopen it. */
export async function setAccountStatus(form: FormData) {
  const me = await requireAdmin('/admin/accounts');
  const a = await db.account.findUniqueOrThrow({ where: { id: String(form.get('accountId')) } });
  const to = form.get('to') === 'CLOSED' ? 'CLOSED' : 'ACTIVE';
  if (!['ACTIVE', 'CLOSED', 'ON_HOLD'].includes(a.status)) back(a.id, 'invalid');
  await db.account.update({ where: { id: a.id }, data: { status: to } });
  await audit(me.id, to === 'CLOSED' ? 'ACCOUNT_CLOSED' : 'ACCOUNT_REOPENED', 'Account', a.id, { status: a.status }, { status: to });
  back(a.id, to === 'CLOSED' ? 'closed' : 'reopened');
}
