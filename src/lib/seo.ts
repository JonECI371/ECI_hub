import type { Course, Session, Subject, Venue } from '@prisma/client';
import { SITE_URL } from './format';
import type { CourseContent } from './course-content';
import { courseSummary } from './course-facts';

type CourseWithSessions = Course & { subject: Subject; sessions: (Session & { venue: Venue | null })[] };

const PROVIDER = {
  '@type': 'Organization',
  name: 'ECI-Hub',
  legalName: 'ECFIO Engineering Ltd',
  url: SITE_URL,
};

const MODE = { ELEARNING: 'online', VIRTUAL_CLASSROOM: 'online', IN_PERSON: 'onsite' } as const;

/** schema.org Course + CourseInstance + Event JSON-LD, generated from the course record. */
export function courseJsonLd(c: CourseWithSessions, content: CourseContent = {}) {
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
    description: courseSummary(c, content),
    url,
    inLanguage: 'en-GB',
    provider: PROVIDER,
    isAccessibleForFree: false,
    educationalCredentialAwarded: c.accreditation ?? undefined,
    teaches: content.cover?.length ? content.cover.map((x) => x.title) : undefined,
    coursePrerequisites: content.beforeYouBook,
    audience: content.audience ? { '@type': 'Audience', audienceType: content.audienceHeading ?? 'Course audience', description: content.audience } : undefined,
    timeRequired: c.durationText,
    image: c.socialImageUrl ?? c.photoUrl ?? undefined,
    hasCourseInstance: c.deliveryType === 'ELEARNING'
      ? [{ '@type': 'CourseInstance', courseMode: 'online', courseWorkload: c.durationText }]
      : instances,
    offers: price ? { '@type': 'Offer', price, priceCurrency: 'GBP', category: 'Paid', priceSpecification: { '@type': 'PriceSpecification', price, priceCurrency: 'GBP', valueAddedTaxIncluded: false }, url } : undefined,
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

/** FAQPage JSON-LD; only when the course has FAQs. */
export function faqJsonLd(faqs: { q: string; a: string }[]) {
  if (faqs.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

/** BreadcrumbList JSON-LD from [name, path] pairs. */
export function breadcrumbJsonLd(items: [string, string][]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE_URL}${path}` })),
  };
}

/** Organisation and training centre, on every public page. */
export function siteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': ['Organization', 'LocalBusiness'],
    name: 'ECI-Hub',
    legalName: 'ECFIO Engineering Ltd',
    url: SITE_URL,
    description: 'Accredited EC&I safety training and specialist consultancy for COMAH, chemical, oil and gas, and water sites.',
    telephone: '+44 1932 963463',
    email: 'support@eci-hub.co.uk',
    address: { '@type': 'PostalAddress', streetAddress: 'Summit House, 33 Hanworth Road', addressLocality: 'Sunbury-on-Thames', postalCode: 'TW16 5DA', addressCountry: 'GB' },
    areaServed: { '@type': 'Country', name: 'United Kingdom' },
  };
}
