import { db } from '@/lib/db';
import { audit, requireAdmin } from '@/lib/admin';
import { statusLabel, bookingWhere } from '@/lib/admin-bookings';

export const dynamic = 'force-dynamic';

const cell = (v: unknown) => {
  const s = String(v ?? '');
  // Quote, and stop spreadsheet formula injection from names or emails.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function GET(req: Request) {
  const me = await requireAdmin('/admin/bookings');
  const u = new URL(req.url);
  const rows = await db.booking.findMany({
    where: bookingWhere(u.searchParams.get('q') ?? undefined, u.searchParams.get('status') ?? undefined),
    include: { booker: true, account: true, course: true, session: true, payments: true, attendees: { where: { status: { not: 'CANCELLED' } }, include: { person: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10000,
  });
  const head = ['Reference', 'Booked at', 'Course', 'Session start', 'Booker', 'Booker email', 'Company', 'Attendees', 'Places', 'Method', 'Payment reference', 'PO', 'Net (GBP)', 'VAT (GBP)', 'Total (GBP)', 'Status'];
  const lines = rows.map((b) => [
    b.reference, b.createdAt.toISOString(), b.course.title, b.session?.startsAt.toISOString() ?? '', `${b.booker.firstName} ${b.booker.lastName}`, b.booker.email,
    b.account?.company ?? b.booker.employer ?? '', b.attendees.map((a) => (a.person ? `${a.person.firstName} ${a.person.lastName}` : 'Name to follow')).join('; '), b.places, b.method, b.payments.map((x) => x.stripeIntentId).join('; '), b.poNumber ?? '', (b.subtotalPence / 100).toFixed(2), (b.vatPence / 100).toFixed(2), (b.totalPence / 100).toFixed(2), statusLabel(b),
  ].map(cell).join(','));
  await audit(me.id, 'BOOKINGS_EXPORTED', 'Booking', '*', undefined, { count: rows.length, q: u.searchParams.get('q'), status: u.searchParams.get('status') });
  return new Response([head.map(cell).join(','), ...lines].join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="eci-bookings-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
