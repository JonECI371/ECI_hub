import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { SITE_URL } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const courses = await db.course.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true } });
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/courses`, changeFrequency: 'daily', priority: 0.9 },
    ...courses.map((c) => ({ url: `${SITE_URL}/courses/${c.slug}`, lastModified: c.updatedAt, changeFrequency: 'weekly' as const, priority: 0.8 })),
  ];
}
