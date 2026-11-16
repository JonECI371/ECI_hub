import { NextResponse } from 'next/server';
import { currentPerson } from '@/lib/auth';
import { db } from '@/lib/db';
import { readStoredFile } from '@/lib/integrations/files';

export const dynamic = 'force-dynamic';

/** A profile picture: the person themselves, Admin and Super Admin, or a trainer whose session they are booked on. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentPerson();
  if (!me) return new NextResponse('Not found', { status: 404 });
  const { id } = await params;
  const p = await db.person.findUnique({ where: { id }, select: { id: true, photoKey: true } });
  if (!p?.photoKey) return new NextResponse('Not found', { status: 404 });
  const staff = me.roles.includes('ADMIN') || me.roles.includes('SUPER_ADMIN');
  let ok = staff || me.id === p.id;
  if (!ok && me.roles.includes('TRAINER')) {
    ok = !!(await db.attendee.findFirst({ where: { personId: p.id, status: { not: 'CANCELLED' }, booking: { session: { trainerId: me.id } } }, select: { id: true } }));
  }
  if (!ok) return new NextResponse('Not found', { status: 404 });
  const stored = await readStoredFile(p.photoKey);
  if (!stored || !stored.type.startsWith('image/')) return new NextResponse('Not found', { status: 404 });
  return new Response(new Uint8Array(stored.body), { headers: { 'Content-Type': stored.type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300' } });
}
