import type { Course, Session } from '@prisma/client';

/**
 * Publish rules. A course goes live only with a full description (and a provider for eLearning).
 * A date goes live only when its course is published, it starts in the future, and, for classroom
 * courses, it has a venue. Returns the reason it cannot be published, or null.
 */
export type SessionBlock = 'coursedraft' | 'novenue' | 'past';
export function sessionPublishBlock(course: Pick<Course, 'status' | 'deliveryType'>, s: Pick<Session, 'startsAt' | 'venueId'>): SessionBlock | null {
  if (course.status !== 'PUBLISHED') return 'coursedraft';
  if (s.startsAt <= new Date()) return 'past';
  if (course.deliveryType === 'IN_PERSON' && !s.venueId) return 'novenue';
  return null;
}

export const SESSION_BLOCK_TEXT: Record<SessionBlock, string> = {
  coursedraft: 'This date was saved as a draft. Publish the course first (Edit course, then set it to Published), then publish the date.',
  novenue: 'This date was saved as a draft. Classroom dates need a venue before they can be published: set a default venue on the course.',
  past: 'A date that has already started cannot be published.',
};
