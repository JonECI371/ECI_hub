import type { DeliveryType } from '@prisma/client';

export const SITE_URL = process.env.SITE_URL ?? 'http://localhost:3000';

export const DELIVERY_LABEL: Record<DeliveryType, string> = {
  ELEARNING: 'eLearning',
  VIRTUAL_CLASSROOM: 'Virtual classroom',
  IN_PERSON: 'In person',
};

/** A money amount, including £0 (gbp() shows 0 as "Price on request", for prices). */
export function money(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: pence % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(pence / 100);
}

export function gbp(pence: number): string {
  if (!pence) return 'Price on request';
  const whole = pence % 100 === 0;
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(pence / 100);
}

const ukDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
const ukTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

export const fmtDate = (d: Date) => ukDate.format(d);
export const fmtTime = (d: Date) => ukTime.format(d);

const ukDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'Europe/London' });
const ukLong = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
const ukKey = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/London' });

/** "Wed 25 November 2026", or "Mon 23 to Tue 24 November 2026" for a session over several days. */
const noComma = (s: string) => s.replace(',', '');
export function fmtSessionDates(start: Date, end: Date): string {
  const long = (d: Date) => noComma(ukLong.format(d));
  if (ukKey.format(start) === ukKey.format(end)) return long(start);
  const sameMonth = ukKey.format(start).slice(0, 7) === ukKey.format(end).slice(0, 7);
  return sameMonth ? `${noComma(ukDay.format(start))} to ${long(end)}` : `${long(start)} to ${long(end)}`;
}

/** Price with VAT note, or the placeholder while a price is not set. */
export function priceExVat(pence: number): { amount: string; vatNote: boolean } {
  return pence ? { amount: gbp(pence), vatNote: true } : { amount: 'Price on request', vatNote: false };
}
