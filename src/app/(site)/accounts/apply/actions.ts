'use server';

import { z } from 'zod';
import { db } from '@/lib/db';
import { INDUSTRIES, PO_RULES, submitApplication, type PoRule } from '@/lib/accounts';
import { normaliseCompanyNumber } from '@/lib/integrations/companies-house';

export type ApplyState = { ok?: boolean; firstName?: string; error?: string; fields?: Record<string, string>; values?: Record<string, string>; others?: number };

const LIMITS: Record<string, number> = { '2500': 250000, '5000': 500000, '10000': 1000000, '25000': 2500000 };
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
  if (!get('registeredAddress')) f.registeredAddress = 'Enter the registered address';
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
  let credit = LIMITS[get('creditLimit')];
  if (get('creditLimit') === 'other') {
    const pounds = Number(get('creditOther').replace(/[£,\s]/g, ''));
    if (!Number.isFinite(pounds) || pounds < 500 || pounds > 250000) f.creditOther = 'Enter an amount between £500 and £250,000';
    else credit = Math.round(pounds) * 100;
  } else if (!credit) f.creditLimit = 'Choose a credit limit';
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
    company: get('company'), companyNumber: number!, vatNumber: get('vatNumber'), registeredAddress: get('registeredAddress'), website: get('website'), industry: get('industry'),
    main: { firstName: get('firstName'), lastName: get('lastName'), email: get('email'), phone: get('phone'), jobTitle: get('jobTitle') },
    others: bookers, accountsName: get('accountsName'), accountsEmail: get('accountsEmail'), invoiceAddress: get('invoiceAddress'),
    creditRequestedPence: credit!, poRule: get('poRule') as PoRule, expectedDelegates: delegates,
  });
  return { ok: true, firstName: get('firstName') };
}
