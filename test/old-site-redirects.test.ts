import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { OLD_SITE_REDIRECTS } from '@/lib/old-site-redirects';

// Every address in the old site's sitemaps (25 Nov 2026) except the home page and /about and /consultancy, which keep the same address.
const OLD_URLS = [
  'custom-training-learning-solutions', 'managing-ageing-asset-risk-asset-integrity-training', 'eusr-cat-genny-training-2', 'case-study-template', 'case-study-ex-awareness',
  'designing-for-dsear-compliance', 'functional-safety-foundation-compex-fsf-course', 'dsear-and-atex-awareness-customised-training-1-day-course',
  'process-safety-leadership-psl-executive-process-safety-programme', 'process-safety-management-for-operations-psmo', 'process-safety-awareness-psa-introduction-to-process-safety-principles',
  'process-safety-management-foundations-psmf', 'dsear-verification', 'battery-room-assessment-bess-ra', 'intrinsically-safe-i-s-circuit-design',
  'dsear-risk-assessment-and-hazardous-area-classification', 'the-importance-of-design-choices-to-shape-safety', 'buncefield-disaster-2', 'buncefield-disaster-hazardex', 'buncefield-podcast',
  'hazardex26', 'eusr-national-water-hygiene-training', 'dsear-gap-analysis-compliance-review-and-hazardous-area-assessment', 'thames-water-safety-passport-training',
  'compex-exf-foundation-hazardous-area-foundation-course', 'compex-exa-training-page-final', 'compex-ex12-application-design-engineer-training', 'compex-ex14-responsible-persons-training', 'eusr-shea-water',
  'training-clone', 'compex-2', 'buncefield-disaster', 'terms-and-conditions', 'resources', 'site-safety-training', 'process-safety', 'up-coming-courses', 'home-trial', 'resources/safety-library',
  'opportunities', 'resources-new', 'contact-us', 'thank-you', 'project-enquiry', 'credit-account-application', 'thames-water-safety-passport-skillguard', 'compex', 'reflect-eci-hub',
];

describe('old website redirects', () => {
  it('covers every old address', () => {
    for (const u of OLD_URLS) expect(OLD_SITE_REDIRECTS['/' + u], u).toBeTruthy();
  });

  it('points only at pages that exist: a route, a known course or service, or a legal document', () => {
    const courseSlugs = new Set(JSON.parse(readFileSync('prisma/redirect-targets.json', 'utf8')).courses as string[]);
    const serviceSlugs = new Set(JSON.parse(readFileSync('prisma/redirect-targets.json', 'utf8')).services as string[]);
    const routes = ['/', '/courses', '/consultancy', '/contact', '/about', '/tools', '/accounts/apply', '/legal/terms'];
    for (const [from, to] of Object.entries(OLD_SITE_REDIRECTS)) {
      const path = to.split('?')[0];
      if (path.startsWith('/courses/')) expect(courseSlugs.has(path.slice(9)), `${from} -> ${to}`).toBe(true);
      else if (path.startsWith('/consultancy/')) expect(serviceSlugs.has(path.slice(13)), `${from} -> ${to}`).toBe(true);
      else expect(routes.includes(path), `${from} -> ${to}`).toBe(true);
      expect(to.includes('//') || to.includes('—'), from).toBe(false);
    }
  });

  it('never sends a path to itself, and has no chains', () => {
    for (const [from, to] of Object.entries(OLD_SITE_REDIRECTS)) {
      expect(to.split('?')[0]).not.toBe(from);
      expect(OLD_SITE_REDIRECTS[to.split('?')[0]], `${from} chains`).toBeUndefined();
    }
  });

  it('the Next config reads the same list', () => {
    expect(existsSync('src/lib/old-site-redirects.json')).toBe(true);
    expect(readFileSync('next.config.mjs', 'utf8')).toContain('old-site-redirects.json');
  });
});
