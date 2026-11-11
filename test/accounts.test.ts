import { describe, expect, it } from 'vitest';

describe('credit accounts', async () => {
  const { db } = await import('@/lib/db');
  const { submitApplication, approveAccount, declineAccount, AccountRuleError } = await import('@/lib/accounts');
  const { normaliseCompanyNumber } = await import('@/lib/integrations/companies-house');
  const uid = () => Math.random().toString(36).slice(2, 10);

  const apply = (credit = 1000000) => {
    const id = uid();
    return submitApplication({
      company: `Acme ${id} Ltd`, companyNumber: `9${id.replace(/\D/g, '').padEnd(7, '1').slice(0, 7)}`, registered: { line1: '1 High St', town: 'Reading', postcode: 'RG1 1AA' }, industry: 'Contractor',
      main: { firstName: 'Priya', lastName: 'Shah', email: `priya.${id}@example.com`, phone: '01234 567890', jobTitle: 'Training manager' },
      others: [{ name: 'Tom Brown', email: `tom.${id}@example.com` }],
      accountsName: 'Accounts', accountsEmail: `accounts.${id}@example.com`, creditRequestedPence: credit, poRule: 'PER_BOOKING',
    });
  };

  it('normalises company numbers', () => {
    expect(normaliseCompanyNumber('9147227')).toBe('09147227');
    expect(normaliseCompanyNumber('sc 123456')).toBe('SC123456');
    expect(normaliseCompanyNumber('ABC')).toBeNull();
  });

  it('an application creates a pending account, its bookers and one approval task', async () => {
    const acc = await apply();
    const full = await db.account.findUniqueOrThrow({ where: { id: acc.id }, include: { members: true } });
    expect(full.status).toBe('APPLIED');
    expect(full.members.map((m) => [m.role, m.status]).sort()).toEqual([['BOOKER', 'PENDING_APPROVAL'], ['MAIN_BOOKER', 'PENDING_APPROVAL']]);
    expect(full.companiesHouse).toEqual({ status: 'not_configured' });
    expect(await db.task.count({ where: { type: 'ACCOUNT_APPLICATION', recordId: acc.id, status: 'OPEN' } })).toBe(1);
  });

  it('an Admin cannot approve above the default limit; a Super Admin can, once', async () => {
    const acc = await apply(1000000);
    const admin = { id: 'admin', roles: ['ADMIN'] };
    await expect(approveAccount(acc.id, admin, { creditLimitPence: 1000000, paymentTermsDays: 30, poRule: 'NONE' })).rejects.toBeInstanceOf(AccountRuleError);
    await approveAccount(acc.id, { id: 'super', roles: ['ADMIN', 'SUPER_ADMIN'] }, { creditLimitPence: 1000000, paymentTermsDays: 30, poRule: 'PER_BOOKING' });
    const full = await db.account.findUniqueOrThrow({ where: { id: acc.id }, include: { members: { include: { person: true } } } });
    expect(full.status).toBe('ACTIVE');
    expect(full.creditLimitPence).toBe(1000000);
    expect(full.members.every((m) => m.status === 'ACTIVE' && m.person.roles.includes('BOOKER'))).toBe(true);
    expect(await db.task.count({ where: { recordId: acc.id, status: 'OPEN' } })).toBe(0);
    await expect(approveAccount(acc.id, { id: 'super', roles: ['SUPER_ADMIN'] }, { creditLimitPence: 1, paymentTermsDays: 30, poRule: 'NONE' })).rejects.toBeInstanceOf(AccountRuleError);
  });

  it('an Admin can approve within the default, and decline closes the task', async () => {
    const ok = await apply(250000);
    await approveAccount(ok.id, { id: 'admin', roles: ['ADMIN'] }, { creditLimitPence: 250000, paymentTermsDays: 30, poRule: 'NONE' });
    expect((await db.account.findUniqueOrThrow({ where: { id: ok.id } })).status).toBe('ACTIVE');
    const no = await apply();
    await declineAccount(no.id, 'admin', 'Company dissolved');
    expect((await db.account.findUniqueOrThrow({ where: { id: no.id } })).status).toBe('DECLINED');
    expect(await db.task.count({ where: { recordId: no.id, status: 'OPEN' } })).toBe(0);
  });
});
