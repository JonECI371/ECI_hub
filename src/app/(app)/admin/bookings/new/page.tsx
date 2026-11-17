import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { placesTakenWhere } from '@/lib/sessions';
import { AdminBookingForm, type SlotOption } from '@/components/admin-booking-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Add booking', robots: { index: false } };

const dt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

export default async function AddBooking() {
  await requireAdmin('/admin/bookings/new');
  const courses = await db.course.findMany({
    where: { status: 'PUBLISHED', pricePence: { gt: 0 } },
    orderBy: { title: 'asc' },
    include: { sessions: { where: { status: { not: 'CANCELLED' }, startsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' } } },
  });
  const sessionIds = courses.flatMap((c) => c.sessions.map((s) => s.id));
  const taken = await db.booking.groupBy({ by: ['sessionId'], where: { sessionId: { in: sessionIds }, ...placesTakenWhere() }, _sum: { places: true } });
  const takenBy = new Map(taken.map((t) => [t.sessionId, t._sum.places ?? 0]));
  const slots: SlotOption[] = courses.flatMap((c): SlotOption[] =>
    c.deliveryType === 'ELEARNING'
      ? [{ value: `${c.id}|`, label: `${c.title}, eLearning` }]
      : c.sessions.map((s) => {
          const left = s.capacity - (takenBy.get(s.id) ?? 0);
          return { value: `${c.id}|${s.id}`, label: `${c.title}, ${dt.format(s.startsAt)}, ${left <= 0 ? 'FULL' : `${left} left`}${s.status === 'DRAFT' ? ', not published' : ''}` };
        }),
  );
  return (
    <>
      <div>
        <p className="mb-1.5 text-xs"><Link href="/admin/bookings">Bookings</Link> › Add booking</p>
        <h1 className="text-[30px] font-extrabold tracking-tight text-ink">Add booking</h1>
        <p className="mt-2 max-w-3xl text-sm">Book on a customer&apos;s behalf. They get the normal confirmation email and Teams invite. If the booking would go over the credit limit, the places left, or break another rule, you will see a warning and can only continue by ticking an override box and giving a reason.</p>
      </div>
      <AdminBookingForm slots={slots} />
    </>
  );
}
