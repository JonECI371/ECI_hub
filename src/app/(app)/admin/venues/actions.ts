'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { audit, requireAdmin } from '@/lib/admin';

const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

/** Add or edit a venue. Venues are never deleted here, because past sessions refer to them. */
export async function saveVenue(form: FormData) {
  const me = await requireAdmin('/admin/venues');
  const id = String(form.get('id') ?? '');
  const data = {
    name: String(form.get('name') ?? '').trim().slice(0, 120),
    address: String(form.get('address') ?? '').trim().slice(0, 300),
    postcode: String(form.get('postcode') ?? '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 10),
    directions: String(form.get('directions') ?? '').trim().slice(0, 1000) || null,
    isClientSite: form.get('isClientSite') === 'on',
  };
  if (!data.name || !data.address || !POSTCODE.test(data.postcode)) redirect(`/admin/venues?msg=invalid${id ? `&edit=${id}` : ''}`);
  if (id) {
    const before = await db.venue.findUniqueOrThrow({ where: { id } });
    await db.venue.update({ where: { id }, data });
    await audit(me.id, 'VENUE_UPDATED', 'Venue', id, before, data);
  } else {
    const v = await db.venue.create({ data });
    await audit(me.id, 'VENUE_CREATED', 'Venue', v.id, undefined, data);
  }
  revalidatePath('/admin', 'layout');
  redirect('/admin/venues?msg=saved');
}
