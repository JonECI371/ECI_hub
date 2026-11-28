import { z } from 'zod';
import { Faqs, type Faq } from './course-content';

/** Consultancy page wording kept on Service.content. Every part is optional; the page hides empty sections. */
export const ServiceContent = z.object({
  category: z.string().optional(),
  whatIsIt: z.array(z.string()).optional(),
  whoNeedsIt: z.object({ intro: z.string().optional(), items: z.array(z.string()).default([]), note: z.string().optional() }).optional(),
  whyItMatters: z.object({ intro: z.string().optional(), points: z.array(z.string()).default([]), closing: z.string().optional() }).optional(),
  approach: z.object({ intro: z.string().optional(), steps: z.array(z.object({ title: z.string(), text: z.string() })).default([]), closing: z.string().optional() }).optional(),
  outcome: z.array(z.string()).optional(),
  standards: z.array(z.string()).optional(),
  linkedRegulation: z.string().optional(),
  reviewFrequency: z.string().optional(),
  triggers: z.array(z.string()).optional(),
  whoWeWorkWith: z.array(z.string()).optional(),
  relatedCourses: z.array(z.string()).optional(),
  relatedServices: z.array(z.string()).optional(),
});
export type ServiceContent = z.infer<typeof ServiceContent>;

export const readServiceContent = (v: unknown): ServiceContent => {
  const r = ServiceContent.safeParse(v);
  return r.success ? r.data : {};
};
export const readServiceFaqs = (v: unknown): Faq[] => {
  const r = Faqs.safeParse(v);
  return r.success ? r.data : [];
};

/** Admin form shape for a service's page wording: plain strings and fixed-size rows, so the form needs no scripting. */
export const STEP_ROWS = 10;
export const SERVICE_FAQ_ROWS = 10;
export type ServiceForm = {
  category: string; whatIsIt: string; whoIntro: string; whoItems: string; whoNote: string; whyIntro: string; whyPoints: string; whyClosing: string;
  approachIntro: string; steps: { title: string; text: string }[]; approachClosing: string; outcome: string; standards: string; linkedRegulation: string;
  reviewFrequency: string; triggers: string; whoWeWorkWith: string; relatedCourses: string[]; relatedServices: string[]; faqs: { q: string; a: string }[];
};

const lines = (a?: string[]) => (a ?? []).join('\n');
const pad = <T,>(rows: T[], n: number, blank: T): T[] => [...rows, ...Array.from({ length: Math.max(0, n - rows.length) }, () => blank)].slice(0, Math.max(n, rows.length));

/** Stored wording as form values. Lists become one item per line; paragraphs are separated by a blank line. */
export function serviceToForm(contentJson: unknown, faqsJson: unknown): ServiceForm {
  const c = readServiceContent(contentJson);
  return {
    category: c.category ?? '', whatIsIt: (c.whatIsIt ?? []).join('\n\n'),
    whoIntro: c.whoNeedsIt?.intro ?? '', whoItems: lines(c.whoNeedsIt?.items), whoNote: c.whoNeedsIt?.note ?? '',
    whyIntro: c.whyItMatters?.intro ?? '', whyPoints: lines(c.whyItMatters?.points), whyClosing: c.whyItMatters?.closing ?? '',
    approachIntro: c.approach?.intro ?? '', steps: pad(c.approach?.steps ?? [], STEP_ROWS, { title: '', text: '' }), approachClosing: c.approach?.closing ?? '',
    outcome: lines(c.outcome), standards: lines(c.standards), linkedRegulation: c.linkedRegulation ?? '', reviewFrequency: c.reviewFrequency ?? '',
    triggers: lines(c.triggers), whoWeWorkWith: lines(c.whoWeWorkWith), relatedCourses: c.relatedCourses ?? [], relatedServices: c.relatedServices ?? [],
    faqs: pad(readServiceFaqs(faqsJson), SERVICE_FAQ_ROWS, { q: '', a: '' }),
  };
}

const toLines = (s: string, max = 200, limit = 12) => s.split('\n').map((x) => x.trim().slice(0, max)).filter(Boolean).slice(0, limit);
const optional = <T extends object>(o: T) => (Object.values(o).some((v) => (Array.isArray(v) ? v.length : v)) ? o : undefined);

/** Form values back to what is stored: empty parts are dropped, so the page hides them. */
export function serviceFromForm(get: (k: string) => string, all: (k: string) => string[]): { content: ServiceContent; faqs: Faq[] } {
  const t = (k: string, max: number) => get(k).slice(0, max) || undefined;
  const steps: { title: string; text: string }[] = [];
  for (let i = 0; i < STEP_ROWS; i++) { const title = get(`step_title_${i}`).slice(0, 80), text = get(`step_text_${i}`).slice(0, 400); if (title && text) steps.push({ title, text }); }
  const faqs: Faq[] = [];
  for (let i = 0; i < SERVICE_FAQ_ROWS; i++) { const q = get(`faq_q_${i}`).slice(0, 200), a = get(`faq_a_${i}`).slice(0, 1200); if (q && a) faqs.push({ q, a }); }
  const raw = {
    category: t('category', 60),
    whatIsIt: get('whatIsIt').split(/\n\s*\n/).map((p) => p.trim().slice(0, 1200)).filter(Boolean).slice(0, 6),
    whoNeedsIt: optional({ intro: t('whoIntro', 300), items: toLines(get('whoItems')), note: t('whoNote', 400) }),
    whyItMatters: optional({ intro: t('whyIntro', 300), points: toLines(get('whyPoints')), closing: t('whyClosing', 400) }),
    approach: optional({ intro: t('approachIntro', 400), steps, closing: t('approachClosing', 400) }),
    outcome: toLines(get('outcome')), standards: toLines(get('standards'), 80, 10), linkedRegulation: t('linkedRegulation', 80), reviewFrequency: t('reviewFrequency', 80),
    triggers: toLines(get('triggers')), whoWeWorkWith: toLines(get('whoWeWorkWith')), relatedCourses: all('relatedCourses').slice(0, 6), relatedServices: all('relatedServices').slice(0, 6),
  };
  const content: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) if (v !== undefined && !(Array.isArray(v) && v.length === 0)) content[k] = v;
  return { content: ServiceContent.parse(content), faqs };
}

/** Text still waiting for a check ("[Check: ...]", "[YOUR ANSWER ...]") must not go live. */
export const hasServicePlaceholder = (content: ServiceContent, faqs: Faq[]) => /\[\s*(check|your answer)/i.test(JSON.stringify([content, faqs]));
