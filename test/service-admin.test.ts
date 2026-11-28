import { describe, expect, it } from 'vitest';
import { SERVICE_FAQ_ROWS, STEP_ROWS, hasServicePlaceholder, serviceFromForm, serviceToForm } from '@/lib/service-content';

const form = (v: Record<string, string>, all: Record<string, string[]> = {}) => serviceFromForm((k) => v[k] ?? '', (k) => all[k] ?? []);

describe('service wording form', () => {
  it('turns lines and rows into stored wording, dropping empty and half-filled parts', () => {
    const { content, faqs } = form({
      category: 'Hazardous areas', whatIsIt: 'First paragraph.\n\nSecond paragraph.\n\n\n', whoIntro: 'For sites that handle gases.', whoItems: 'Refineries\n  Water sites  \n\n',
      standards: 'HSE L138\nIEC 60079-10-1', step_title_0: 'Data gathering', step_text_0: 'Review substances.', step_title_1: 'Half a step', faq_q_0: 'How long?', faq_a_0: 'It depends.', faq_q_1: 'No answer',
    }, { relatedCourses: ['dsear-awareness'] });
    expect(content.whatIsIt).toEqual(['First paragraph.', 'Second paragraph.']);
    expect(content.whoNeedsIt).toEqual({ intro: 'For sites that handle gases.', items: ['Refineries', 'Water sites'] });
    expect(content.standards).toEqual(['HSE L138', 'IEC 60079-10-1']);
    expect(content.approach?.steps).toEqual([{ title: 'Data gathering', text: 'Review substances.' }]);
    expect(content.whyItMatters).toBeUndefined();
    expect(content.outcome).toBeUndefined();
    expect(content.relatedCourses).toEqual(['dsear-awareness']);
    expect(faqs).toEqual([{ q: 'How long?', a: 'It depends.' }]);
  });

  it('shows stored wording back as the form, with blank rows to fill in, and round-trips', () => {
    const stored = { category: 'Hazardous areas', whatIsIt: ['A.', 'B.'], whoNeedsIt: { items: ['X', 'Y'] }, approach: { steps: [{ title: 'One', text: 'Do one.' }] }, outcome: ['Drawings'] };
    const f = serviceToForm(stored, [{ q: 'Q', a: 'A' }]);
    expect(f.steps).toHaveLength(STEP_ROWS);
    expect(f.faqs).toHaveLength(SERVICE_FAQ_ROWS);
    expect(f.whatIsIt).toBe('A.\n\nB.');
    expect(f.whoItems).toBe('X\nY');
    const v: Record<string, string> = { category: f.category, whatIsIt: f.whatIsIt, whoItems: f.whoItems, outcome: f.outcome, step_title_0: f.steps[0].title, step_text_0: f.steps[0].text, faq_q_0: f.faqs[0].q, faq_a_0: f.faqs[0].a };
    const back = form(v);
    expect(back.content).toEqual(stored);
    expect(back.faqs).toEqual([{ q: 'Q', a: 'A' }]);
  });

  it('stops unfinished text going live', () => {
    expect(hasServicePlaceholder({ outcome: ['[Check: what we deliver]'] }, [])).toBe(true);
    expect(hasServicePlaceholder({}, [{ q: 'Q', a: '[YOUR ANSWER. Typical time.]' }])).toBe(true);
    expect(hasServicePlaceholder({ outcome: ['Zone drawings'] }, [{ q: 'Q', a: 'Checked answer.' }])).toBe(false);
  });
});
