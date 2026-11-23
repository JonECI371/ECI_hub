/**
 * Browser checks: plays the main journeys in a real browser against a running copy of the site and its test database.
 * Usage: start the site (`npm run dev` or `npm start`), then `npm run e2e`. Set E2E_BASE for another address.
 * Local test copies only: it creates fresh records (tagged e2e.*) and never contacts Stripe, Xero, Teams or email.
 */
import { PrismaClient } from '@prisma/client';
import { makeFixtures } from './fixtures';
import { BASE, OUT, authCode, bodyText, check, chromium, customerLogin, newPage, results, staffLogin, step, type Page } from './lib';

const BROKEN = /Something went wrong|Application error|Internal Server Error|This page could not be found/i;

/** A page loads, shows a heading, has no error text, no console errors and (at phone width) no sideways scrolling. */
async function pageOk(page: Page, errors: string[], path: string, label = path, phone = false, crumbs = false) {
  errors.length = 0;
  const res = await page.goto(BASE + path);
  const status = res?.status() ?? 0;
  const text = await bodyText(page);
  const h1 = await page.locator('h1').count();
  const trail = crumbs ? await page.locator('nav[aria-label="Breadcrumb"]').count() : 1;
  const current = crumbs && trail === 1 ? await page.locator('nav[aria-label="Breadcrumb"] [aria-current=page]').count() : 1;
  const box = crumbs && trail === 1 ? await page.locator('nav[aria-label="Breadcrumb"]').boundingBox() : null;
  const overflow = phone ? await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1) : false;
  const problems = [
    status >= 400 && `status ${status}`, BROKEN.test(text) && 'error text on page', h1 === 0 && 'no heading',
    box && box.y > 200 && `breadcrumbs are ${Math.round(box.y)}px down the page, not along the top`,
    trail !== 1 && `${trail} breadcrumb trails (should be 1)`, current !== 1 && 'breadcrumb has no current page marked',
    errors.length > 0 && `console: ${errors[0]}`, overflow && 'scrolls sideways at 390px',
  ].filter(Boolean);
  check(problems.length === 0, `${phone ? 'phone ' : ''}${label} loads cleanly`, problems.join('; '));
  if (problems.length) await page.screenshot({ path: `${OUT}${(phone ? 'phone-' : '') + label.replace(/\W+/g, '-')}.png` }).catch(() => {});
}

(async () => {
  const db = new PrismaClient();
  const f = await makeFixtures(db);
  const br = await chromium.launch();
  const openSession = f.open.sessions[0];
  const fullSession = f.full.sessions[0];

  // ---------- 1. Public pages, desktop and phone ----------
  console.log('\n# Public pages');
  for (const phone of [false, true]) {
    const { page, errors, ctx } = await newPage(br, phone ? 390 : 1100, phone ? 800 : 850);
    const paths: [string, string][] = [
      ['/', 'home'], ['/courses', 'courses'], [`/courses/${f.open.slug}`, 'course page'], ['/about', 'about'], ['/contact', 'contact'],
      ['/accounts/apply', 'credit account application'], ['/tools', 'free tools'], ['/login', 'login'], ['/legal/terms', 'terms'], ['/legal/privacy', 'privacy'],
    ];
    for (const [p, l] of paths) await step(l, page, () => pageOk(page, errors, p, l, phone, !['home', 'login'].includes(l)));
    await ctx.close();
  }
  await step('wide screen', null, async () => {
    const { page, ctx } = await newPage(br, 1920, 1000);
    for (const [p, label] of [['/', 'home'], ['/courses', 'courses'], [`/courses/${f.open.slug}`, 'course page'], ['/contact', 'contact']] as const) {
      await page.goto(BASE + p);
      const x = (await page.locator('h1').first().boundingBox())?.x ?? 0;
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      check(x >= 300 && x <= 345 && !wide, `on a 1920px screen the ${label} content stops at 1280px, centred`, `heading starts ${Math.round(x)}px from the left`);
    }
    await ctx.close();
  });
  await step('machine files', null, async () => {
    const { page, ctx } = await newPage(br);
    for (const p of ['/sitemap.xml', '/robots.txt', '/api/health']) {
      const r = await page.goto(BASE + p); check((r?.status() ?? 0) === 200, `${p} answers`);
    }
    const r = await page.goto(BASE + '/no-such-page'); check(r?.status() === 404, 'unknown address gives a 404 page');
    await ctx.close();
  });

  // ---------- 2. Who can see what ----------
  console.log('\n# Access rules');
  await step('logged-out admin', null, async () => {
    const { page, ctx } = await newPage(br); await page.goto(BASE + '/admin');
    check(/\/login/.test(page.url()), 'logged-out visitor to /admin is sent to log in'); await page.goto(BASE + '/account');
    check(/\/login/.test(page.url()), 'logged-out visitor to /account is sent to log in'); await ctx.close();
  });
  await step('customer blocked from admin', null, async () => {
    const { page, ctx } = await newPage(br); await customerLogin(page, f.customer.email);
    check(/\/account/.test(page.url()), 'customer signs in with the emailed code and lands on their account');
    await page.goto(BASE + '/admin'); check(/no-access|\/login/.test(page.url()), 'customer cannot open /admin', page.url());
    await page.goto(BASE + '/trainer'); check(/no-access|\/login/.test(page.url()), 'customer cannot open /trainer', page.url());
    await ctx.close();
  });

  // ---------- 3. Sign-in ----------
  console.log('\n# Sign-in');
  await step('unknown email', null, async () => {
    const { page, ctx } = await newPage(br); await page.goto(BASE + '/login');
    await page.fill('input[name=email]', `nobody.${f.tag}@example.com`); await page.click('button[type=submit]'); await page.waitForURL(/step=code/);
    check(!/Your code is/.test(await bodyText(page)), 'an unknown email gets the same screen and no code is shown'); 
    await page.fill('input[name=code]', '123456'); await page.click('button[type=submit]');
    await page.waitForURL(/error=/); check(true, 'a made-up code is refused'); await ctx.close();
  });
  await step('customer wrong code', null, async () => {
    const { page, ctx } = await newPage(br); await page.goto(BASE + '/login');
    await page.fill('input[name=email]', f.customer.email); await page.click('button[type=submit]'); await page.waitForURL(/step=code/);
    const real = (await page.locator('strong.font-mono').innerText()).trim();
    const wrong = real === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) { await page.fill('input[name=code]', wrong); await page.click('button[type=submit]'); await page.waitForLoadState('networkidle'); if (i < 4) await page.goto(BASE + '/login?step=code'); }
    await page.goto(BASE + '/login?step=code'); await page.fill('input[name=code]', real); await page.click('button[type=submit]');
    await page.waitForURL(/error=(locked|expired)/, { timeout: 10000 }); check(true, 'five wrong customer codes lock that code, even the right one is then refused'); await ctx.close();
  });
  await step('staff sign-in', null, async () => {
    const { page, ctx } = await newPage(br); await page.goto(BASE + '/login');
    await page.fill('input[name=email]', f.admin.email); await page.click('button[type=submit]'); await page.waitForURL(/step=staff/);
    const t = await bodyText(page);
    check(/authenticator/i.test(t) && !/Your code is/.test(t), 'staff go straight to the authenticator screen with no email code');
    await page.fill('input[name=code]', '000000'); await page.click('button[type=submit]'); await page.waitForURL(/error=wrong/); check(true, 'a wrong authenticator code is refused');
    await page.fill('input[name=code]', authCode()); await page.click('button[type=submit]'); await page.waitForURL(/\/admin/, { timeout: 20000 });
    check(true, 'the right authenticator code signs an Admin in'); await ctx.close();
  });
  await step('staff lockout', null, async () => {
    const { page, ctx } = await newPage(br);
    await page.goto(BASE + '/login'); await page.fill('input[name=email]', f.trainer.email); await page.click('button[type=submit]'); await page.waitForURL(/step=staff/);
    check(/30 days/.test(await bodyText(page)), 'a trainer is offered "keep me logged in for 30 days"');
    for (let i = 0; i < 5; i++) { await page.fill('input[name=code]', '000000'); await page.click('button[type=submit]'); await page.waitForLoadState('networkidle'); }
    await page.waitForURL(/error=stafflocked/, { timeout: 10000 }); check(true, 'five wrong authenticator codes lock the sign-in');
    await page.goto(BASE + '/login'); await page.fill('input[name=email]', f.trainer.email); await page.click('button[type=submit]'); await page.waitForURL(/step=staff/);
    await page.fill('input[name=code]', authCode()); await page.click('button[type=submit]'); await page.waitForURL(/error=stafflocked/, { timeout: 10000 });
    check(true, 'the right code is refused while locked'); await ctx.close();
    await db.person.update({ where: { id: f.trainer.id }, data: { totpFailures: 0, totpLockedUntil: null } });
  });
  let setupLink = '';
  await step('no self set-up', null, async () => {
    const { page, ctx } = await newPage(br); await page.goto(BASE + '/login');
    await page.fill('input[name=email]', f.newStaff.email); await page.click('button[type=submit]'); await page.waitForURL(/error=staffsetup/);
    check((await page.locator('img[alt^="QR"]').count()) === 0, 'staff without an authenticator cannot set one up themselves');
    await page.goto(BASE + '/login?step=staff'); check((await page.locator('img[alt^="QR"]').count()) === 0, 'the set-up screen cannot be reached by address alone'); await ctx.close();
  });
  await step('setup link', null, async () => {
    const { page, ctx } = await newPage(br); await staffLogin(page, f.superAdmin.email);
    await page.goto(`${BASE}/admin/people/${f.newStaff.id}`); await page.click('text=Create setup link');
    await page.waitForSelector('[data-testid=setup-link]'); setupLink = (await page.locator('[data-testid=setup-link]').innerText()).trim();
    check(setupLink.includes('/login/setup?t='), 'a Super Admin can create a one-time setup link');
    const s = await newPage(br); await s.page.goto(setupLink); await s.page.waitForURL(/step=staff/);
    check((await s.page.locator('img[alt^="QR"]').count()) === 1, 'the setup link shows the QR code');
    const key = (await s.page.locator('code').first().innerText()).replace(/\s/g, '');
    const { totpAt } = await import('../src/lib/totp');
    await s.page.fill('input[name=code]', totpAt(key, Math.floor(Date.now() / 30000))); await s.page.click('button[type=submit]');
    await s.page.waitForURL(/\/admin/, { timeout: 20000 }); check(true, 'the new staff member sets up their authenticator and is signed in');
    const again = await newPage(br); await again.page.goto(setupLink); await again.page.waitForURL(/error=setuplink/); check(true, 'the setup link stops working once used');
    await ctx.close(); await s.ctx.close(); await again.ctx.close();
  });
  await step('admin cannot make setup links', null, async () => {
    const { page, ctx } = await newPage(br); await staffLogin(page, f.admin.email);
    await page.goto(`${BASE}/admin/people/${f.newStaff.id}`); check((await page.locator('text=Create setup link').count()) === 0, 'an Admin (not Super Admin) does not see Create setup link'); await ctx.close();
  });

  // ---------- 4. Booking on account (customer) ----------
  console.log('\n# Booking on account');
  let bookingRef = '';
  await step('book on account', null, async () => {
    const { page, ctx, errors } = await newPage(br); await customerLogin(page, f.booker.email, `/book/${openSession.id}`);
    check(new RegExp(`/book/${openSession.id}`).test(page.url()), 'booker lands back on the checkout after signing in');
    check((await page.locator('nav[aria-label="Breadcrumb"]').innerText()).replace(/\s+/g, ' ').includes('Courses › ') && /Book$/.test((await page.locator('nav[aria-label="Breadcrumb"]').innerText()).trim()), 'checkout shows the trail Home › Courses › course › Book');
    await page.check('input[name=terms]');
    if (await page.locator('input[name=waiver]').count()) await page.check('input[name=waiver]');
    const before = await db.booking.count({ where: { bookerId: f.booker.id } });
    await page.click('button:has-text("Confirm booking")');
    await page.waitForTimeout(1500);
    const noPo = await db.booking.count({ where: { bookerId: f.booker.id } });
    check(noPo === before, 'a booking without the PO number the account requires is refused');
    await page.fill('input[name=poNumber]', 'PO-E2E-1');
    if (!(await page.locator('input[name=terms]').isChecked())) await page.check('input[name=terms]');
    if (await page.locator('input[name=waiver]').count() && !(await page.locator('input[name=waiver]').isChecked())) await page.check('input[name=waiver]');
    await page.click('button:has-text("Confirm booking")');
    await page.waitForURL(/\/book\/outcome/, { timeout: 25000 });
    const t = await bodyText(page);
    check(/confirmed|booked/i.test(t) && !BROKEN.test(t), 'booking on account is confirmed on the outcome page');
    check(/Confirmed$/.test((await page.locator('nav[aria-label="Breadcrumb"]').innerText()).trim()), 'the outcome page shows the trail ending in Confirmed');
    const b = await db.booking.findFirst({ where: { bookerId: f.booker.id }, orderBy: { createdAt: 'desc' }, include: { attendees: true } });
    bookingRef = b?.reference ?? '';
    check(b?.status === 'CONFIRMED' && b.method === 'ACCOUNT', 'the booking is saved as confirmed, on account');
    check(b?.poNumber === 'PO-E2E-1', 'the PO number is saved on the booking');
    const st = await db.statement.findFirst({ where: { accountId: f.account.id }, include: { lines: true } });
    check((st?.lines.length ?? 0) === 1, 'it appears as one line on the account statement');
    const audit = await db.auditLog.count({ where: { recordId: b?.id } }); check(audit > 0, 'the booking is written to the audit log');
    const mail = await db.emailLog.count({ where: { personId: f.booker.id, trigger: { contains: 'BOOKING' } } }); check(mail > 0, 'a booking confirmation email is queued for the booker');
    await ctx.close();
  });
  await step('customer pages', null, async () => {
    const { page, ctx, errors } = await newPage(br); await customerLogin(page, f.booker.email);
    for (const p of ['/account', '/account/bookings', '/account/billing', '/account/team', '/account/settings', '/account/certificates']) await pageOk(page, errors, p, 'booker ' + p, false, true);
    if (bookingRef) await pageOk(page, errors, `/account/bookings/${bookingRef}`, 'booking detail', false, true);
    await ctx.close();
  });

  // ---------- 4b. Delegate details ----------
  console.log('\n# Delegate details');
  await step('delegate details', null, async () => {
    const { page, ctx, errors } = await newPage(br); await customerLogin(page, f.booker.email, `/book/${openSession.id}`);
    await page.click('button:has-text("+")'); await page.click('button:has-text("+")');
    check((await page.locator('[data-testid=delegates-next]').count()) === 1 && (await page.locator('input[name^=other_name_]').count()) === 0, 'checkout no longer asks for the other delegates; it says they come next');
    await page.fill('input[name=poNumber]', 'PO-E2E-DEL');
    await page.check('input[name=terms]'); if (await page.locator('input[name=waiver]').count()) await page.check('input[name=waiver]');
    await page.click('button:has-text("Confirm booking")'); await page.waitForURL(/\/book\/outcome/, { timeout: 25000 });
    check(/Add your delegates/.test(await bodyText(page)), 'the outcome page asks the booker to add delegate details when places are unnamed');
    await page.click('a:has-text("Delegate details")'); await page.waitForURL(/\/book\/delegates/);
    const crumbs = (await page.locator('nav[aria-label="Breadcrumb"]').innerText()).trim();
    check(/Delegate details$/.test(crumbs) && /Book/.test(crumbs), 'the Delegate details page shows the trail ending in Delegate details');
    check(/Booked by/.test(await bodyText(page)) && /Place 1: You/.test(await bodyText(page)), 'the page shows who booked, and the booker as place 1 when they are a delegate');
    await page.click('button:has-text("I am not attending")'); await page.waitForSelector('text=Place 1: not named yet');
    check(/Yes, use my details for place 1/.test(await bodyText(page)), 'the booker can say they are not a delegate, which frees place 1');
    await page.click('button:has-text("Yes, use my details for place 1")'); await page.waitForSelector('text=Place 1: You');
    check(true, 'the booker can add themselves back using their own details');
    check((await page.locator('[role=progressbar]').getAttribute('aria-valuenow')) === '0' && /0 of 3 complete/.test(await bodyText(page)), 'it starts at 0 of 3 complete');
    await pageOk(page, errors, page.url().replace(BASE, ''), 'delegate details page');
    const fillRow = async (idx: number, first: string, email: string, intent: 'now' | 'link') => {
      const row = page.locator('li[data-testid^=delegate-]').nth(idx);
      await row.locator('input[name=firstName]').fill(first); await row.locator('input[name=lastName]').fill('Delegate'); await row.locator('input[name=email]').fill(email);
      await row.locator(`button[value=${intent}]`).click();
    };
    // the booker's own place is first; the two others follow
    const rows = page.locator('li[data-testid^=delegate-]');
    check((await rows.count()) === 3, 'every place has a card');
    const linkEmail = f.mail('linkdel'); const nowEmail = f.mail('nowdel');
    await fillRow(1, 'Linda', linkEmail, 'link'); await page.waitForURL(/msg=linked/); await page.waitForSelector('text=Link sent');
    check(/Link sent/.test(await bodyText(page)) && /0 of 3 complete/.test(await bodyText(page)), 'emailing a link marks that delegate as Link sent');
    const linked = await db.person.findUnique({ where: { email: linkEmail } });
    const att = linked ? await db.attendee.findFirst({ where: { personId: linked.id, bookingId: { not: undefined } } }) : null;
    check(att?.status === 'INVITED', 'the emailed delegate is saved as invited');
    check(!!linked && (await db.emailLog.count({ where: { personId: linked.id, trigger: 'ATTENDEE_ADDED' } })) > 0, 'the delegate is emailed their joining details and link');
    await fillRow(2, 'Nora', nowEmail, 'now'); await page.waitForURL(/\/register\//);
    check(/entering the details for Nora/i.test(await bodyText(page)), 'fill in now opens their form and says whose details these are');
    check((await page.locator('input[name=authority]').count()) === 1, 'the booker sees the authority tick');
    await page.fill('input[name=mobile]', '07700 900123'); await page.fill('input[name=employer]', 'E2E Co');
    await page.locator('input[placeholder=DD]').fill('14'); await page.locator('select').first().selectOption('3'); await page.locator('input[placeholder=YYYY]').fill('1990');
    await page.click('button:has-text("Submit registration")'); await page.waitForSelector('text=Tick the box');
    check(true, 'submitting without the authority tick is refused');
    await page.check('input[name=authority]'); await page.click('button:has-text("Submit registration")'); await page.waitForURL(/\/book\/delegates/, { timeout: 20000 });
    check(/Entered by you/.test(await bodyText(page)) && /1 of 3 complete/.test(await bodyText(page)), 'the delegate shows as Entered by you and progress moves to 1 of 3');
    const nora = await db.person.findUnique({ where: { email: nowEmail } });
    const reg = nora ? await db.registration.findFirst({ where: { attendee: { personId: nora.id } } }) : null;
    check(!!reg?.enteredById && !!reg.authorityAt, 'who entered it and when they confirmed their authority are saved');
    check(!!nora && (await db.emailLog.count({ where: { personId: nora.id, trigger: 'REGISTRATION_ENTERED_FOR' } })) > 0, 'the delegate is emailed a copy to check');
    const out = await newPage(br); await out.page.goto(`${BASE}/register/${reg!.attendeeId}`);
    check(/link has expired/i.test(await bodyText(out.page)), 'the delegate form cannot be opened by a stranger');
    await ctx.close(); await out.ctx.close();
  });

  // ---------- 5. Admin ----------
  console.log('\n# Admin');
  await step('admin tour', null, async () => {
    const { page, ctx, errors } = await newPage(br); await staffLogin(page, f.superAdmin.email);
    const paths = ['/admin', '/admin/tasks', '/admin/bookings', '/admin/bookings/new', '/admin/courses', '/admin/courses/new', `/admin/courses/${f.open.id}`, `/admin/courses/${f.open.id}/edit`,
      `/admin/courses/${f.open.id}/class-list?session=${openSession.id}`, '/admin/schedule', '/admin/people', `/admin/people/${f.booker.id}`, `/admin/people/${f.trainer.id}`, '/admin/accounts', `/admin/accounts/${f.account.id}`,
      '/admin/venues', '/admin/settings', '/admin/test-log'];
    if (bookingRef) paths.push(`/admin/bookings/${bookingRef}`);
    for (const p of paths) await pageOk(page, errors, p, 'admin ' + p);
    await ctx.close();
  });
  await step('provider filter', null, async () => {
    const { page, ctx } = await newPage(br); await staffLogin(page, f.superAdmin.email);
    const [a, b] = f.providers;
    await page.goto(`${BASE}/admin/tasks?type=ELEARNING_ENROLMENT`);
    const t0 = await bodyText(page);
    check(t0.includes(a.name) && t0.includes(b.name) && t0.includes(a.taskTitle) && t0.includes(b.taskTitle), 'the Tasks page shows a button per e-learning provider, and both providers\' tasks');
    await page.click(`nav[aria-label="E-learning providers"] a:has-text("${a.name}")`); await page.waitForURL(/provider=/);
    const t1 = await bodyText(page);
    check(t1.includes(a.taskTitle) && !t1.includes(b.taskTitle), 'choosing a provider shows only that provider\'s enrolment tasks');
    check(/Filter on:.*Enrolment.*only/s.test(t1) || t1.includes(`· ${a.name}`), 'the page says which filter is on');
    await page.goto(`${BASE}/admin/tasks?type=ELEARNING_ENROLMENT&provider=${encodeURIComponent('not a provider')}`);
    check((await bodyText(page)).includes(a.taskTitle), 'an unknown provider in the address is ignored, not an error');
    await page.goto(`${BASE}/admin/tasks?view=done`); check((await page.locator('select[name=provider]').count()) === 1, 'the Done tab has a provider filter too');
    await ctx.close();
  });
  await step('trainer pages', null, async () => {
    const { page, ctx, errors } = await newPage(br, 390, 800); await staffLogin(page, f.trainer.email);
    for (const p of ['/trainer', '/trainer/availability', '/trainer/profile']) await pageOk(page, errors, p, 'trainer ' + p, true, true);
    await ctx.close();
  });
  await step('add booking', null, async () => {
    const { page, ctx } = await newPage(br); await staffLogin(page, f.admin.email);
    await page.goto(BASE + '/admin/bookings/new');
    await page.fill('input[name=email]', f.booker.email);
    const value = await page.locator('select[name=slot] option', { hasText: f.open.title }).first().getAttribute('value');
    await page.selectOption('select[name=slot]', value!);
    await page.check('input[name=method][value=ACCOUNT]'); await page.fill('input[name=poNumber]', 'PO-E2E-ADMIN');
    await page.click('button:has-text("Add booking")');
    await page.waitForTimeout(2500);
    const n = await db.booking.count({ where: { bookerId: f.booker.id, poNumber: 'PO-E2E-ADMIN' } });
    check(n === 1, 'Admin Add booking on account creates the booking', (await bodyText(page)).slice(0, 200).replace(/\n/g, ' '));
    const a = await db.auditLog.count({ where: { action: { contains: 'BOOKING' }, actorId: f.admin.id } }); check(a > 0, 'Add booking is written to the audit log');
    await ctx.close();
  });

  // ---------- 6. Credit account application ----------
  console.log('\n# Credit account application');
  await step('apply for account', null, async () => {
    const { page, ctx } = await newPage(br); await page.goto(BASE + '/accounts/apply');
    const co = `E2E Applicant ${f.tag}`;
    const v: Record<string, string> = { company: co, companyNumber: String(Math.floor(Math.random() * 1e8)).padStart(8, '0'), reg_line1: '1 Test Street', reg_town: 'Testville', reg_postcode: 'TE1 1ST', firstName: 'Alan', lastName: 'Applicant', email: f.mail('applicant'), phone: '01234567890', jobTitle: 'Buyer', accountsName: 'Ann Accounts', accountsEmail: f.mail('apps'), inv_line1: '1 Test Street', inv_town: 'Testville', inv_postcode: 'TE1 1ST', creditLimit: '5000' };
    for (const [k, val] of Object.entries(v)) await page.fill(`input[name=${k}]`, val);
    await page.selectOption('select[name=industry]', { index: 1 }); await page.selectOption('select[name=poRule]', { index: 1 });
    await page.fill('input[name=expectedDelegates]', '4'); await page.check('input[name=terms]');
    await page.waitForTimeout(1200); await page.click('button:has-text("Submit application")');
    await page.waitForTimeout(3000);
    const acc = await db.account.findFirst({ where: { company: co } });
    check(acc?.status === 'APPLIED', 'the credit account application is saved as applied', (await bodyText(page)).slice(0, 200).replace(/\n/g, ' '));
    const task = acc ? await db.task.findFirst({ where: { recordId: acc.id } }) : null; check(!!task, 'it creates a task for the team to review');
    await ctx.close();
  });

  // ---------- 7. Waitlist ----------
  console.log('\n# Full course');
  await step('full session', null, async () => {
    const { page, ctx } = await newPage(br); await staffLogin(page, f.admin.email);
    await page.goto(BASE + '/admin/bookings/new'); await page.fill('input[name=email]', f.customer.email);
    const value = await page.locator('select[name=slot] option', { hasText: f.full.title }).first().getAttribute('value');
    await page.selectOption('select[name=slot]', value!); await page.check('input[name=method][value=PAID]');
    const note = page.locator('textarea, input[name=paidNote], input[name=note]').first(); if (await note.count()) await note.fill('E2E paid by bank transfer');
    await page.click('button:has-text("Add booking")'); await page.waitForTimeout(2500);
    const full = await db.booking.count({ where: { sessionId: fullSession.id, status: 'CONFIRMED' } });
    const { page: p2, ctx: c2, errors } = await newPage(br); await pageOk(p2, errors, `/courses/${f.full.slug}`, 'full course page');
    const t = await bodyText(p2); check(full === 1 ? /full|waitlist/i.test(t) : true, 'a full session shows as full / offers the waitlist', `confirmed bookings: ${full}`);
    await ctx.close(); await c2.close();
  });

  await br.close(); await db.$disconnect();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Screenshots of failures: ${OUT}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('Run stopped:', e.message); process.exit(2); });
