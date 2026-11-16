import 'server-only';
import { db } from '@/lib/db';

/**
 * Test log of odd input. Key forms carry a hidden `_sig` field (see TestSignals) and every submission is checked
 * for values that no normal typing produces. It only records; it never blocks anyone. Super Admin reads it in
 * Admin, Test log. These are prompts to look, not proof: browser autofill and password managers can look like
 * "no keyboard activity" and a quick typist can be fast.
 */

const PLACEHOLDER = /^(please select|select( an? )?(option|one)?|choose( one)?|-+ ?(select|choose).*|undefined|null|nan|n\/a|\[object .*\]|\{\{.*\}\})$/i;
// zero-width and invisible characters, and left-to-right marks
const HIDDEN = /[​-‏‪-‮⁠-⁤﻿]/;

export function oddReason(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (HIDDEN.test(v)) return 'contains hidden characters';
  if (PLACEHOLDER.test(v)) return 'is placeholder text';
  if (v.split(',').some((part) => PLACEHOLDER.test(part.trim()))) return 'contains placeholder text';
  if (/```|\*\*[^*]+\*\*|^#{1,6}\s/m.test(v)) return 'contains formatting marks (markdown)';
  return null;
}

type Sig = { ms?: number; wd?: boolean; ia?: number; pa?: number; pc?: number };

const SKIP = /^\$|^_sig$|password|code|token|card|secret/i;

/** Call from a server action with the submitted form. Never throws and never changes what the action does. */
export async function inspectSubmission(form: FormData, formName: string, personId?: string | null): Promise<void> {
  try {
    const rows: { kind: string; field?: string; value?: string; detail?: string }[] = [];
    let filled = 0;
    for (const [k, v] of form.entries()) {
      if (typeof v !== 'string' || SKIP.test(k)) continue;
      if (v.trim()) filled++;
      const why = oddReason(v);
      if (why) rows.push({ kind: 'ODD_VALUE', field: k, value: v.slice(0, 200), detail: `Value ${why}.` });
    }
    let sig: Sig = {};
    try { sig = JSON.parse(String(form.get('_sig') ?? '{}')) as Sig; } catch { /* missing or altered: nothing to read */ }
    if (sig.wd) rows.push({ kind: 'AUTOMATED_BROWSER', detail: 'The browser says it is under automation (navigator.webdriver).' });
    if (typeof sig.ms === 'number' && filled >= 6 && sig.ms < 5000) rows.push({ kind: 'FAST_SUBMIT', detail: `${filled} fields filled and sent ${(sig.ms / 1000).toFixed(1)} seconds after the page opened.` });
    if (sig.ia === 0 && filled >= 3) rows.push({ kind: 'NO_INTERACTION', detail: 'No key presses or clicks were seen before sending (also happens with autofill).' });
    if ((sig.pa ?? 0) >= 3 && (sig.pc ?? 0) > 150) rows.push({ kind: 'PASTED_TEXT', detail: `${sig.pa} pastes totalling ${sig.pc} characters.` });
    if (!rows.length) return;
    // One batch per person and form a minute, so a retry does not fill the log.
    const recent = await db.testAnomaly.findFirst({ where: { form: formName, personId: personId ?? null, createdAt: { gt: new Date(Date.now() - 60000) } } });
    if (recent) return;
    await db.testAnomaly.createMany({ data: rows.map((r) => ({ ...r, form: formName, personId: personId ?? null })) });
  } catch (e) {
    console.error('[anomalies] could not log', (e as Error).message);
  }
}
