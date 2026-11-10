import { NextResponse } from 'next/server';
import { currentPerson } from '@/lib/auth';
import { db } from '@/lib/db';
import { canSeeCertificate } from '@/lib/certificates';
import { readStoredFile } from '@/lib/integrations/files';

export const dynamic = 'force-dynamic';

/** Download a certificate: the holder, or a booker who booked that course for them. Every download is logged. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentPerson();
  if (!me) return NextResponse.redirect(new URL('/login?next=/account/certificates', process.env.SITE_URL ?? 'http://localhost:3000'));
  const { id } = await params;
  const cert = await db.certificate.findUnique({ where: { id }, include: { course: true } });
  if (!cert || !cert.fileKey || !(await canSeeCertificate(me.id, cert))) return new NextResponse('Not found', { status: 404 });
  const f = await readStoredFile(cert.fileKey);
  if (!f) return new NextResponse('Not found', { status: 404 });
  await db.auditLog.create({ data: { actorId: me.id, action: 'CERTIFICATE_DOWNLOADED', recordType: 'Certificate', recordId: cert.id } });
  const ext = f.type === 'application/pdf' ? 'pdf' : f.type.split('/')[1];
  return new Response(new Uint8Array(f.body), { headers: { 'Content-Type': f.type, 'Content-Disposition': `inline; filename="${cert.course.slug}-certificate.${ext}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
