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
