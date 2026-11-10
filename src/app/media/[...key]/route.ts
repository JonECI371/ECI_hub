import { readStoredFile } from '@/lib/integrations/files';

/** Public images (course photos only). Certificates and ID documents are never served here. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const rel = (await params).key.join('/');
  if (!/^files\/courses\/[A-Za-z0-9_-]+\/[0-9a-f-]+\.(jpg|png|webp)$/.test(rel)) return new Response('Not found', { status: 404 });
  const f = await readStoredFile(`${process.env.FILES_BUCKET ? 's3' : 'local'}:${rel}`);
  if (!f) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(f.body), { headers: { 'Content-Type': f.type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
}
