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
      data: { slug: `e2e-course-${suffix}-${tag}`, title: `E2E Course ${suffix} ${tag}`, subjectId: subject.id, deliveryType: 'VIRTUAL_CLASSROOM', status: 'PUBLISHED', shortDescription: 'Browser check course', description: 'Browser check course', durationText: 'Half day', pricePence: 18500, meetingPlatform: 'TEAMS',
        sessions: { create: { startsAt: new Date(Date.now() + 14 * 86400000), endsAt: new Date(Date.now() + 14 * 86400000 + 3 * 3600000), capacity, status: 'PUBLISHED' } } },
      include: { sessions: true },
    });
  const open = await mkCourse('open', 10);
  const full = await mkCourse('full', 1);
  await db.session.update({ where: { id: full.sessions[0].id }, data: { capacity: 1 } });

  return { tag, mail, superAdmin, admin, trainer, newStaff, customer, booker, account, subject, open, full };
}
export type Fixtures = Awaited<ReturnType<typeof makeFixtures>>;
