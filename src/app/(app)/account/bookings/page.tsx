import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePerson } from '@/lib/auth';
import { accountIdsFor } from '@/lib/booker';
import { gbp } from '@/lib/format';
import { Chip, DeliveryChip } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My bookings', robots: { index: false } };

const dmy = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
const STATUS: Record<string, ['soft' | 'warn' | 'grey' | 'bad', string]> = { CONFIRMED: ['soft', 'Confirmed'], COMPLETED: ['grey', 'Completed'], CANCELLED: ['grey', 'Cancelled'], PAYMENT_PENDING: ['warn', 'Not paid'] };

export default async function MyBookings() {
  const me = await requirePerson();
  const bookings = await db.booking.findMany({
    where: { status: { not: 'PAYMENT_PENDING' }, OR: [{ bookerId: me.id }, { accountId: { in: await accountIdsFor(me.id) } }, { attendees: { some: { personId: me.id } } }] },
    include: { course: true, session: true },
    orderBy: { createdAt: 'desc' },
  });
  return (
    <>
      <h1 className="text-[30px] font-extrabold tracking-tight text-ink">My bookings</h1>
      <section className="overflow-hidden rounded-card bg-white shadow-card">
        {bookings.length === 0 ? (
          <p className="px-6 py-8">No bookings yet. <Link href="/courses">Find a course</Link></p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-[#FAFAFA] text-xs uppercase tracking-[0.06em]"><tr><th className="px-6 py-3">Reference</th><th className="px-6 py-3">Course</th><th className="px-6 py-3">Date</th><th className="px-6 py-3">Places</th><th className="px-6 py-3">Total</th><th className="px-6 py-3">Status</th></tr></thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id} className="border-t border-hairline">
                    <td className="px-6 py-3"><Link href={`/account/bookings/${b.reference}`} className="font-bold">{b.reference}</Link></td>
                    <td className="px-6 py-3"><span className="block font-bold text-ink">{b.course.title}</span><DeliveryChip type={b.course.deliveryType} /></td>
                    <td className="px-6 py-3">{b.session ? dmy.format(b.session.startsAt) : 'Any time'}</td>
                    <td className="px-6 py-3">{b.places}</td>
                    <td className="px-6 py-3 tabular-nums">{b.bookerId === me.id ? gbp(b.totalPence) : '-'}</td>
                    <td className="px-6 py-3"><Chip tone={STATUS[b.status][0]}>{STATUS[b.status][1]}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
