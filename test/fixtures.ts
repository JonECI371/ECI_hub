import { db } from '@/lib/db';

let n = 0;
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

export async function course(opts: { capacity?: number; price?: number; delivery?: 'VIRTUAL_CLASSROOM' | 'IN_PERSON' | 'ELEARNING'; cutoffHours?: number } = {}) {
  const id = uid();
  const subject = await db.subject.create({ data: { name: `Subject ${id}`, slug: `subject-${id}`, changeCutoffHours: opts.cutoffHours ?? 24 } });
  const c = await db.course.create({
    data: { slug: `course-${id}`, title: `Course ${id}`, subjectId: subject.id, deliveryType: opts.delivery ?? 'VIRTUAL_CLASSROOM', status: 'PUBLISHED', shortDescription: 'x', description: 'x', durationText: 'Half day', pricePence: opts.price ?? 18500, meetingPlatform: 'TEAMS' },
  });
  const session = opts.delivery === 'ELEARNING' ? null : await db.session.create({
    data: { courseId: c.id, startsAt: new Date(Date.now() + 10 * 86400000), endsAt: new Date(Date.now() + 10 * 86400000 + 3 * 3600000), capacity: opts.capacity ?? 3, status: 'PUBLISHED' },
  });
  return { subject, course: c, session };
}

export const booker = (email = `b${uid()}@example.com`) => ({ firstName: 'Test', lastName: 'Booker', email, marketingOptIn: false });
