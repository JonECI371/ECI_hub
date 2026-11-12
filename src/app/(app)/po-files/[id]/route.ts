import { NextResponse } from 'next/server';
import { currentPerson } from '@/lib/auth';
import { db } from '@/lib/db';
import { readStoredFile } from '@/lib/integrations/files';

export const dynamic = 'force-dynamic';

/** A PO file: ECI Admins, or an active booker on the account that owns it. Every download is logged. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentPerson();
  if (!me) return NextResponse.redirect(new URL('/login', process.env.SITE_URL ?? 'http://localhost:3000'));
  const { id } = await params;
  const file = await db.poFile.findUnique({ where: { id }, include: { purchaseOrder: true } });
  if (!file) return new NextResponse('Not found', { status: 404 });
  const isAdmin = me.roles.includes('ADMIN') || me.roles.includes('SUPER_ADMIN');
  const member = isAdmin ? null : await db.accountMember.findFirst({ where: { personId: me.id, accountId: file.purchaseOrder.accountId, status: 'ACTIVE' } });
  if (!isAdmin && !member) return new NextResponse('Not found', { status: 404 });
  const stored = await readStoredFile(file.fileKey);
  if (!stored) return new NextResponse('Not found', { status: 404 });
  await db.auditLog.create({ data: { actorId: me.id, action: 'PO_FILE_DOWNLOADED', recordType: 'PoFile', recordId: file.id } });
  const safeName = file.fileName.replace(/[^\w.\- ]+/g, '_');
  return new Response(new Uint8Array(stored.body), { headers: { 'Content-Type': stored.type, 'Content-Disposition': `attachment; filename="${safeName}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' } });
}
