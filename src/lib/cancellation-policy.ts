import { db } from '@/lib/db';
import { money } from '@/lib/format';

/**
 * The cancellation policy lives here, in one place (Settings, key "cancellation"). It drives the steer an Admin
 * sees on a cancellation, the wording at checkout and the Cancellations section of the public terms.
 * A tier reads: "cancelled at least `daysBefore` days before the start: charge `chargePercent` of the booking".
 */
export type Tier = { daysBefore: number; chargePercent: number };
export type Policy = { tiers: Tier[]; lateHours: number; intro: string };

export const DEFAULT_POLICY: Policy = {
  tiers: [{ daysBefore: 28, chargePercent: 0 }, { daysBefore: 7, chargePercent: 50 }, { daysBefore: 0, chargePercent: 100 }],
  lateHours: 24,
  intro: 'We understand that plans change. What we can refund depends on how much notice you give. Our team looks at every cancellation and will always talk to you about moving to another date.',
};

export async function loadPolicy(): Promise<Policy> {
  const s = await db.setting.findUnique({ where: { key: 'cancellation' } });
  const v = (s?.value ?? {}) as Partial<Policy>;
  const tiers = Array.isArray(v.tiers) && v.tiers.length ? sortTiers(v.tiers) : DEFAULT_POLICY.tiers;
  return { tiers, lateHours: Number.isFinite(v.lateHours) ? Number(v.lateHours) : DEFAULT_POLICY.lateHours, intro: typeof v.intro === 'string' && v.intro.trim() ? v.intro : DEFAULT_POLICY.intro };
}

export const sortTiers = (t: Tier[]) => [...t].sort((a, b) => b.daysBefore - a.daysBefore);

/** Checks a policy before it is saved. Returns a message, or null if it is fine. */
export function policyProblem(p: Policy): string | null {
  if (!p.tiers.length) return 'Add at least one tier.';
  if (p.tiers.some((t) => !Number.isInteger(t.daysBefore) || t.daysBefore < 0 || t.daysBefore > 365)) return 'Days must be whole numbers from 0 to 365.';
  if (p.tiers.some((t) => !Number.isFinite(t.chargePercent) || t.chargePercent < 0 || t.chargePercent > 100)) return 'The charge must be between 0% and 100%.';
  if (new Set(p.tiers.map((t) => t.daysBefore)).size !== p.tiers.length) return 'Each tier needs a different number of days.';
  if (!p.tiers.some((t) => t.daysBefore === 0)) return 'The last tier must be 0 days, so every cancellation falls in a tier.';
  if (!Number.isInteger(p.lateHours) || p.lateHours < 0 || p.lateHours > 168) return 'The late cancellation window must be 0 to 168 hours.';
  return null;
}

export type Steer = { hoursNotice: number; late: boolean; chargePercent: number; chargePence: number; suggested: 'REFUND' | 'CHARGED' | 'PART_CHARGED'; text: string };

/** What the policy suggests for a cancellation made now. The Admin decides; this is only a steer. */
export function steer(policy: Policy, startsAt: Date | null, totalPence: number, now = new Date()): Steer {
  const hoursNotice = startsAt ? Math.max(0, (startsAt.getTime() - now.getTime()) / 3600000) : Infinity;
  const tiers = sortTiers(policy.tiers);
  const tier = tiers.find((t) => hoursNotice >= t.daysBefore * 24) ?? tiers[tiers.length - 1];
  const late = hoursNotice < policy.lateHours;
  const chargePercent = late ? Math.max(tier.chargePercent, 100) : tier.chargePercent;
  const chargePence = Math.round((totalPence * chargePercent) / 100);
  const notice = hoursNotice === Infinity ? 'no start date' : hoursNotice < 48 ? `${Math.floor(hoursNotice)} hours' notice` : `${Math.floor(hoursNotice / 24)} days' notice`;
  if (late) return { hoursNotice, late, chargePercent, chargePence, suggested: 'CHARGED', text: `Late cancellation: ${notice}, inside the ${policy.lateHours}-hour window. The policy is to charge the full ${money(totalPence)}. Waive it only for extenuating circumstances.` };
  if (chargePercent === 0) return { hoursNotice, late, chargePercent, chargePence, suggested: 'REFUND', text: `${notice}, outside the charge window. The policy suggests a full refund. You could also offer to move them to another date instead.` };
  if (chargePercent >= 100) return { hoursNotice, late, chargePercent, chargePence, suggested: 'CHARGED', text: `${notice}: the policy charges in full (${money(totalPence)}). Consider offering another date, or waive it for extenuating circumstances.` };
  return { hoursNotice, late, chargePercent, chargePence, suggested: 'PART_CHARGED', text: `${notice}: the policy charges ${chargePercent}% (${money(chargePence)}) and refunds the rest. Consider offering another date.` };
}

/** Plain-words lines for checkout and the public terms, built from the tiers so they can never disagree with the policy. */
export function policyLines(policy: Policy): string[] {
  const tiers = sortTiers(policy.tiers);
  const what = (pct: number, last = false) => (pct === 0 ? 'full refund' : pct >= 100 ? (last ? 'no refund' : 'no refund, the full price is charged') : `${pct}% of the price is charged and the rest refunded`);
  const lines = tiers.map((t, i) => {
    const next = tiers[i - 1];
    const range = t.daysBefore === 0 ? (next ? `Less than ${next.daysBefore} days before the start` : 'At any time') : i === 0 ? `${t.daysBefore} or more days before the start` : `${t.daysBefore} to ${next.daysBefore - 1} days before the start`;
    return `${range}: ${what(t.chargePercent, t.daysBefore === 0)}.`;
  });
  if (policy.lateHours > 0) lines.push(`Within ${policy.lateHours} hours of the start, or if you do not attend: no refund, unless there are extenuating circumstances.`);
  return lines;
}

/** One sentence for the checkout page. */
export function policyShort(policy: Policy): string {
  const free = sortTiers(policy.tiers).find((t) => t.chargePercent === 0 && t.daysBefore > 0);
  return free ? `Free cancellation up to ${free.daysBefore} ${free.daysBefore === 1 ? 'day' : 'days'} before the start. After that a charge may apply.` : 'A cancellation charge may apply. See our cancellation terms.';
}
