import { NextResponse } from 'next/server';
import { currentPerson } from '@/lib/auth';
import { audit } from '@/lib/admin';
import { xeroCsv } from '@/lib/billing';

/** Xero sales invoice import file for one month's statements. Admin only. */
export async function GET(_req: Request, { params }: { params: Promise<{ month: string }> }) {
  const me = await currentPerson();
  if (!me || !me.roles.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN')) return new NextResponse('Not allowed', { status: 403 });
  const { month } = await params;
  const m = month.replace(/\.csv$/, '');
  if (!/^\d{4}-\d{2}$/.test(m)) return new NextResponse('Not found', { status: 404 });
  const { csv, invoices, lines } = await xeroCsv(m);
  await audit(me.id, 'XERO_EXPORT_DOWNLOADED', 'Month', m, undefined, { invoices, lines });
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="eci-hub-xero-invoices-${m}.csv"`, 'Cache-Control': 'no-store' } });
}
