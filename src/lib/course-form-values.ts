import type { Course } from '@prisma/client';
import type { CourseFormValues } from '@/components/course-form';

export function courseFormValues(c: Course | null, defaultSubjectId: string): CourseFormValues {
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    id: c?.id, title: s(c?.title), slug: s(c?.slug), subjectId: c?.subjectId ?? defaultSubjectId, pricePounds: c ? (c.pricePence / 100).toFixed(2) : '0.00',
    vatRatePercent: s(c?.vatRatePercent ?? 20), shortDescription: s(c?.shortDescription), description: s(c?.description), deliveryType: c?.deliveryType ?? 'VIRTUAL_CLASSROOM',
    durationText: s(c?.durationText), placesPerSession: s(c?.placesPerSession ?? 12), meetingPlatform: s(c?.meetingPlatform ?? 'TEAMS'), meetingHost: s(c?.meetingHost),
    defaultVenueId: s(c?.defaultVenueId), venueRelease: s(c?.venueRelease ?? 'ON_CONFIRMATION'), provider: s(c?.provider), fulfilment: s(c?.fulfilment ?? 'ADMIN_TASK'),
    providerEmail: s(c?.providerEmail), daysToComplete: s(c?.daysToComplete), validityYears: s(c?.validityYears), accreditation: s(c?.accreditation),
    seoTitle: s(c?.seoTitle), seoDescription: s(c?.seoDescription), status: c?.status ?? 'DRAFT', photoUrl: s(c?.photoUrl), photoAlt: s(c?.photoAlt),
  };
}
