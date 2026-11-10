import { describe, expect, it } from 'vitest';
import { sessionPublishBlock } from '@/lib/publish-rules';

const future = new Date(Date.now() + 7 * 86400000);
describe('publish rules', () => {
  it('needs a published course', () => expect(sessionPublishBlock({ status: 'DRAFT', deliveryType: 'VIRTUAL_CLASSROOM' }, { startsAt: future, venueId: null })).toBe('coursedraft'));
  it('needs a venue for classroom dates', () => expect(sessionPublishBlock({ status: 'PUBLISHED', deliveryType: 'IN_PERSON' }, { startsAt: future, venueId: null })).toBe('novenue'));
  it('refuses dates that have started', () => expect(sessionPublishBlock({ status: 'PUBLISHED', deliveryType: 'VIRTUAL_CLASSROOM' }, { startsAt: new Date(Date.now() - 1000), venueId: null })).toBe('past'));
  it('allows a ready virtual date', () => expect(sessionPublishBlock({ status: 'PUBLISHED', deliveryType: 'VIRTUAL_CLASSROOM' }, { startsAt: future, venueId: null })).toBeNull());
});
