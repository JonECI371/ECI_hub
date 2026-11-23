import { describe, expect, it } from 'vitest';
import type { Course, Session, Venue } from '@prisma/client';
import { COVER_ROWS, FAQ_ROWS, contentFromForm, contentToForm, hasPlaceholder } from '@/lib/course-content';
import { courseFacts, courseMarkdown, courseSummary } from '@/lib/course-facts';
import { courseJsonLd, siteJsonLd } from '@/lib/seo';

const course = {
  id: 'c1', slug: 'eusr-test', title: 'EUSR Test Course', subjectId: 's', deliveryType: 'ELEARNING', status: 'PUBLISHED', shortDescription: 'Short.', description: 'Long description.',
  durationText: 'Self-paced', pricePence: 14500, vatRatePercent: 20, placesPerSession: null, validityYears: 3, accreditation: 'EUSR', provider: 'EUSR QuartzWeb', daysToComplete: 28,
  meetingPlatform: null, photoUrl: null, socialImageUrl: null,
} as unknown as Course;

describe('course page wording', () => {
  it('turns the form into stored wording, dropping empty and half-filled rows, and keeps other stored fields', () => {
    const v: Record<string, string> = { eyebrow: 'Water hygiene card', audience: 'Anyone on clean water assets.', assessment: 'Online test', cover_title_0: 'Hygiene', cover_text_0: 'Why it matters.', cover_title_1: 'Half row', faq_q_0: 'How long?', faq_a_0: 'A few hours.', faq_q_1: 'No answer' };
    const { content, faqs } = contentFromForm((k) => v[k] ?? '', (k) => (k === 'related' ? ['other'] : []), { cover: [{ title: 'Old', text: 'Old' }], unknownKey: 'kept' });
    expect(content.cover).toEqual([{ title: 'Hygiene', text: 'Why it matters.' }]);
    expect(faqs).toEqual([{ q: 'How long?', a: 'A few hours.' }]);
    expect(content.related).toEqual(['other']);
    expect(content.completion).toBeUndefined();
    expect(content.eyebrow).toBe('Water hygiene card');
  });

  it('shows stored wording back as a form with blank rows to fill', () => {
    const f = contentToForm({ cover: [{ title: 'A', text: 'B' }], audience: 'X' }, [{ q: 'Q', a: 'A' }]);
    expect(f.cover).toHaveLength(COVER_ROWS);
    expect(f.faqs).toHaveLength(FAQ_ROWS);
    expect(f.cover[0]).toEqual({ title: 'A', text: 'B' });
    expect(f.cover[1]).toEqual({ title: '', text: '' });
  });

  it('refuses to publish while text still says Check or YOUR ANSWER', () => {
    expect(hasPlaceholder({ assessment: '[Check: pass mark]' }, [])).toBe(true);
    expect(hasPlaceholder({}, [{ q: 'How soon?', a: '[YOUR ANSWER. Typical time.]' }])).toBe(true);
    expect(hasPlaceholder({ assessment: 'Online test' }, [{ q: 'Q', a: 'Checked answer.' }])).toBe(false);
  });

  it('builds facts and an answer-first summary only from what the course has', () => {
    const facts = courseFacts(course, { assessment: 'Online test' });
    expect(facts.map(([k]) => k)).toEqual(['Delivery', 'Duration', 'Price', 'Awarded by', 'Valid for', 'Assessment']);
    expect(facts.find(([k]) => k === 'Price')?.[1]).toBe('£145 plus VAT');
    const s = courseSummary(course, { audience: 'Anyone who works on clean water assets. More text.' });
    expect(s).toContain('EUSR Test Course is a self-paced online course from ECI-Hub (ECFIO Engineering Ltd), with 28 days to finish.');
    expect(s).not.toContain('lasting');
    expect(s).toContain('costs £145 plus 20% VAT');
    expect(s).toContain('valid for 3 years');
    expect(s).toContain('Anyone who works on clean water assets.');
    expect(s).not.toContain('More text');
    const free = courseSummary({ ...course, pricePence: 0, accreditation: null, validityYears: null } as Course, {});
    expect(free).not.toContain('costs');
    expect(free).toContain('price is on application (POA)');
    expect(courseFacts({ ...course, pricePence: 0 } as Course, {}).find(([k]) => k === 'Price')?.[1]).toBe('POA, price on application');
  });

  it('writes the AI version with facts, wording, questions and dates', () => {
    const session = { id: 's1', startsAt: new Date('2026-12-10T09:00:00Z'), endsAt: new Date('2026-12-10T16:00:00Z'), venue: null } as unknown as Session & { venue: Venue | null };
    const md = courseMarkdown({ ...course, deliveryType: 'VIRTUAL_CLASSROOM', meetingPlatform: 'TEAMS' } as Course, { cover: [{ title: 'Hygiene', text: 'Why it matters.' }], beforeYouBook: 'Bring ID.' }, [{ q: 'How long?', a: 'A day.' }], [session]);
    expect(md).toMatch(/^# EUSR Test Course/);
    for (const part of ['## Key facts', '- Price: £145 plus VAT', '- Hygiene: Why it matters.', '## Before you book', '**How long?**', '## Upcoming dates', 'online on Microsoft Teams', '## How to book']) expect(md).toContain(part);
  });

  it('adds teaches, prerequisites, language and credential to the Course markup, and an organisation block site-wide', () => {
    const [ld] = courseJsonLd({ ...course, subject: { id: 's', name: 'EUSR' }, sessions: [] } as never, { cover: [{ title: 'Hygiene', text: 'x' }], beforeYouBook: 'Bring ID.', audience: 'Anyone.' }) as Record<string, unknown>[];
    expect(ld['@type']).toBe('Course');
    expect(ld.teaches).toEqual(['Hygiene']);
    expect(ld.coursePrerequisites).toBe('Bring ID.');
    expect(ld.inLanguage).toBe('en-GB');
    expect(ld.educationalCredentialAwarded).toBe('EUSR');
    expect((ld.offers as Record<string, unknown>).priceSpecification).toBeTruthy();
    const org = siteJsonLd();
    expect(org['@type']).toContain('LocalBusiness');
    expect(org.address.postalCode).toBe('TW16 5DA');
  });
});
