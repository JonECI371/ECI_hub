import { db } from '@/lib/db';
import { readServiceContent, readServiceFaqs } from '@/lib/service-content';
import { serviceMarkdown } from '@/lib/service-page';

export const dynamic = 'force-dynamic';

// One consultancy service as Markdown for AI assistants, regenerated from the live record. Only published services.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await db.service.findFirst({ where: { slug, status: 'PUBLISHED' } });
  if (!s) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return new Response(serviceMarkdown(s, readServiceContent(s.content), readServiceFaqs(s.faqs)), { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
