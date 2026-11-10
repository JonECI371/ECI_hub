import { NextResponse } from 'next/server';
import { audit, requireAdmin } from '@/lib/admin';
import { readStoredFile } from '@/lib/integrations/files';

export const dynamic = 'force-dynamic';

/** Admins open stored files (certificates, registration ID) here; every view is logged. */
export async function GET(req: Request) {
  const me = await requireAdmin('/admin');
  const key = new URL(req.url).searchParams.get('key') ?? '';
  const f = await readStoredFile(key);
  if (!f) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await audit(me.id, 'FILE_VIEWED', 'File', key);
  return new Response(new Uint8Array(f.body), { headers: { 'Content-Type': f.type, 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
