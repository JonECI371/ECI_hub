import { describe, expect, it } from 'vitest';
import type { Course } from '@prisma/client';
import { courseMarkdown } from '@/lib/course-facts';

describe('course formats', async () => {
  const { db } = await import('@/lib/db');
  const { applyFormatGroup, otherFormats, siblingIds } = await import('@/lib/course-formats');
  const { course } = await import('./fixtures');
  const mk = async () => (await course()).course;
  const group = (id: string) => db.course.findUniqueOrThrow({ where: { id }, select: { formatGroup: true } }).then((c) => c.formatGroup);

  it('links courses as formats of one course, shows only published others, and unlinks cleanly', async () => {
    const [a, b, c] = [await mk(), await mk(), await mk()];
    await db.$transaction((tx) => applyFormatGroup(tx, a.id, [b.id]));
    const g = await group(a.id);
    expect(g).toBeTruthy();
    expect(await group(b.id)).toBe(g);
    expect((await siblingIds({ id: a.id, formatGroup: g })).sort()).toEqual([b.id]);
    // adding a third from the other side joins the same group
    await db.$transaction((tx) => applyFormatGroup(tx, c.id, [a.id, b.id]));
    expect(await group(c.id)).toBe(g);
    expect((await otherFormats({ id: a.id, formatGroup: g })).map((x) => x.id).sort()).toEqual([b.id, c.id].sort());
    // a draft is not offered to customers
    await db.course.update({ where: { id: c.id }, data: { status: 'DRAFT' } });
    expect((await otherFormats({ id: a.id, formatGroup: g })).map((x) => x.id)).toEqual([b.id]);
    // unticking leaves the group; a group of one is dissolved
    await db.$transaction((tx) => applyFormatGroup(tx, a.id, [b.id]));
    expect(await group(c.id)).toBeNull();
    await db.$transaction((tx) => applyFormatGroup(tx, a.id, []));
    expect(await group(a.id)).toBeNull();
    expect(await group(b.id)).toBeNull();
  });

  it('lists the other formats in the AI version', () => {
    const c = { id: '1', slug: 'exa', title: 'ExA', deliveryType: 'IN_PERSON', durationText: '1 day', pricePence: 17500, vatRatePercent: 20, description: 'd', meetingPlatform: null } as unknown as Course;
    const md = courseMarkdown(c, {}, [], [], [{ slug: 'exa-online', title: 'ExA (eLearning)', deliveryType: 'ELEARNING', pricePence: 25000 }]);
    expect(md).toContain('## Also available as');
    expect(md).toContain('ExA (eLearning) (online, self-paced), £250 plus VAT');
  });
});
