import 'server-only';
import { db } from '@/lib/db';

/**
 * Companies House public data API (free, needs an API key from developer.company-information.service.gov.uk).
 * Without COMPANIES_HOUSE_API_KEY the check is skipped and the task shows a link to check by hand.
 */
export type CompanyCheck =
  | { status: 'found'; name: string; companyStatus: string; address: string; incorporated?: string; checkedAt: string }
  | { status: 'not_found'; checkedAt: string }
  | { status: 'not_configured' }
  | { status: 'error'; message: string; checkedAt: string };

export const companiesHouseConfigured = () => !!process.env.COMPANIES_HOUSE_API_KEY;
export const companiesHouseLink = (number: string) => `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(number)}`;

/** UK company numbers are 8 characters: digits, or a 2-letter prefix (SC, NI, OC...) and 6 digits. */
export function normaliseCompanyNumber(raw: string): string | null {
  const n = raw.replace(/\s+/g, '').toUpperCase();
  if (/^\d{1,8}$/.test(n)) return n.padStart(8, '0');
  if (/^[A-Z]{2}\d{6}$/.test(n)) return n;
  return null;
}

export async function checkCompany(number: string, recordId: string): Promise<CompanyCheck> {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) return { status: 'not_configured' };
  const checkedAt = new Date().toISOString();
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`https://api.company-information.service.gov.uk/company/${encodeURIComponent(number)}`, {
        headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 404) return { status: 'not_found', checkedAt };
      if (!res.ok) throw new Error(`Companies House ${res.status}`);
      const c = (await res.json()) as { company_name: string; company_status: string; date_of_creation?: string; registered_office_address?: Record<string, string> };
      const a = c.registered_office_address ?? {};
      const address = [a.address_line_1, a.address_line_2, a.locality, a.postal_code].filter(Boolean).join(', ');
      return { status: 'found', name: c.company_name, companyStatus: c.company_status, address, incorporated: c.date_of_creation, checkedAt };
    } catch (err) {
      if (attempt === 2) {
        const message = (err as Error).message.slice(0, 300);
        await db.task.create({ data: { type: 'INTEGRATION_FAILURE', title: 'Companies House check failed', detail: `Company ${number}. ${message}`, recordType: 'Account', recordId } });
        return { status: 'error', message, checkedAt };
      }
    }
  }
  return { status: 'error', message: 'unreachable', checkedAt };
}
