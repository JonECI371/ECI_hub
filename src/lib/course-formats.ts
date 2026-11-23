import 'server-only';
import { randomUUID } from 'node:crypto';
import type { DeliveryType, Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export const FORMAT_LABEL: Record<DeliveryType, string> = { IN_PERSON: 'In the classroom', VIRTUAL_CLASSROOM: 'Live online', ELEARNING: 'Online, self-paced' };
const ORDER: Record<DeliveryType, number> = { IN_PERSON: 0, VIRTUAL_CLASSROOM: 1, ELEARNING: 2 };

/** The other published formats of the same course, in a steady order (classroom, live online, eLearning). */
export async function otherFormats(course: { id: string; formatGroup: string | null }) {
  if (!course.formatGroup) return [];
  const rows = await db.course.findMany({
    where: { formatGroup: course.formatGroup, status: 'PUBLISHED', NOT: { id: course.id } },
    select: { id: true, slug: true, title: true, deliveryType: true, pricePence: true },
  });
  return rows.sort((a, b) => ORDER[a.deliveryType] - ORDER[b.deliveryType]);
}

/** Ids of the courses that share this course's format group (not including itself), for the Admin form. */
export async function siblingIds(course: { id: string; formatGroup: string | null } | null): Promise<string[]> {
  if (!course?.formatGroup) return [];
  return (await db.course.findMany({ where: { formatGroup: course.formatGroup, NOT: { id: course.id } }, select: { id: true } })).map((c) => c.id);
}

/**
 * Make `courseId` and the chosen courses one set of formats. Anyone left out of the set leaves the group,
 * and a group of one is dissolved, so a course never shows a switch to nothing.
 */
export async function applyFormatGroup(tx: Prisma.TransactionClient, courseId: string, chosen: string[]) {
  const ids = [...new Set([courseId, ...chosen])];
  const involved = await tx.course.findMany({ where: { OR: [{ id: { in: ids } }, { formatGroup: { not: null }, id: courseId }] }, select: { id: true, formatGroup: true } });
  const me = involved.find((c) => c.id === courseId);
  const key = ids.length > 1 ? (me?.formatGroup ?? involved.find((c) => c.formatGroup)?.formatGroup ?? randomUUID()) : null;
  // Whoever was in my old group but is not chosen now leaves it.
  if (me?.formatGroup) await tx.course.updateMany({ where: { formatGroup: me.formatGroup, id: { notIn: ids } }, data: { formatGroup: null } });
  await tx.course.updateMany({ where: { id: { in: ids } }, data: { formatGroup: key } });
  // A group left with one course is no group.
  const groups = [...new Set([me?.formatGroup, key].filter((g): g is string => !!g))];
  for (const g of groups) {
    const left = await tx.course.findMany({ where: { formatGroup: g }, select: { id: true } });
    if (left.length === 1) await tx.course.update({ where: { id: left[0].id }, data: { formatGroup: null } });
  }
}
