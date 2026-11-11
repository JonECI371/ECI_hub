import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { currentPerson } from '@/lib/auth';
import { authorizeUrl, xeroConfigured } from '@/lib/integrations/xero';

export const dynamic = 'force-dynamic';

/** Starts connecting Xero. Super Admin only. A random state, kept in a cookie, stops anyone else finishing the connection. */
export async function GET() {
  const me = await currentPerson();
  if (!me || !me.roles.includes('SUPER_ADMIN')) return new NextResponse('Not allowed', { status: 403 });
  if (!xeroConfigured()) return NextResponse.redirect(new URL('/admin/settings?msg=xeronotset#xero', process.env.SITE_URL ?? 'http://localhost:3000'));
  const state = randomBytes(16).toString('hex');
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set('eci_xero_state', state, { httpOnly: true, sameSite: 'lax', path: '/admin/xero', maxAge: 600, secure: (process.env.SITE_URL ?? '').startsWith('https://') });
  return res;
}
