import { NextResponse } from 'next/server';
import { currentPerson } from '@/lib/auth';
import { db } from '@/lib/db';
import { readQuals } from '@/lib/trainers';
import { readStoredFile } from '@/lib/integrations/files';

export const dynamic = 'force-dynamic';

/** A trainer opens their own qualification certificate. Only their own; every view is logged. */
export async function GET(_req: Request, { params }: { params: Promise<{ qid: string }> }) {
  const me = await currentPerson();
  if (!me || !me.roles.includes('TRAINER')) return new NextResponse('Not allowed', { status: 403 });
  const { qid } = await params;
  const tp = await db.trainerProfile.findUnique({ where: { personId: me.id } });
  const q = readQuals(tp?.qualifications).find((x) => x.id === qid);
  const f = q?.fileKey ? await readStoredFile(q.fileKey) : null;
  if (!f) return new NextResponse('Not found', { status: 404 });
  await db.auditLog.create({ data: { actorId: me.id, action: 'FILE_VIEWED', recordType: 'File', recordId: q!.fileKey! } });
  return new Response(new Uint8Array(f.body), { headers: { 'Content-Type': f.type, 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
