import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { Chip } from '@/components/ui';
import { saveVenue } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Venues', robots: { index: false } };

const input = 'h-11 w-full rounded-control border border-field bg-white px-3 text-sm text-ink';
const label = 'flex flex-col gap-1 text-sm font-bold text-ink';

type V = { id?: string; name?: string; address?: string; postcode?: string; directions?: string | null; isClientSite?: boolean };
function VenueForm({ v, submit }: { v: V; submit: string }) {
  return (
    <form action={saveVenue} className="grid gap-3 sm:grid-cols-2">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <label className={label}>Name<input name="name" required defaultValue={v.name} placeholder="Summit House" className={input} /></label>
      <label className={label}>Postcode<input name="postcode" required defaultValue={v.postcode} placeholder="TW16 5DA" className={input} /></label>
      <label className={`${label} sm:col-span-2`}>Address<input name="address" required defaultValue={v.address} placeholder="33 Hanworth Road, Sunbury-on-Thames" className={input} /></label>
      <label className={`${label} sm:col-span-2`}>Directions <span className="font-normal">(sent with reminders once the address is released)</span><textarea name="directions" defaultValue={v.directions ?? ''} rows={3} className="rounded-control border border-field bg-white px-3 py-2 text-sm font-normal" /></label>
      <label className="flex min-h-11 items-center gap-3 text-sm text-ink"><input type="checkbox" name="isClientSite" defaultChecked={v.isClientSite} className="size-5 accent-ink" />Client site (a customer&apos;s premises, not ours)</label>
      <div className="sm:col-span-2"><button type="submit" className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-5 text-sm font-bold text-ink">{submit}</button></div>
    </form>
  );
}

export default async function Venues({ searchParams }: { searchParams: Promise<{ msg?: string; edit?: string }> }) {
  await requireAdmin('/admin/venues');
  const { msg, edit } = await searchParams;
  const venues = await db.venue.findMany({ include: { _count: { select: { sessions: { where: { startsAt: { gt: new Date() }, status: { not: 'CANCELLED' } } } } } }, orderBy: [{ isClientSite: 'asc' }, { name: 'asc' }] });
  return (
    <>
      <div><p className="mb-1.5 text-xs"><Link href="/admin/settings">Settings</Link> › Venues</p><h1 className="text-[30px] font-extrabold tracking-tight text-ink">Venues</h1></div>
      {msg === 'saved' && <p role="status" className="rounded-control bg-cyan-soft px-4 py-3 text-sm font-semibold text-ink">Venue saved.</p>}
      {msg === 'invalid' && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">Enter a name, an address and a UK postcode, like TW16 5DA.</p>}
      <section aria-labelledby="v-h" className="overflow-hidden rounded-card bg-white shadow-card">
        <h2 id="v-h" className="border-b border-hairline px-6 py-4 text-lg font-extrabold text-ink">All venues</h2>
        {venues.length === 0 ? <p className="px-6 py-6 text-sm">No venues yet. Add one below.</p> : (
          <ul>
            {venues.map((v) => (
              <li key={v.id} className="border-b border-hairline px-6 py-4 last:border-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-ink">{v.name} {v.isClientSite && <Chip tone="grey">Client site</Chip>}</p>
                    <p className="text-sm">{v.address}, {v.postcode}</p>
                    <p className="text-xs">{v._count.sessions} upcoming {v._count.sessions === 1 ? 'date' : 'dates'}{v.directions ? ' · directions added' : ''}</p>
                  </div>
                  {edit !== v.id && <Link href={`/admin/venues?edit=${v.id}#e-${v.id}`} className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-4 text-sm font-bold text-ink no-underline">Edit</Link>}
                </div>
                {edit === v.id && <div id={`e-${v.id}`} className="mt-4 rounded-control bg-page p-4"><VenueForm v={v} submit="Save venue" /><p className="mt-3 text-xs">Changing the address updates every upcoming date at this venue. Delegates see it in their next email and on their dashboard.</p></div>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="add-h" className="rounded-card bg-white p-6 shadow-card">
        <h2 id="add-h" className="mb-4 text-lg font-extrabold text-ink">Add a venue</h2>
        <VenueForm v={{}} submit="Add venue" />
      </section>
    </>
  );
}
