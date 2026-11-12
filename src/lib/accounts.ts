import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { SITE_URL, money as gbp } from '@/lib/format';
import { findOrCreatePerson } from '@/lib/booking';
import { sendEmail } from '@/lib/integrations/email';
import { checkCompany } from '@/lib/integrations/companies-house';
import { enqueueXero } from '@/lib/xero-queue';
import { kickXero } from '@/lib/xero-sync';

/** defaultLimitPence is the starting limit; adminLimitPence is the most an Admin can approve (above it needs a Super Admin). */
export type CreditDefaults = { defaultLimitPence: number; adminLimitPence: number; lowCreditWarnPence: number; termsDays: number };
const DEFAULTS: CreditDefaults = { defaultLimitPence: 100000, adminLimitPence: 500000, lowCreditWarnPence: 50000, termsDays: 30 };

/** Credit account defaults from Settings (key "credit"), falling back to £1,000 limit, £5,000 Admin ceiling, £500 warning, 30 days. */
export async function creditDefaults(): Promise<CreditDefaults> {
  const s = await db.setting.findUnique({ where: { key: 'credit' } });
  return { ...DEFAULTS, ...((s?.value ?? {}) as Partial<CreditDefaults>) };
}

export const INDUSTRIES = ['Water and utilities', 'Oil and gas', 'Chemical and petrochemical', 'COMAH site', 'Contractor', 'Other'];
export const PO_RULES = { NONE: 'No', PER_BOOKING: 'Yes, one PO per booking', PER_ACCOUNT: 'Yes, one PO for the account' } as const;
export type PoRule = keyof typeof PO_RULES;

export type Address = { line1: string; line2?: string; town: string; county?: string; postcode: string };
const addressText = (a: Address) => [a.line1, a.line2, a.town, a.county, a.postcode].filter(Boolean).join(', ');

export type Application = {
  company: string; companyNumber: string; vatNumber?: string; registered: Address; invoice?: Address; accountsPhone?: string; website?: string; industry: string;
  main: { firstName: string; lastName: string; email: string; phone: string; jobTitle: string };
  others: { name: string; email: string; jobTitle?: string }[];
  accountsName: string; accountsEmail: string;
  creditRequestedPence: number; poRule: PoRule; expectedDelegates?: number;
};

/** Saves an application: the account (APPLIED), its bookers (pending), an approval task, and a Companies House check. */
export async function submitApplication(a: Application) {
  const account = await db.$transaction(async (tx) => {
    const main = await findOrCreatePerson(tx, { email: a.main.email, firstName: a.main.firstName, lastName: a.main.lastName, mobile: a.main.phone });
    await tx.person.update({ where: { id: main.id }, data: { jobTitle: main.jobTitle ?? (a.main.jobTitle || null), employer: main.employer ?? a.company } });
    const acc = await tx.account.create({
      data: {
        company: a.company, companyNumber: a.companyNumber, vatNumber: a.vatNumber || null, registeredAddress: addressText(a.registered), addresses: { registered: a.registered, ...(a.invoice ? { invoice: a.invoice } : {}) }, accountsPhone: a.accountsPhone ?? null, website: a.website || null, industry: a.industry,
        invoiceAddress: a.invoice ? addressText(a.invoice) : null, accountsName: a.accountsName, accountsEmail: a.accountsEmail.toLowerCase(), creditRequestedPence: a.creditRequestedPence,
        poRule: a.poRule, expectedDelegates: a.expectedDelegates ?? null, status: 'APPLIED',
        members: { create: [{ personId: main.id, role: 'MAIN_BOOKER', status: 'PENDING_APPROVAL' }] },
      },
    });
    for (const o of a.others) {
      const parts = o.name.trim().split(/\s+/);
      const p = await findOrCreatePerson(tx, { email: o.email, firstName: parts[0], lastName: parts.slice(1).join(' ') || '-' });
      if (o.jobTitle && !p.jobTitle) await tx.person.update({ where: { id: p.id }, data: { jobTitle: o.jobTitle } });
      if (p.id !== main.id) await tx.accountMember.upsert({ where: { accountId_personId: { accountId: acc.id, personId: p.id } }, create: { accountId: acc.id, personId: p.id, role: 'BOOKER', status: 'PENDING_APPROVAL' }, update: {} });
    }
    await tx.task.create({ data: { type: 'ACCOUNT_APPLICATION', title: `Credit account: ${a.company}`, detail: `${gbp(a.creditRequestedPence)} requested by ${a.main.firstName} ${a.main.lastName}`, recordType: 'Account', recordId: acc.id } });
    await tx.auditLog.create({ data: { actorId: main.id, action: 'ACCOUNT_APPLIED', recordType: 'Account', recordId: acc.id, after: { company: a.company, companyNumber: a.companyNumber, creditRequestedPence: a.creditRequestedPence } } });
    return acc;
  });
  const check = await checkCompany(a.companyNumber, account.id);
  await db.account.update({ where: { id: account.id }, data: { companiesHouse: check as Prisma.InputJsonValue } });
  await sendEmail({
    to: a.main.email, trigger: 'ACCOUNT_APPLIED', subject: `We're checking your credit account application`,
    blocks: [
      { type: 'heading', text: `Thanks ${a.main.firstName}, we're checking your application` },
      { type: 'text', text: "We check Companies House and run a credit check, usually within one working day. Once approved, you and your bookers get a sign-in link to start booking on account." },
      { type: 'summary', rows: [['Company', a.company], ['Company number', a.companyNumber], ['Credit requested', gbp(a.creditRequestedPence)]] },
      { type: 'text', text: 'Need to book before then? You can book and pay by card at any time.' },
      { type: 'button', label: 'Browse courses', href: '/courses' },
    ],
  });
  return account;
}

export class AccountRuleError extends Error {}

/** Approve an application. Limits above the default need a Super Admin. Activates the bookers and sends sign-in links. */
export async function approveAccount(accountId: string, actor: { id: string; roles: string[] }, terms: { creditLimitPence: number; paymentTermsDays: number; poRule: PoRule }) {
  const d = await creditDefaults();
  if (terms.creditLimitPence > d.adminLimitPence && !actor.roles.includes('SUPER_ADMIN')) throw new AccountRuleError(`Limits above ${gbp(d.adminLimitPence)} need a Super Admin.`);
  if (terms.creditLimitPence < 0 || terms.paymentTermsDays < 0 || terms.paymentTermsDays > 120) throw new AccountRuleError('Check the limit and terms.');
  const acc = await db.$transaction(async (tx) => {
    const r = await tx.account.updateMany({ where: { id: accountId, status: 'APPLIED' }, data: { status: 'ACTIVE', creditLimitPence: terms.creditLimitPence, paymentTermsDays: terms.paymentTermsDays, poRule: terms.poRule, approvedAt: new Date(), approvedById: actor.id } });
    if (!r.count) throw new AccountRuleError('This application has already been dealt with.');
    await tx.accountMember.updateMany({ where: { accountId, status: 'PENDING_APPROVAL' }, data: { status: 'ACTIVE' } });
    const acc = await tx.account.findUniqueOrThrow({ where: { id: accountId }, include: { members: { include: { person: true } } } });
    for (const m of acc.members) if (!m.person.roles.includes('BOOKER')) await tx.person.update({ where: { id: m.personId }, data: { roles: { push: 'BOOKER' } } });
    await enqueueXero(tx, 'CONTACT', 'Account', accountId, `CONTACT:${accountId}:approved`); // the full company contact goes to Xero
    await tx.auditLog.create({ data: { actorId: actor.id, action: 'ACCOUNT_APPROVED', recordType: 'Account', recordId: accountId, before: { status: 'APPLIED' }, after: { status: 'ACTIVE', ...terms } } });
    await tx.task.updateMany({ where: { type: 'ACCOUNT_APPLICATION', recordId: accountId, status: 'OPEN' }, data: { status: 'DONE', doneAt: new Date(), assigneeId: actor.id } });
    return acc;
  });
  kickXero();
  for (const m of acc.members) {
    await sendEmail({
      to: m.person.email, personId: m.personId, trigger: 'ACCOUNT_APPROVED', subject: `Your ECI-Hub credit account is ready: ${acc.company}`,
      blocks: [
        { type: 'heading', text: `You can book on account, ${m.person.firstName}` },
        { type: 'text', text: `${acc.company} now has a credit account with ECI-Hub. Book any course and choose Pay on account at checkout. We bill once a month.` },
        { type: 'summary', rows: [['Company', acc.company], ['Credit limit', gbp(acc.creditLimitPence)], ['Payment terms', `${acc.paymentTermsDays} days`], ['PO numbers', PO_RULES[acc.poRule as PoRule] ?? 'No']] },
        { type: 'text', text: 'Sign in with your work email. We send you a code each time, so there is no password to remember.' },
        { type: 'button', label: 'Sign in', href: `${SITE_URL}/login?email=${encodeURIComponent(m.person.email)}` },
      ],
    });
  }
  return acc;
}

/** Decline an application, with a reason that goes to the main booker. */
export async function declineAccount(accountId: string, actorId: string, reason: string) {
  const acc = await db.$transaction(async (tx) => {
    const r = await tx.account.updateMany({ where: { id: accountId, status: 'APPLIED' }, data: { status: 'DECLINED' } });
    if (!r.count) throw new AccountRuleError('This application has already been dealt with.');
    await tx.accountMember.updateMany({ where: { accountId }, data: { status: 'REMOVED' } });
    await tx.auditLog.create({ data: { actorId, action: 'ACCOUNT_DECLINED', recordType: 'Account', recordId: accountId, before: { status: 'APPLIED' }, after: { status: 'DECLINED', reason } } });
    await tx.task.updateMany({ where: { type: 'ACCOUNT_APPLICATION', recordId: accountId, status: 'OPEN' }, data: { status: 'DONE', doneAt: new Date(), assigneeId: actorId } });
    return tx.account.findUniqueOrThrow({ where: { id: accountId }, include: { members: { where: { role: 'MAIN_BOOKER' }, include: { person: true } } } });
  });
  const main = acc.members[0]?.person;
  if (main) {
    await sendEmail({
      to: main.email, personId: main.id, trigger: 'ACCOUNT_DECLINED', subject: 'Your credit account application',
      blocks: [
        { type: 'heading', text: 'We cannot open a credit account this time' },
        { type: 'text', text: `Hello ${main.firstName}, thank you for applying for a credit account for ${acc.company}. We are not able to open one at the moment.` },
        ...(reason ? [{ type: 'summary' as const, rows: [['Reason', reason]] as [string, string][] }] : []),
        { type: 'text', text: 'You can still book any course and pay by card. Questions? Call us on +44 (0) 1932 963463.' },
        { type: 'button', label: 'Browse courses', href: '/courses' },
      ],
    });
  }
  return acc;
}

/** Main booker invites a booker. They wait for ECI approval (a New booker task) before they can book on account. */
export async function inviteBooker(accountId: string, inviterId: string, p: { name: string; email: string; jobTitle?: string }) {
  return db.$transaction(async (tx) => {
    const inviter = await tx.accountMember.findFirst({ where: { accountId, personId: inviterId, role: 'MAIN_BOOKER', status: 'ACTIVE' }, include: { account: true } });
    if (!inviter) throw new AccountRuleError('Only the main booker can invite bookers.');
    const parts = p.name.trim().split(/\s+/);
    const person = await findOrCreatePerson(tx, { email: p.email, firstName: parts[0], lastName: parts.slice(1).join(' ') || '-' });
    if (p.jobTitle && !person.jobTitle) await tx.person.update({ where: { id: person.id }, data: { jobTitle: p.jobTitle } });
    const existing = await tx.accountMember.findUnique({ where: { accountId_personId: { accountId, personId: person.id } } });
    if (existing && existing.status !== 'REMOVED') throw new AccountRuleError(existing.status === 'ACTIVE' ? 'They can already book on this account.' : 'They are already waiting for approval.');
    const m = existing
      ? await tx.accountMember.update({ where: { id: existing.id }, data: { status: 'PENDING_APPROVAL', role: 'BOOKER' } })
      : await tx.accountMember.create({ data: { accountId, personId: person.id, role: 'BOOKER', status: 'PENDING_APPROVAL' } });
    await tx.task.create({ data: { type: 'BOOKER_APPROVAL', title: `New booker: ${person.firstName} ${person.lastName === '-' ? '' : person.lastName} for ${inviter.account.company}`, detail: `${person.email}, invited by the main booker`, recordType: 'AccountMember', recordId: m.id } });
    await tx.auditLog.create({ data: { actorId: inviterId, action: 'BOOKER_INVITED', recordType: 'Account', recordId: accountId, after: { personId: person.id, email: person.email } } });
    return m;
  });
}

/** Main booker removes a booker, or cancels an invite. The main booker cannot remove themselves. */
export async function removeBooker(accountId: string, actorId: string, memberId: string) {
  return db.$transaction(async (tx) => {
    const actor = await tx.accountMember.findFirst({ where: { accountId, personId: actorId, role: 'MAIN_BOOKER', status: 'ACTIVE' } });
    if (!actor) throw new AccountRuleError('Only the main booker can remove bookers.');
    const m = await tx.accountMember.findFirst({ where: { id: memberId, accountId } });
    if (!m || m.status === 'REMOVED') throw new AccountRuleError('That booker has already been removed.');
    if (m.role === 'MAIN_BOOKER') throw new AccountRuleError('The main booker cannot be removed here. Contact us to change the main booker.');
    await tx.accountMember.update({ where: { id: m.id }, data: { status: 'REMOVED' } });
    await tx.task.updateMany({ where: { type: 'BOOKER_APPROVAL', recordId: m.id, status: 'OPEN' }, data: { status: 'DISMISSED', doneAt: new Date() } });
    await tx.auditLog.create({ data: { actorId, action: m.status === 'PENDING_APPROVAL' ? 'BOOKER_INVITE_CANCELLED' : 'BOOKER_REMOVED', recordType: 'Account', recordId: accountId, after: { personId: m.personId } } });
  });
}

/** ECI approves or declines a booker invited by the main booker. */
export async function decideBooker(memberId: string, actorId: string, approve: boolean) {
  const m = await db.$transaction(async (tx) => {
    const r = await tx.accountMember.updateMany({ where: { id: memberId, status: 'PENDING_APPROVAL' }, data: { status: approve ? 'ACTIVE' : 'REMOVED' } });
    if (!r.count) throw new AccountRuleError('This request has already been dealt with.');
    const m = await tx.accountMember.findUniqueOrThrow({ where: { id: memberId }, include: { person: true, account: { include: { members: { where: { role: 'MAIN_BOOKER' }, include: { person: true } } } } } });
    if (approve && !m.person.roles.includes('BOOKER')) await tx.person.update({ where: { id: m.personId }, data: { roles: { push: 'BOOKER' } } });
    await tx.task.updateMany({ where: { type: 'BOOKER_APPROVAL', recordId: memberId, status: 'OPEN' }, data: { status: 'DONE', doneAt: new Date(), assigneeId: actorId } });
    await tx.auditLog.create({ data: { actorId, action: approve ? 'BOOKER_APPROVED' : 'BOOKER_DECLINED', recordType: 'Account', recordId: m.accountId, after: { personId: m.personId } } });
    return m;
  });
  const main = m.account.members[0]?.person;
  if (approve) {
    await sendEmail({
      to: m.person.email, personId: m.personId, trigger: 'BOOKER_APPROVED', subject: `You can book for ${m.account.company} on ECI-Hub`,
      blocks: [
        { type: 'heading', text: `You can book on account, ${m.person.firstName}` },
        { type: 'text', text: `${main ? `${main.firstName} ${main.lastName} added you` : 'You have been added'} as a booker on the ${m.account.company} credit account. Book any course and choose On account at checkout.` },
        { type: 'text', text: 'Sign in with your work email. We send you a code each time, so there is no password to remember.' },
        { type: 'button', label: 'Sign in', href: `${SITE_URL}/login?email=${encodeURIComponent(m.person.email)}` },
      ],
    });
  }
  if (main) {
    await sendEmail({
      to: main.email, personId: main.id, trigger: approve ? 'BOOKER_APPROVED' : 'BOOKER_DECLINED', subject: approve ? `${m.person.firstName} ${m.person.lastName} can now book on your account` : `We could not add ${m.person.firstName} ${m.person.lastName} as a booker`,
      blocks: [
        { type: 'heading', text: approve ? 'New booker approved' : 'New booker not approved' },
        { type: 'text', text: approve ? `${m.person.firstName} ${m.person.lastName} (${m.person.email}) can now book on the ${m.account.company} account. We have emailed them a sign-in link.` : `We were not able to add ${m.person.firstName} ${m.person.lastName} (${m.person.email}) as a booker. Call us on +44 (0) 1932 963463 if you have questions.` },
        { type: 'button', label: 'See your team', href: '/account/team' },
      ],
    });
  }
  return m;
}
