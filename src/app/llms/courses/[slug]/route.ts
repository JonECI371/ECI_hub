import { db } from '@/lib/db';
import { readContent, readFaqs } from '@/lib/course-content';
import { courseMarkdown } from '@/lib/course-facts';
import { placesLeft } from '@/lib/sessions';

export const dynamic = 'force-dynamic';

// One course as Markdown for AI assistants, regenerated from the live course record. Only published courses.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await db.course.findFirst({
    where: { slug, status: 'PUBLISHED' },
    include: { subject: true, sessions: { where: { status: { in: ['PUBLISHED', 'FULL'] }, startsAt: { gt: new Date() } }, include: { venue: true }, orderBy: { startsAt: 'asc' }, take: 12 } },
  });
  if (!c) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const left = await placesLeft(c.sessions);
  const body = courseMarkdown(c, readContent(c.content), readFaqs(c.faqs), c.sessions.map((s) => ({ ...s, left: left.get(s.id) ?? 0 })));
  return new Response(body, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
