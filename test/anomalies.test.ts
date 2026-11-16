import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { inspectSubmission, oddReason } from '@/lib/anomalies';

describe('test log: odd input', () => {
  beforeEach(async () => { await db.testAnomaly.deleteMany(); });

  it('spots placeholder text, hidden characters and markdown, and leaves normal values alone', () => {
    expect(oddReason('Please select')).toMatch(/placeholder/);
    expect(oddReason('1 Cranmore Close, Aldershot, Please select, GU11 3BH')).toMatch(/placeholder/);
    expect(oddReason('Acme​ Ltd')).toMatch(/hidden/);
    expect(oddReason('**Acme** Ltd')).toMatch(/markdown/);
    expect(oddReason('1 Cranmore Close, Aldershot, GU11 3BH')).toBeNull();
    expect(oddReason('Surrey')).toBeNull();
  });

  it('records odd values and automation signals, once a minute per form', async () => {
    const f = new FormData();
    f.set('reg_county', 'Please select');
    f.set('company', 'Acme');
    f.set('_sig', JSON.stringify({ ms: 2000, wd: true, ia: 0, pa: 0, pc: 0 }));
    for (const k of ['a', 'b', 'c', 'd', 'e']) f.set(k, 'x');
    await inspectSubmission(f, 'Credit account application', null);
    await inspectSubmission(f, 'Credit account application', null);
    const rows = await db.testAnomaly.findMany();
    expect(rows.map((r) => r.kind).sort()).toEqual(['AUTOMATED_BROWSER', 'FAST_SUBMIT', 'NO_INTERACTION', 'ODD_VALUE']);
  });

  it('logs nothing for an ordinary submission', async () => {
    const f = new FormData();
    f.set('company', 'Acme');
    f.set('_sig', JSON.stringify({ ms: 90000, wd: false, ia: 40, pa: 0, pc: 0 }));
    await inspectSubmission(f, 'Booking checkout', null);
    expect(await db.testAnomaly.count()).toBe(0);
  });
});
