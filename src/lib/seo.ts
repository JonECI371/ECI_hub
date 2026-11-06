import type { Course, Session, Subject, Venue } from '@prisma/client';
import { SITE_URL } from './format';

type CourseWithSessions = Course & { subject: Subject; sessions: (Session & { venue: Venue | null })[] };

const PROVIDER = {
  '@type': 'Organization',
  name: 'ECI-Hub',
  legalName: 'ECFIO Engineering Ltd',
  url: SITE_URL,
};

const MODE = { ELEARNING: 'online', VIRTUAL_CLASSROOM: 'online', IN_PERSON: 'onsite' } as const;

/** schema.org Course + CourseInstance + Event JSON-LD, generated from the course record. */
export function courseJsonLd(c: CourseWithSessions) {
  const url = `${SITE_URL}/courses/${c.slug}`;
  const price = c.pricePence ? (c.pricePence / 100).toFixed(2) : undefined;
  const instances = c.sessions.map((s) => ({
    '@type': 'CourseInstance',
    courseMode: MODE[c.deliveryType],
    startDate: s.startsAt.toISOString(),
    endDate: s.endsAt.toISOString(),
    location: s.venue
      ? { '@type': 'Place', name: s.venue.name, address: `${s.venue.address}, ${s.venue.postcode}` }
      : { '@type': 'VirtualLocation', url },
    offers: price ? { '@type': 'Offer', price, priceCurrency: 'GBP', url, availability: 'https://schema.org/InStock' } : undefined,
  }));
  const course = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: c.title,
    description: c.shortDescription,
    url,
    provider: PROVIDER,
    educationalCredentialAwarded: c.accreditation ?? undefined,
    hasCourseInstance: c.deliveryType === 'ELEARNING'
      ? [{ '@type': 'CourseInstance', courseMode: 'online', courseWorkload: c.durationText }]
      : instances,
    offers: price ? { '@type': 'Offer', price, priceCurrency: 'GBP', category: 'Paid' } : undefined,
  };
  const events = c.sessions.map((s) => ({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: c.title,
    startDate: s.startsAt.toISOString(),
    endDate: s.endsAt.toISOString(),
    eventAttendanceMode: c.deliveryType === 'IN_PERSON' ? 'https://schema.org/OfflineEventAttendanceMode' : 'https://schema.org/OnlineEventAttendanceMode',
    location: s.venue ? { '@type': 'Place', name: s.venue.name, address: `${s.venue.address}, ${s.venue.postcode}` } : { '@type': 'VirtualLocation', url },
    organizer: PROVIDER,
    offers: price ? { '@type': 'Offer', price, priceCurrency: 'GBP', url } : undefined,
  }));
  return [course, ...events];
}
