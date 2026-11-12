'use server';

import { z } from 'zod';
import { db } from '@/lib/db';
import { INDUSTRIES, PO_RULES, submitApplication, type PoRule } from '@/lib/accounts';
import { normaliseCompanyNumber } from '@/lib/integrations/companies-house';

export type ApplyState = { ok?: boolean; firstName?: string; error?: string; fields?: Record<string, string>; values?: Record<string, string>; others?: number };

const email = (v: string) => z.string().email().safeParse(v).success;

export async function applyForAccount(_prev: ApplyState, form: FormData): Promise<ApplyState> {
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string' && !k.startsWith('$')) values[k] = v.trim().slice(0, 1000);
  const get = (k: string) => values[k] ?? '';
  const others = Math.max(1, Math.min(10, Number(get('others')) || 1));
  if (get('url')) return { ok: true }; // bots fill the hidden field
  const f: Record<string, string> = {};
  if (!get('company')) f.company = 'Enter the company name';
  const number = normaliseCompanyNumber(get('companyNumber'));
  if (!number) f.companyNumber = 'Enter the 8-character Companies House number, like 09147227 or SC123456';
  const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
  if (!get('reg_line1')) f.reg_line1 = 'Enter the first line of the registered address';
  if (!get('reg_town')) f.reg_town = 'Enter the town or city';
  if (!POSTCODE.test(get('reg_postcode'))) f.reg_postcode = 'Enter a UK postcode, like TW16 5DA';
  const invoiceGiven = !!(get('inv_line1') || get('inv_town') || get('inv_postcode'));
  if (invoiceGiven) {
    if (!get('inv_line1')) f.inv_line1 = 'Enter the first line of the invoice address';
    if (!get('inv_town')) f.inv_town = 'Enter the town or city';
    if (!POSTCODE.test(get('inv_postcode'))) f.inv_postcode = 'Enter a UK postcode';
  }
  if (get('accountsPhone') && !/^[0-9 +()-]{7,20}$/.test(get('accountsPhone'))) f.accountsPhone = 'Enter a phone number, like 01932 963463';
  if (get('website') && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(get('website'))) f.website = 'Enter a web address, like www.company.co.uk';
  if (!INDUSTRIES.includes(get('industry'))) f.industry = 'Choose an industry';
  if (!get('firstName')) f.firstName = 'Enter your first name';
  if (!get('lastName')) f.lastName = 'Enter your last name';
  if (!email(get('email'))) f.email = 'Enter your work email, like name@company.co.uk';
  if (!/^[0-9 +()-]{7,20}$/.test(get('phone'))) f.phone = 'Enter a phone number, like 01932 963463';
  if (!get('jobTitle')) f.jobTitle = 'Enter your job title';
  const bookers: { name: string; email: string; jobTitle?: string }[] = [];
  for (let i = 0; i < others; i++) {
    const n = get(`other_name_${i}`), e = get(`other_email_${i}`);
    if (!n && !e) continue;
    if (!n) f[`other_name_${i}`] = 'Enter their name';
    if (!email(e)) f[`other_email_${i}`] = 'Enter a valid email address';
    else if (e.toLowerCase() === get('email').toLowerCase()) f[`other_email_${i}`] = 'You are already the main booker';
    bookers.push({ name: n, email: e, jobTitle: get(`other_job_${i}`) || undefined });
  }
  if (!get('accountsName')) f.accountsName = 'Enter the accounts contact name';
  if (!email(get('accountsEmail'))) f.accountsEmail = 'Enter the email monthly invoices go to';
  const pounds = Number(get('creditLimit').replace(/[£,\s]/g, ''));
  let credit = 0;
  if (!get('creditLimit')) f.creditLimit = 'Enter the credit limit you need';
  else if (!Number.isFinite(pounds) || pounds < 100 || pounds > 250000) f.creditLimit = 'Enter an amount between £100 and £250,000';
  else credit = Math.round(pounds * 100);
  if (!(get('poRule') in PO_RULES)) f.poRule = 'Choose whether invoices need a PO number';
  const delegates = get('expectedDelegates') ? Number(get('expectedDelegates')) : undefined;
  if (delegates !== undefined && (!Number.isInteger(delegates) || delegates < 0 || delegates > 100000)) f.expectedDelegates = 'Enter a whole number';
  if (get('terms') !== 'on') f.terms = 'Accept the terms to apply';
  if (Object.keys(f).length) return { error: 'Check the highlighted fields.', fields: f, values, others };

  // One application per company number while one is being checked, and 3 an hour from one email.
  const pending = await db.account.findFirst({ where: { companyNumber: number!, status: { in: ['APPLIED', 'ACTIVE', 'ON_HOLD'] } } });
  if (pending) return { error: pending.status === 'APPLIED' ? 'We already have an application for this company and are checking it. We will be in touch within one working day.' : 'This company already has a credit account. Ask its main booker to add you, or call us on +44 (0) 1932 963463.', values, others };
  const recent = await db.account.count({ where: { createdAt: { gt: new Date(Date.now() - 3600000) }, members: { some: { role: 'MAIN_BOOKER', person: { email: get('email').toLowerCase() } } } } });
  if (recent >= 3) return { error: 'You have sent several applications in the last hour. Please call us on +44 (0) 1932 963463.', values, others };

  await submitApplication({
    company: get('company'), companyNumber: number!, vatNumber: get('vatNumber'), registered: { line1: get('reg_line1'), line2: get('reg_line2'), town: get('reg_town'), county: get('reg_county'), postcode: get('reg_postcode').toUpperCase().replace(/\s+/g, ' ') }, invoice: invoiceGiven ? { line1: get('inv_line1'), line2: get('inv_line2'), town: get('inv_town'), county: get('inv_county'), postcode: get('inv_postcode').toUpperCase().replace(/\s+/g, ' ') } : undefined, accountsPhone: get('accountsPhone') || undefined, website: get('website'), industry: get('industry'),
    main: { firstName: get('firstName'), lastName: get('lastName'), email: get('email'), phone: get('phone'), jobTitle: get('jobTitle') },
    others: bookers, accountsName: get('accountsName'), accountsEmail: get('accountsEmail'), 
    creditRequestedPence: credit!, poRule: get('poRule') as PoRule, expectedDelegates: delegates,
  });
  return { ok: true, firstName: get('firstName') };
}
