import type { Service } from '@prisma/client';
import type { ServiceFormValues } from '@/components/service-form';
import { serviceToForm } from '@/lib/service-content';

export function serviceFormValues(s: Service | null): ServiceFormValues {
  return {
    id: s?.id, title: s?.title ?? '', slug: s?.slug ?? '', status: s?.status ?? 'DRAFT', shortDescription: s?.shortDescription ?? '',
    seoTitle: s?.seoTitle ?? '', seoDescription: s?.seoDescription ?? '', page: serviceToForm(s?.content, s?.faqs),
  };
}
