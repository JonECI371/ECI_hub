import type { Service } from '@prisma/client';
import { SITE_URL } from './format';
import type { Faq } from './course-content';
import type { ServiceContent } from './service-content';

const PROVIDER = { '@type': 'Organization', name: 'ECI-Hub', legalName: 'ECFIO Engineering Ltd', url: SITE_URL };
export const serviceEnquiryHref = (title: string) => `/contact?topic=consult&service=${encodeURIComponent(title)}`;

/** The key facts shown in the page header: only the ones the service has. */
export function serviceFacts(c: ServiceContent): [string, string][] {
  return [
    ['Service', c.category ? `${c.category} consultancy` : 'Consultancy'],
    ...(c.standards?.length ? [['Standards', c.standards.join(', ')] as [string, string]] : []),
    ...(c.linkedRegulation ? [['Regulation', c.linkedRegulation] as [string, string]] : []),
    ...(c.reviewFrequency ? [['Review', c.reviewFrequency] as [string, string]] : []),
    ['Price', 'On application (POA)'],
  ];
}

const firstSentence = (t: string) => t.split(/(?<=[.!?])\s/)[0];

/** An answer-first summary for the top of the page, for search results and AI assistants. Built only from what the service says. */
export function serviceSummary(s: Pick<Service, 'title' | 'shortDescription'>, c: ServiceContent): string {
  const parts = [`${s.title} is a consultancy service from ECI-Hub (ECFIO Engineering Ltd).`];
  parts.push(c.whatIsIt?.[0] ? firstSentence(c.whatIsIt[0]) : s.shortDescription);
  if (c.standards?.length) parts.push(`It follows ${c.standards.join(', ')}.`);
  if (c.outcome?.length) parts.push(`You receive ${c.outcome.slice(0, 3).map((o) => o.replace(/\.$/, '').replace(/^./, (x) => x.toLowerCase())).join(', ')}.`);
  parts.push('Pricing is on application: contact ECI-Hub for a quote.');
  return parts.join(' ');
}

/** schema.org Service markup generated from the service record. */
export function serviceJsonLd(s: Pick<Service, 'slug' | 'title' | 'shortDescription'>, c: ServiceContent) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: s.title,
    description: serviceSummary(s, c),
    url: `${SITE_URL}/consultancy/${s.slug}`,
    serviceType: c.category ? `${c.category} consultancy` : 'Consultancy',
    provider: PROVIDER,
    areaServed: { '@type': 'Country', name: 'United Kingdom' },
    audience: c.whoNeedsIt?.items?.length ? { '@type': 'Audience', audienceType: c.whoNeedsIt.items.join('; ') } : undefined,
  };
}

/** The whole service as Markdown, for AI assistants: /llms/consultancy/<slug>. */
export function serviceMarkdown(s: Pick<Service, 'slug' | 'title' | 'shortDescription'>, c: ServiceContent, faqs: Faq[]): string {
  const url = `${SITE_URL}/consultancy/${s.slug}`;
  const L: string[] = [`# ${s.title}`, '', `> ${serviceSummary(s, c)}`, '', `Page: ${url}`, ''];
  L.push('## Key facts', ...serviceFacts(c).map(([k, v]) => `- ${k}: ${v}`), '');
  if (c.whatIsIt?.length) L.push('## What it is', '', ...c.whatIsIt.flatMap((p) => [p, '']));
  if (c.whoNeedsIt?.items.length) L.push('## Who needs it', '', ...(c.whoNeedsIt.intro ? [c.whoNeedsIt.intro, ''] : []), ...c.whoNeedsIt.items.map((i) => `- ${i}`), ...(c.whoNeedsIt.note ? ['', c.whoNeedsIt.note] : []), '');
  if (c.whyItMatters?.points.length) L.push('## Why it matters', '', ...(c.whyItMatters.intro ? [c.whyItMatters.intro, ''] : []), ...c.whyItMatters.points.map((i) => `- ${i}`), ...(c.whyItMatters.closing ? ['', c.whyItMatters.closing] : []), '');
  if (c.approach?.steps.length) L.push('## Our approach', '', ...(c.approach.intro ? [c.approach.intro, ''] : []), ...c.approach.steps.map((x, i) => `${i + 1}. ${x.title}: ${x.text}`), ...(c.approach.closing ? ['', c.approach.closing] : []), '');
  if (c.outcome?.length) L.push('## What you get', ...c.outcome.map((i) => `- ${i}`), '');
  if (c.triggers?.length) L.push('## When to review', ...c.triggers.map((i) => `- ${i}`), '');
  if (c.whoWeWorkWith?.length) L.push('## Who we work with', ...c.whoWeWorkWith.map((i) => `- ${i}`), '');
  if (faqs.length) L.push('## Questions and answers', '', ...faqs.flatMap((f) => [`**${f.q}**`, f.a, '']));
  L.push('## How to get a quote', `Request a quote at ${SITE_URL}${serviceEnquiryHref(s.title)}. Questions: support@eci-hub.co.uk, +44 (0) 1932 963463.`);
  return L.join('\n');
}
