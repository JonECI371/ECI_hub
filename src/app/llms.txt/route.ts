import { db } from '@/lib/db';
import { DELIVERY_LABEL, SITE_URL, gbp } from '@/lib/format';

export const dynamic = 'force-dynamic';

// Plain-text summary for AI assistants, regenerated from the live catalogue.
export async function GET() {
  const courses = await db.course.findMany({ where: { status: 'PUBLISHED' }, include: { subject: true }, orderBy: { title: 'asc' } });
  const lines = [
    '# ECI-Hub',
    '',
    '> ECI-Hub (ECFIO Engineering Ltd) provides accredited EC&I safety training and specialist consultancy for COMAH, chemical, oil and gas, and water sites. Training centre: Summit House, Sunbury-on-Thames. On-site delivery across the UK.',
    '',
    'Delivery types: eLearning (self-paced), virtual classroom (live on Teams or Zoom), in person. Pay by card, or on a monthly-billed company credit account.',
    '',
    '## Courses',
    ...courses.map((c) => `- [${c.title}](${SITE_URL}/courses/${c.slug}): ${DELIVERY_LABEL[c.deliveryType]}, ${c.durationText}, ${gbp(c.pricePence)}. ${c.shortDescription}`),
    '',
    '## Contact',
    `- [Talk to us](${SITE_URL}/contact): support@eci-hub.co.uk, +44 (0) 1932 963463`,
  ];
  return new Response(lines.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
