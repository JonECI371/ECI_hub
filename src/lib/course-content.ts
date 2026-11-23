import { z } from 'zod';

/** Course page copy kept on Course.content. Every field is optional; the page hides empty sections. */
export const CourseContent = z.object({
  eyebrow: z.string().optional(),
  assessment: z.string().optional(),
  beforeYouBook: z.string().optional(),
  audienceHeading: z.string().optional(),
  audience: z.string().optional(),
  cover: z.array(z.object({ title: z.string(), text: z.string() })).optional(),
  completionHeading: z.string().optional(),
  completion: z.string().optional(),
  related: z.array(z.string()).optional(),
});
export type CourseContent = z.infer<typeof CourseContent>;

export const Faqs = z.array(z.object({ q: z.string(), a: z.string() }));
export type Faq = z.infer<typeof Faqs>[number];

export function readContent(v: unknown): CourseContent {
  const r = CourseContent.safeParse(v);
  return r.success ? r.data : {};
}
export function readFaqs(v: unknown): Faq[] {
  const r = Faqs.safeParse(v);
  return r.success ? r.data : [];
}

/** Admin form shape for the course page copy: plain strings and fixed-size lists, so the form needs no scripting. */
export const COVER_ROWS = 6;
export const FAQ_ROWS = 8;
export type ContentForm = {
  eyebrow: string; audienceHeading: string; audience: string; assessment: string; beforeYouBook: string; completionHeading: string; completion: string;
  cover: { title: string; text: string }[]; faqs: { q: string; a: string }[]; related: string[];
};

const pad = <T,>(rows: T[], n: number, blank: T): T[] => [...rows, ...Array.from({ length: Math.max(0, n - rows.length) }, () => blank)].slice(0, Math.max(n, rows.length));

/** Course.content and Course.faqs as form values (always the same number of blank rows to fill in). */
export function contentToForm(contentJson: unknown, faqsJson: unknown): ContentForm {
  const c = readContent(contentJson);
  return {
    eyebrow: c.eyebrow ?? '', audienceHeading: c.audienceHeading ?? '', audience: c.audience ?? '', assessment: c.assessment ?? '', beforeYouBook: c.beforeYouBook ?? '',
    completionHeading: c.completionHeading ?? '', completion: c.completion ?? '',
    cover: pad(c.cover ?? [], COVER_ROWS, { title: '', text: '' }), faqs: pad(readFaqs(faqsJson), FAQ_ROWS, { q: '', a: '' }), related: c.related ?? [],
  };
}

/** Form values back to what is stored: empty fields and half-filled rows are dropped. Anything else already in content is kept. */
export function contentFromForm(get: (key: string) => string, all: (key: string) => string[], existing: unknown): { content: CourseContent; faqs: Faq[] } {
  const keep = readContent(existing);
  const t = (k: string, max: number) => get(k).slice(0, max) || undefined;
  const cover: CourseContent['cover'] = [];
  for (let i = 0; i < COVER_ROWS; i++) { const title = get(`cover_title_${i}`).slice(0, 80), text = get(`cover_text_${i}`).slice(0, 400); if (title && text) cover.push({ title, text }); }
  const faqs: Faq[] = [];
  for (let i = 0; i < FAQ_ROWS; i++) { const q = get(`faq_q_${i}`).slice(0, 200), a = get(`faq_a_${i}`).slice(0, 1200); if (q && a) faqs.push({ q, a }); }
  const content: CourseContent = {
    ...keep, eyebrow: t('eyebrow', 60), audienceHeading: t('audienceHeading', 80), audience: t('audience', 800), assessment: t('assessment', 160),
    beforeYouBook: t('beforeYouBook', 800), completionHeading: t('completionHeading', 80), completion: t('completion', 600),
    cover: cover.length ? cover : undefined, related: all('related').slice(0, 6),
  };
  for (const k of Object.keys(content) as (keyof CourseContent)[]) if (content[k] === undefined || (Array.isArray(content[k]) && (content[k] as unknown[]).length === 0)) delete content[k];
  return { content, faqs };
}

/** Text still waiting for a check ("[Check: ...]", "[YOUR ANSWER ...]") must not go live. */
export const PLACEHOLDER = /\[\s*(check|your answer)/i;
export function hasPlaceholder(content: CourseContent, faqs: Faq[]): boolean {
  return PLACEHOLDER.test(JSON.stringify([content, faqs]));
}
