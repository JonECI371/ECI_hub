import type { Course, Session, Subject, Venue } from '@prisma/client';
import { SITE_URL, fmtSessionDates, fmtTime, gbp, priceExVat } from './format';
import type { CourseContent, Faq } from './course-content';

type C = Course & { subject?: Subject | null };
type S = Session & { venue: Venue | null };

const platform = (c: C) => (c.meetingPlatform === 'ZOOM' ? 'Zoom' : 'Microsoft Teams');

/** How the course is delivered, in one plain phrase. */
export function deliveryPhrase(c: C): string {
  // The learning platform behind an eLearning course is an internal detail, not shown to customers.
  if (c.deliveryType === 'ELEARNING') return `Online, self-paced${c.daysToComplete ? `, with ${c.daysToComplete} days to finish` : ''}`;
  if (c.deliveryType === 'VIRTUAL_CLASSROOM') return `Live online on ${platform(c)}`;
  return 'In person at a training venue';
}

/** The key facts shown above the fold and in the AI version: only the ones the course has. */
export function courseFacts(c: C, content: CourseContent): [string, string][] {
  const price = priceExVat(c.pricePence);
  return [
    ['Delivery', deliveryPhrase(c)],
    ['Duration', c.durationText],
    ['Price', c.pricePence ? `${price.amount} plus VAT` : 'POA, price on application'],
    ...(c.accreditation ? [['Awarded by', c.accreditation] as [string, string]] : []),
    ...(c.validityYears ? [['Valid for', `${c.validityYears} years`] as [string, string]] : []),
    ...(content.assessment ? [['Assessment', content.assessment] as [string, string]] : []),
    ...(c.deliveryType !== 'ELEARNING' && c.placesPerSession ? [['Places per date', String(c.placesPerSession)] as [string, string]] : []),
  ];
}

/** An answer-first summary for the top of the page, for search results and AI assistants. Built only from what the course record says. */
export function courseSummary(c: C, content: CourseContent): string {
  const mode = c.deliveryType === 'ELEARNING' ? 'self-paced online course' : c.deliveryType === 'VIRTUAL_CLASSROOM' ? `live online course on ${platform(c)}` : 'classroom course';
  const selfPaced = /self-paced/i.test(c.durationText);
  const length = c.deliveryType === 'ELEARNING' ? (c.daysToComplete ? `, with ${c.daysToComplete} days to finish` : '') : selfPaced ? '' : `, lasting ${c.durationText.toLowerCase()}`;
  const parts = [`${c.title} is a ${mode} from ECI-Hub (ECFIO Engineering Ltd)${length}.`];
  parts.push(c.pricePence ? `It costs ${gbp(c.pricePence)} plus ${c.vatRatePercent}% VAT per place.` : 'The price is on application (POA): contact ECI-Hub for a quote.');
  if (c.accreditation) parts.push(`It is awarded by ${c.accreditation}.`);
  if (c.validityYears) parts.push(`The certificate is valid for ${c.validityYears} years.`);
  if (content.audience) parts.push(content.audience.split(/(?<=[.!?])\s/)[0]);
  return parts.join(' ');
}

/** The whole course as Markdown, for AI assistants: /llms/courses/<slug>. */
export function courseMarkdown(c: C, content: CourseContent, faqs: Faq[], sessions: (S & { left?: number })[], formats: { slug: string; title: string; deliveryType: Course['deliveryType']; pricePence: number }[] = []): string {
  const url = `${SITE_URL}/courses/${c.slug}`;
  const lines: string[] = [`# ${c.title}`, '', `> ${courseSummary(c, content)}`, '', `Page: ${url}`, ''];
  lines.push('## Key facts', ...courseFacts(c, content).map(([k, v]) => `- ${k}: ${v}`), `- Provider: ECI-Hub, ECFIO Engineering Ltd, Summit House, 33 Hanworth Road, Sunbury-on-Thames TW16 5DA`, '');
  lines.push('## About the course', '', c.description, '');
  if (content.audience) lines.push(`## ${content.audienceHeading ?? 'Who this course is for'}`, '', content.audience, '');
  if (content.cover?.length) lines.push('## What you will cover', ...content.cover.map((x) => `- ${x.title}: ${x.text}`), '');
  if (content.beforeYouBook) lines.push('## Before you book', '', content.beforeYouBook, '');
  if (content.completion) lines.push(`## ${content.completionHeading ?? 'Your certificate'}`, '', content.completion, '');
  if (formats.length) lines.push('## Also available as', ...formats.map((f) => `- ${f.title} (${f.deliveryType === 'IN_PERSON' ? 'in the classroom' : f.deliveryType === 'VIRTUAL_CLASSROOM' ? 'live online' : 'online, self-paced'}), ${f.pricePence ? `${gbp(f.pricePence)} plus VAT` : 'POA'}: ${SITE_URL}/courses/${f.slug}`), '');
  if (faqs.length) lines.push('## Questions and answers', '', ...faqs.flatMap((f) => [`**${f.q}**`, f.a, '']));
  if (c.deliveryType === 'ELEARNING') lines.push('## Dates', '', 'No fixed dates. You can book and start at any time.', '');
  else if (sessions.length) lines.push('## Upcoming dates', ...sessions.map((s) => `- ${fmtSessionDates(s.startsAt, s.endsAt)}, ${fmtTime(s.startsAt)} to ${fmtTime(s.endsAt)} UK time, ${s.venue ? `${s.venue.name}, ${s.venue.postcode}` : `online on ${platform(c)}`}${s.left === 0 ? ' (full, waitlist open)' : ''}`), '');
  lines.push('## How to book', `Book online at ${url}. Pay by card, or on account with an approved company credit account. Questions: support@eci-hub.co.uk, +44 (0) 1932 963463.`);
  return lines.join('\n');
}
