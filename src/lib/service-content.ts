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
