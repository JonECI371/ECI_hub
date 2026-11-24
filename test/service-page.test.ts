import { describe, expect, it } from 'vitest';
import { readServiceContent, readServiceFaqs } from '@/lib/service-content';
import { serviceFacts, serviceJsonLd, serviceMarkdown, serviceSummary, serviceEnquiryHref } from '@/lib/service-page';

const s = { slug: 'dsear-hac', title: 'DSEAR Risk Assessment', shortDescription: 'Short.' };
const content = readServiceContent({
  category: 'Hazardous areas', whatIsIt: ['It defines the zones. It also sets the controls.'], whoNeedsIt: { intro: 'For sites that handle flammable gases.', items: ['Refineries'] },
  approach: { steps: [{ title: 'Data gathering', text: 'Review substances.' }] }, outcome: ['Zone drawings', 'A defensible report', 'An action plan', 'A fourth item'],
  standards: ['HSE L138', 'IEC 60079-10-1'], linkedRegulation: 'DSEAR / ATEX', reviewFrequency: 'Every 3 to 5 years',
});

describe('consultancy page', () => {
  it('reads stored wording safely: nonsense becomes empty, not an error', () => {
    expect(readServiceContent('nonsense')).toEqual({});
    expect(readServiceContent({ whoNeedsIt: 5 })).toEqual({});
    expect(readServiceFaqs([{ q: 'Q', a: 'A' }])).toHaveLength(1);
    expect(readServiceFaqs('bad')).toEqual([]);
  });

  it('shows only the facts the service has, always with POA', () => {
    expect(serviceFacts(content).map(([k]) => k)).toEqual(['Service', 'Standards', 'Regulation', 'Review', 'Price']);
    expect(serviceFacts({}).map(([k]) => k)).toEqual(['Service', 'Price']);
    expect(serviceFacts(content)[0][1]).toBe('Hazardous areas consultancy');
  });

  it('builds an answer-first summary from the wording only', () => {
    const t = serviceSummary(s, content);
    expect(t).toContain('DSEAR Risk Assessment is a consultancy service from ECI-Hub');
    expect(t).toContain('It defines the zones.');
    expect(t).not.toContain('It also sets the controls');
    expect(t).toContain('It follows HSE L138, IEC 60079-10-1.');
    expect(t).toContain('You receive zone drawings, a defensible report, an action plan.');
    expect(t).toContain('Pricing is on application');
    expect(serviceSummary(s, {})).toContain('Short.');
  });

  it('marks the service up as a schema.org Service and links the quote button to the contact form', () => {
    const ld = serviceJsonLd(s, content) as Record<string, unknown>;
    expect(ld['@type']).toBe('Service');
    expect(ld.serviceType).toBe('Hazardous areas consultancy');
    expect((ld.provider as Record<string, unknown>).name).toBe('ECI-Hub');
    expect(serviceEnquiryHref('DSEAR & HAC')).toBe('/contact?topic=consult&service=DSEAR%20%26%20HAC');
  });

  it('writes the AI version with every part that exists', () => {
    const md = serviceMarkdown(s, content, [{ q: 'How long?', a: 'It depends.' }]);
    for (const p of ['# DSEAR Risk Assessment', '## Key facts', '- Standards: HSE L138, IEC 60079-10-1', '## What it is', '## Who needs it', '- Refineries', '## Our approach', '1. Data gathering: Review substances.', '## What you get', '**How long?**', '## How to get a quote']) expect(md).toContain(p);
    expect(md).not.toContain('## Why it matters');
  });
});
