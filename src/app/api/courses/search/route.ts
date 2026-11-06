import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DELIVERY_LABEL } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** Course finder for the home page: matches title, subject or summary as the visitor types. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ results: [] });
  const words = q.split(/\s+/).filter(Boolean);
  const courses = await db.course.findMany({
    where: {
      status: 'PUBLISHED',
      AND: words.map((w) => ({
        OR: [
          { title: { contains: w, mode: 'insensitive' } },
          { shortDescription: { contains: w, mode: 'insensitive' } },
          { subject: { name: { contains: w, mode: 'insensitive' } } },
        ],
      })),
    },
    include: { subject: true },
    orderBy: { title: 'asc' },
    take: 6,
  });
  return NextResponse.json({
    results: courses.map((c) => ({ slug: c.slug, title: c.title, meta: `${DELIVERY_LABEL[c.deliveryType]} · ${c.durationText}` })),
  });
}
