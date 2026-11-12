import { describe, expect, it } from 'vitest';

describe('purchase orders', async () => {
  const { db } = await import('@/lib/db');
  const { poKey, parsePoValue, poSummary, checkPoFiles, attachPoFiles } = await import('@/lib/purchase-orders');
  const { submitApplication, approveAccount } = await import('@/lib/accounts');
  const { createAccountBooking } = await import('@/lib/credit');
  const { closeStatements } = await import('@/lib/billing');
  const { course } = await import('./fixtures');
  const uid = () => Math.random().toString(36).slice(2, 8);

  it('matches PO numbers however they are typed, and reads amounts in pounds', () => {
    expect(poKey('po 4500-221')).toBe(poKey('PO4500221'));
    expect(parsePoValue('1,250')).toBe(125000);
    expect(parsePoValue('£99.50')).toBe(9950);
    expect(parsePoValue('')).toBeNull();
    expect(parsePoValue('abc')).toBe('bad');
    expect(parsePoValue('0')).toBe('bad');
  });

  it('accepts PDFs and images only, up to five files', async () => {
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], 'po.pdf', { type: 'application/pdf' });
    const exe = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], 'po.pdf', { type: 'application/pdf' });
    expect(await checkPoFiles([pdf])).toBeNull();
    expect(await checkPoFiles([exe])).toMatch(/not a PDF/);
    expect(await checkPoFiles(Array(6).fill(pdf))).toMatch(/up to 5/);
  });

  it('shows value, billed and left per PO, with files kept against the PO', async () => {
    const id = uid();
    const acc = await submitApplication({ company: `PO Co ${id}`, companyNumber: `4${id.replace(/\D/g, '').padEnd(7, '2').slice(0, 7)}`, registered: { line1: '1 High St', town: 'Reading', postcode: 'RG1 1AA' }, industry: 'Contractor', main: { firstName: 'Pat', lastName: 'Po', email: `pat.${id}@example.com`, phone: '01234 567890', jobTitle: 'Buyer' }, others: [], accountsName: 'Acc', accountsEmail: `acc.${id}@example.com`, creditRequestedPence: 500000, poRule: 'PER_BOOKING' });
    await approveAccount(acc.id, { id: 'super', roles: ['SUPER_ADMIN'] }, { creditLimitPence: 500000, paymentTermsDays: 30, poRule: 'PER_BOOKING' });
    const member = await db.accountMember.findFirstOrThrow({ where: { accountId: acc.id } });
    const mk = async (po: string, value: number | null) => { const { course: c, session } = await course({ capacity: 5 }); return createAccountBooking({ personId: member.personId, courseId: c.id, sessionId: session!.id, places: 1, bookerAttends: true, others: null, poNumber: po, poValuePence: value }); };
    const b1 = await mk('PO 4500-221', 100000);
    const b2 = await mk('po4500221', null); // same PO typed differently, no new value
    await mk('PO-OTHER', null);
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], 'quote.pdf', { type: 'application/pdf' });
    await attachPoFiles(acc.id, 'PO 4500-221', [pdf, pdf], member.personId);
    await db.statement.updateMany({ where: { accountId: acc.id }, data: { month: '1999-03' } });
    await closeStatements();
    const rows = await poSummary(acc.id);
    const main = rows.find((r) => poKey(r.number) === poKey('PO 4500-221'))!;
    expect(main.valuePence).toBe(100000);
    expect(main.billedPence).toBe(b1.totalPence + b2.totalPence);
    expect(main.leftPence).toBe(100000 - b1.totalPence - b2.totalPence);
    expect(main.files).toHaveLength(2);
    const other = rows.find((r) => r.number === 'PO-OTHER')!;
    expect([other.valuePence, other.leftPence, other.files.length]).toEqual([null, null, 0]);
    expect(rows).toHaveLength(2);
  });
});
