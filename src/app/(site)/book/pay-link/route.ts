import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sign, verify } from '@/lib/auth';
import { db } from '@/lib/db';
import { SITE_URL } from '@/lib/format';
import { holdLive } from '@/lib/booking';

export const dynamic = 'force-dynamic';

/** The link in the "pay to confirm" email Admin sends. It opens the normal payment page for that booking. */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get('t') ?? '';
  const p = verify<{ bid: string; exp: number; k?: string }>(t);
  const b = p?.k === 'paylink' ? await db.booking.findUnique({ where: { id: p.bid } }) : null;
  if (!p || !b) return NextResponse.redirect(new URL('/book/outcome?state=expired', SITE_URL));
  if (b.status === 'CONFIRMED') return NextResponse.redirect(new URL(`/book/outcome?ref=${b.reference}`, SITE_URL));
  if (!holdLive(b)) return NextResponse.redirect(new URL('/book/outcome?state=expired', SITE_URL));
  (await cookies()).set('eci_checkout', sign({ bid: b.id, exp: Date.now() + 24 * 3600000 }), { httpOnly: true, sameSite: 'lax', path: '/book', secure: SITE_URL.startsWith('https://') });
  return NextResponse.redirect(new URL('/book/pay', SITE_URL));
}
