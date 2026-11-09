// Sample data matching the canvas. Run: npm run db:seed
// Prices marked TODO are placeholders until the price list is confirmed.
import { PrismaClient, DeliveryType, CourseStatus, SessionStatus } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const subjects = await Promise.all(
    [
      { name: 'Thames Water', slug: 'thames-water', placesLeftDisplay: 'ALWAYS', changeCutoffHours: 24, registrationSet: 'thames-water' },
      { name: 'CompEx', slug: 'compex', changeCutoffHours: 336, registrationSet: 'compex', approvalRequired: true },
      { name: 'EUSR', slug: 'eusr', placesLeftDisplay: 'NEVER', registrationSet: 'eusr' },
      { name: 'Process safety', slug: 'process-safety', changeCutoffHours: 168 },
      { name: 'DSEAR', slug: 'dsear', changeCutoffHours: 168 },
    ].map((s) => db.subject.upsert({ where: { slug: s.slug }, update: s, create: s })),
  );
  const sub = Object.fromEntries(subjects.map((s) => [s.slug, s.id]));

  const summit = await db.venue.upsert({
    where: { id: 'venue-summit-house' },
    update: {},
    create: { id: 'venue-summit-house', name: 'Summit House', address: '33 Hanworth Road, Sunbury-on-Thames', postcode: 'TW16 5DA' },
  });

  const courses = [
    { slug: 'thames-water-safety-passport', title: 'Thames Water Safety Passport', subject: 'thames-water', deliveryType: DeliveryType.VIRTUAL_CLASSROOM, durationText: 'Half day', pricePence: 18500, placesPerSession: 12, validityYears: 3, meetingPlatform: 'TEAMS' as const,
      accreditation: 'Thames Water',
      shortDescription: 'Mandatory health, safety and environment training for anyone working on Thames Water sites.',
      // Course page copy from docs/design/Course.dc.html
      content: {
        eyebrow: 'Site safety passport',
        assessment: 'In-course',
        beforeYouBook: 'Your employer must register you on SkillGuard for Utilities and pay the subscription first. Bring your SkillGuard number and photo ID on the day. Without both, the passport cannot be issued.',
        audienceHeading: 'Anyone with site access',
        audience: 'Every direct employee, contractor and supply chain partner must hold a valid passport before starting work on the Thames Water network. If your work involves site access, you need it.',
        cover: [
          { title: 'Site hazards', text: 'Hazards specific to the Thames Water network and the controls that manage them.' },
          { title: 'Safety expectations', text: 'Zero incidents, zero harm, zero compromise, and what that means in practice.' },
          { title: 'Environment', text: 'Environmental responsibilities and protecting the public water supply.' },
          { title: 'Behaviours', text: 'Behavioural and customer facing standards expected of everyone on site.' },
        ],
        completionHeading: 'Thames Water Passport, virtual card',
        completion: 'Issued through SkillGuard for Utilities and valid for three years. We will remind you when renewal is due.',
        related: ['eusr-national-water-hygiene'],
      },
      faqs: [
        { q: 'What is SkillGuard and who pays for it?', a: 'SkillGuard for Utilities holds your digital passport record. Your employer registers you and pays the subscription directly. We cannot do this on your behalf.' },
        { q: 'How soon will I get my passport?', a: '[YOUR ANSWER. Typical issue time through SkillGuard.]' },
        { q: 'Does this cover other water companies?', a: 'No. This passport is specific to Thames Water. For wider access, EUSR SHEA Water is the recognised scheme.' },
      ],
    },
    { slug: 'compex-exa-awareness', title: 'CompEx ExA Awareness', subject: 'compex', deliveryType: DeliveryType.IN_PERSON, durationText: '1 day', pricePence: 0 /* TODO price */, placesPerSession: 8, validityYears: 5,
      shortDescription: 'Hazardous area awareness for anyone who enters, supervises or plans work in Ex areas.' },
    { slug: 'compex-exf-foundation', title: 'CompEx ExF Foundation', subject: 'compex', deliveryType: DeliveryType.IN_PERSON, durationText: '2 days', pricePence: 45000, placesPerSession: 8, validityYears: 5,
      shortDescription: 'The foundation knowledge needed before the practical CompEx competency units.' },
    { slug: 'compex-ex12-application-design-engineer', title: 'CompEx Ex12 Application Design Engineer', subject: 'compex', deliveryType: DeliveryType.IN_PERSON, durationText: 'TODO duration', pricePence: 0 /* TODO price */, placesPerSession: 8, validityYears: 5,
      shortDescription: 'For engineers who design and specify equipment for hazardous areas.' },
    { slug: 'compex-exa-awareness-elearning', title: 'CompEx ExA Awareness (eLearning)', subject: 'compex', deliveryType: DeliveryType.ELEARNING, durationText: 'Self-paced', pricePence: 0 /* TODO price */, provider: 'Trainor', fulfilment: 'ADMIN_TASK' as const, daysToComplete: 28,
      shortDescription: 'The ExA syllabus online, at your own pace.' },
    { slug: 'eusr-national-water-hygiene', title: 'EUSR National Water Hygiene', subject: 'eusr', deliveryType: DeliveryType.ELEARNING, durationText: 'Self-paced', pricePence: 14500, provider: 'EUSR QuartzWeb', fulfilment: 'ADMIN_TASK' as const, daysToComplete: 28, validityYears: 3,
      shortDescription: 'The water hygiene card needed to work on clean water assets.' },
    { slug: 'process-safety-awareness', title: 'Process Safety Awareness', subject: 'process-safety', deliveryType: DeliveryType.VIRTUAL_CLASSROOM, durationText: '1 day', pricePence: 0 /* TODO price */, placesPerSession: 12, meetingPlatform: 'ZOOM' as const,
      shortDescription: 'Cogent accredited introduction to major accident hazards and barriers.' },
    { slug: 'dsear-awareness', title: 'DSEAR Awareness', subject: 'dsear', deliveryType: DeliveryType.VIRTUAL_CLASSROOM, durationText: 'Half day', pricePence: 0 /* TODO price */, placesPerSession: 12, meetingPlatform: 'TEAMS' as const,
      shortDescription: 'What DSEAR and ATEX require of your site, and who is responsible for what.' },
  ];

  for (const c of courses) {
    const { subject, ...rest } = c;
    const data = {
      ...rest,
      subjectId: sub[subject],
      description: c.shortDescription,
      status: CourseStatus.PUBLISHED,
      defaultVenueId: c.deliveryType === DeliveryType.IN_PERSON ? summit.id : null,
    };
    await db.course.upsert({ where: { slug: c.slug }, update: data, create: data });
  }

  // A few sessions so the Courses and course pages have dates.
  const at = (d: string, h: number, m = 0) => new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  const sessions: [string, string, number, number, number, number][] = [
    ['thames-water-safety-passport', '2026-11-24', 9, 0, 12, 30],
    ['thames-water-safety-passport', '2026-12-08', 9, 0, 12, 30],
    ['thames-water-safety-passport', '2026-11-12', 13, 0, 16, 30],
    ['thames-water-safety-passport', '2026-12-15', 9, 0, 12, 30],
    ['compex-exa-awareness', '2026-11-30', 8, 30, 16, 30],
    ['compex-exf-foundation', '2026-12-07', 8, 30, 16, 30],
    ['process-safety-awareness', '2026-11-26', 9, 0, 16, 30],
    ['dsear-awareness', '2026-12-02', 9, 0, 12, 30],
  ];
  for (const [slug, day, sh, sm, eh, em] of sessions) {
    const course = await db.course.findUniqueOrThrow({ where: { slug } });
    const startsAt = at(day, sh, sm);
    const exists = await db.session.findFirst({ where: { courseId: course.id, startsAt } });
    if (!exists) {
      await db.session.create({
        data: { courseId: course.id, startsAt, endsAt: at(day, eh, em), capacity: course.placesPerSession ?? 12, status: SessionStatus.PUBLISHED, venueId: course.defaultVenueId },
      });
    }
  }

  // One full session so the waitlist path can be tried.
  const tw = await db.course.findUniqueOrThrow({ where: { slug: 'thames-water-safety-passport' } });
  await db.session.updateMany({ where: { courseId: tw.id, startsAt: at('2026-11-12', 13, 0) }, data: { status: SessionStatus.FULL } });

  // A sample delegate for trying the customer side.
  await db.person.upsert({
    where: { email: 'sam.taylor@example.co.uk' },
    update: {},
    create: { email: 'sam.taylor@example.co.uk', firstName: 'Sam', lastName: 'Taylor', employer: 'Kemp Civils Ltd', mobile: '07700 900123' },
  });

  // Sample certificates for Sam, one due for renewal.
  const sam = await db.person.findUniqueOrThrow({ where: { email: 'sam.taylor@example.co.uk' } });
  if ((await db.certificate.count({ where: { personId: sam.id } })) === 0) {
    const eusr = await db.course.findUniqueOrThrow({ where: { slug: 'eusr-national-water-hygiene' } });
    await db.certificate.createMany({
      data: [
        { personId: sam.id, courseId: eusr.id, issuedAt: new Date('2025-01-12'), expiresAt: new Date('2028-01-12') },
        { personId: sam.id, courseId: tw.id, issuedAt: new Date('2023-11-14'), expiresAt: new Date('2026-11-14') },
      ],
    });
  }

  // Sample trainers so sessions can be assigned.
  for (const t of [{ email: 'dan.hughes@example.co.uk', firstName: 'Dan', lastName: 'Hughes' }, { email: 'aisha.khan@example.co.uk', firstName: 'Aisha', lastName: 'Khan' }]) {
    await db.person.upsert({ where: { email: t.email }, update: {}, create: { ...t, roles: ['TRAINER'] } });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (adminEmail) {
    await db.person.upsert({
      where: { email: adminEmail },
      update: { roles: ['ADMIN', 'SUPER_ADMIN'] },
      create: { email: adminEmail, firstName: 'Admin', lastName: 'User', roles: ['ADMIN', 'SUPER_ADMIN'] },
    });
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
