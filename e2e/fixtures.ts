import { PrismaClient } from '@prisma/client';

/** Test data for the browser checks. Everything is created fresh with a unique tag, so runs never clash and nothing real is touched. */
export const TOTP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

export async function makeFixtures(db: PrismaClient) {
  const tag = Math.random().toString(36).slice(2, 8);
  const mail = (n: string) => `e2e.${n}.${tag}@example.com`;
  const person = (n: string, roles: ('DELEGATE' | 'BOOKER' | 'TRAINER' | 'ADMIN' | 'SUPER_ADMIN')[], totp = true) =>
    db.person.create({ data: { email: mail(n), firstName: n[0].toUpperCase() + n.slice(1), lastName: 'E2E', roles, totpSecret: totp ? TOTP_SECRET : null } });

  const [superAdmin, admin, trainer, newStaff, customer, booker] = await Promise.all([
    person('super', ['DELEGATE', 'ADMIN', 'SUPER_ADMIN']),
    person('admin', ['DELEGATE', 'ADMIN']),
    person('trainer', ['DELEGATE', 'TRAINER']),
    person('newstaff', ['DELEGATE', 'ADMIN'], false),
    person('customer', ['DELEGATE'], false),
    person('booker', ['DELEGATE', 'BOOKER'], false),
  ]);
  await db.trainerProfile.upsert({ where: { personId: trainer.id }, update: {}, create: { personId: trainer.id, status: 'APPROVED' } });

  const account = await db.account.create({
    data: {
      company: `E2E Co ${tag}`, companyNumber: `E${tag}`, registeredAddress: '1 Test Street', accountsName: 'Ann Accounts', accountsEmail: mail('accounts'),
      creditLimitPence: 200000, poRule: 'PER_BOOKING', status: 'ACTIVE', approvedAt: new Date(),
      members: { create: { personId: booker.id, role: 'MAIN_BOOKER', status: 'ACTIVE' } },
    },
  });

  const subject = await db.subject.create({ data: { name: `E2E Subject ${tag}`, slug: `e2e-subject-${tag}`, changeCutoffHours: 24 } });
  const mkCourse = (suffix: string, capacity: number) =>
    db.course.create({
      data: { slug: `e2e-course-${suffix}-${tag}`, title: `E2E Course ${suffix} ${tag}`, subjectId: subject.id, deliveryType: 'VIRTUAL_CLASSROOM', status: 'PUBLISHED', shortDescription: 'Browser check course', description: 'Browser check course', durationText: 'Half day', pricePence: 18500, placesPerSession: 10, meetingPlatform: 'TEAMS',
        sessions: { create: { startsAt: new Date(Date.now() + 14 * 86400000), endsAt: new Date(Date.now() + 14 * 86400000 + 3 * 3600000), capacity, status: 'PUBLISHED' } } },
      include: { sessions: true },
    });
  const open = await mkCourse('open', 10);
  const full = await mkCourse('full', 1);
  await db.session.update({ where: { id: full.sessions[0].id }, data: { capacity: 1 } });

  // Two e-learning courses from different providers, each with one open enrolment task, for the Tasks page provider filter.
  const providers: { name: string; taskTitle: string }[] = [];
  for (const [i, name] of [`E2E Provider A ${tag}`, `E2E Provider B ${tag}`].entries()) {
    const c = await db.course.create({ data: { slug: `e2e-elearn-${i}-${tag}`, title: `E2E eLearning ${i} ${tag}`, subjectId: subject.id, deliveryType: 'ELEARNING', status: 'PUBLISHED', shortDescription: 'x', description: 'x', durationText: 'Self-paced', pricePence: 5000, provider: name, fulfilment: 'ADMIN_TASK' } });
    const b = await db.booking.create({ data: { reference: `E2E-${tag}-${i}`, bookerId: booker.id, courseId: c.id, places: 1, method: 'ACCOUNT', accountId: account.id, subtotalPence: 5000, vatPence: 1000, totalPence: 6000, status: 'CONFIRMED' } });
    const a = await db.attendee.create({ data: { bookingId: b.id, personId: booker.id, status: 'INVITED' } });
    const taskTitle = `Enrol E2E person ${i} on ${name}`;
    await db.task.create({ data: { type: 'ELEARNING_ENROLMENT', title: taskTitle, detail: c.title, recordType: 'Attendee', recordId: a.id } });
    providers.push({ name, taskTitle });
  }

  // The same course online: linked to f.open as another format, for the format tabs.
  const group = `e2e-group-${tag}`;
  await db.course.update({ where: { id: open.id }, data: { formatGroup: group } });
  const online = await db.course.create({ data: { slug: `e2e-online-${tag}`, title: `E2E Online ${tag}`, subjectId: subject.id, deliveryType: 'ELEARNING', status: 'PUBLISHED', shortDescription: 'x', description: 'x', durationText: 'Self-paced', pricePence: 25000, provider: `E2E Provider A ${tag}`, fulfilment: 'ADMIN_TASK', daysToComplete: 28, formatGroup: group } });

  // A consultancy service with its own page.
  const service = await db.service.create({ data: { slug: `e2e-service-${tag}`, title: `E2E Hazard Service ${tag}`, status: 'PUBLISHED', shortDescription: 'A test consultancy service.', content: {
    category: 'Hazardous areas', whatIsIt: ['First paragraph about the service. Second sentence.'], whoNeedsIt: { intro: 'For sites that handle flammable gases.', items: ['Refineries', 'Water treatment sites'] },
    whyItMatters: { points: ['Wrong zoning raises explosion risk'] }, approach: { steps: [{ title: 'Data gathering', text: 'Review the substances.' }, { title: 'Drawings', text: 'Produce zone drawings.' }] },
    outcome: ['Zone drawings', 'A defensible report'], standards: ['HSE L138', 'IEC 60079-10-1'], linkedRegulation: 'DSEAR / ATEX', reviewFrequency: 'Every 3 to 5 years', triggers: ['A process change'], whoWeWorkWith: ['COMAH operators'], relatedCourses: [`e2e-course-open-${tag}`] },
    faqs: [{ q: 'How long does it take?', a: 'It depends on the site.' }] } });

  return { tag, mail, providers, online, service, superAdmin, admin, trainer, newStaff, customer, booker, account, subject, open, full };
}
export type Fixtures = Awaited<ReturnType<typeof makeFixtures>>;
