'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { audit, requireAdmin } from '@/lib/admin';
import { hasServicePlaceholder, serviceFromForm } from '@/lib/service-content';

export type ServiceFormState = { error?: string; fields?: Record<string, string>; values?: Record<string, string>; relatedCourses?: string[]; relatedServices?: string[] };

/** Create or update a consultancy service. Anything still marked [Check: ...] cannot be published. */
export async function saveService(_prev: ServiceFormState, form: FormData): Promise<ServiceFormState> {
  const me = await requireAdmin('/admin/services');
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string' && !k.startsWith('$')) values[k] = v.replace(/\r\n/g, '\n').trim();
  const get = (k: string) => values[k] ?? '';
  const chosen = (k: string) => form.getAll(k).filter((x): x is string => typeof x === 'string');
  const relatedCourses = chosen('relatedCourses');
  const relatedServices = chosen('relatedServices');
  const fields: Record<string, string> = {};
  const status = ['DRAFT', 'PUBLISHED', 'WITHDRAWN'].includes(get('status')) ? (get('status') as 'DRAFT' | 'PUBLISHED' | 'WITHDRAWN') : 'DRAFT';

  if (!get('title')) fields.title = 'Enter a service name';
  if (!get('shortDescription')) fields.shortDescription = 'Enter a short description';
  const slug = get('slug').replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fields.slug = 'Use lower-case letters, numbers and hyphens';
  const clash = slug ? await db.service.findFirst({ where: { slug, NOT: get('id') ? { id: get('id') } : undefined } }) : null;
  if (clash) fields.slug = 'Another service already uses this web address';
  const page = serviceFromForm(get, (k) => (k === 'relatedCourses' ? relatedCourses : k === 'relatedServices' ? relatedServices.filter((s) => s !== slug) : []));
  if (/\bTODO\b/i.test([get('title'), get('shortDescription')].join(' '))) fields.shortDescription = fields.shortDescription ?? 'Remove the placeholder text (TODO) before publishing';
  if (status === 'PUBLISHED') {
    if (hasServicePlaceholder(page.content, page.faqs)) fields.page = 'Finish the page wording before publishing: some text still says [Check: ...] or [YOUR ANSWER ...]';
    if (!page.content.whatIsIt?.length) fields.whatIsIt = 'Add at least a short description under What is it before publishing';
  }
  if (Object.keys(fields).length) return { error: fields.page ?? 'Check the highlighted fields.', fields, values, relatedCourses, relatedServices };

  const data = {
    slug, title: get('title'), status, shortDescription: get('shortDescription').slice(0, 200),
    seoTitle: get('seoTitle').slice(0, 60) || null, seoDescription: get('seoDescription').slice(0, 155) || null,
    content: page.content as Prisma.InputJsonValue, faqs: page.faqs as Prisma.InputJsonValue,
  };
  let id = get('id');
  if (id) {
    const before = await db.service.findUniqueOrThrow({ where: { id } });
    await db.service.update({ where: { id }, data });
    await audit(me.id, 'SERVICE_UPDATED', 'Service', id, before, data);
  } else {
    id = (await db.service.create({ data })).id;
    await audit(me.id, 'SERVICE_CREATED', 'Service', id, undefined, data);
  }
  revalidatePath('/', 'layout');
  redirect(`/admin/services?msg=saved&id=${id}`);
}
