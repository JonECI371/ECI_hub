/** Course duration as a number and a unit, kept in Course.durationText as readable words ("2 days", "Half day", "Self-paced"). */
export type DurationUnit = 'hours' | 'days' | 'weeks' | 'half' | 'self';
export const DURATION_UNITS: [DurationUnit, string][] = [['hours', 'Hours'], ['days', 'Days'], ['weeks', 'Weeks'], ['half', 'Half day'], ['self', 'Self-paced']];

export function composeDuration(value: string, unit: string): string | null {
  if (unit === 'half') return 'Half day';
  if (unit === 'self') return 'Self-paced';
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 999 || !['hours', 'days', 'weeks'].includes(unit)) return null;
  const one = n === 1;
  return `${n} ${unit === 'hours' ? (one ? 'hour' : 'hours') : unit === 'days' ? (one ? 'day' : 'days') : one ? 'week' : 'weeks'}`;
}

export function parseDuration(text: string): { value: string; unit: DurationUnit } {
  const t = text.toLowerCase();
  if (t.includes('self')) return { value: '', unit: 'self' };
  if (t.includes('half')) return { value: '', unit: 'half' };
  const m = /(\d+(?:\.\d+)?)\s*(hour|day|week)/.exec(t);
  if (m) return { value: m[1], unit: m[2] === 'hour' ? 'hours' : m[2] === 'day' ? 'days' : 'weeks' };
  return { value: '', unit: 'days' };
}

/** Calendar days a course runs for, so a new date's last day can fill in itself. Weeks count 5 working days each. */
export function durationDays(text: string): number {
  const p = parseDuration(text);
  const n = Number(p.value);
  if (p.unit === 'days' && n >= 1) return Math.min(10, Math.ceil(n));
  if (p.unit === 'weeks' && n >= 1) return Math.min(10, Math.ceil(n) * 5);
  return 1;
}
