import { NextResponse } from 'next/server';
import { currentPerson } from '@/lib/auth';
import { audit } from '@/lib/admin';
import { completeConnection } from '@/lib/integrations/xero';

export const dynamic = 'force-dynamic';

/** Where Xero sends you back after you approve access. */
export async function GET(req: Request) {
  const base = process.env.SITE_URL ?? 'http://localhost:3000';
  const me = await currentPerson();
  if (!me || !me.roles.includes('SUPER_ADMIN')) return new NextResponse('Not allowed', { status: 403 });
  const u = new URL(req.url);
  const cookie = /(?:^|;\s*)eci_xero_state=([^;]+)/.exec(req.headers.get('cookie') ?? '')?.[1];
  const back = (msg: string, detail?: string) => {
    const r = NextResponse.redirect(new URL(`/admin/settings?msg=${msg}${detail ? `&detail=${encodeURIComponent(detail)}` : ''}#xero`, base));
    r.cookies.delete('eci_xero_state');
    return r;
  };
  if (u.searchParams.get('error')) return back('xeroerror', u.searchParams.get('error_description') ?? u.searchParams.get('error') ?? 'Xero said no.');
  const code = u.searchParams.get('code');
  if (!code || !cookie || cookie !== u.searchParams.get('state')) return back('xeroerror', 'That connection link was not valid or has expired. Start again.');
  try {
    const org = await completeConnection(code);
    await audit(me.id, 'XERO_CONNECTED', 'Setting', 'xero_connection', undefined, { organisation: org });
    return back('xeroconnected', org);
  } catch (e) {
    return back('xeroerror', (e as Error).message);
  }
}
