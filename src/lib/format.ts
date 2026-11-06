import type { DeliveryType } from '@prisma/client';

export const SITE_URL = process.env.SITE_URL ?? 'http://localhost:3000';

export const DELIVERY_LABEL: Record<DeliveryType, string> = {
  ELEARNING: 'eLearning',
  VIRTUAL_CLASSROOM: 'Virtual classroom',
  IN_PERSON: 'In person',
};

export function gbp(pence: number): string {
  if (!pence) return 'Price on request';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

const ukDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
const ukTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

export const fmtDate = (d: Date) => ukDate.format(d);
export const fmtTime = (d: Date) => ukTime.format(d);
