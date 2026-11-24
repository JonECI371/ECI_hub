# Progress notes

One note per build stage, newest first. Written at the end of each stage so a new session (or a new person) can pick up without re-reading the whole history. Step-by-step history is in the git log.

## When a note is written

- At the end of every build stage (a phase task group such as 2.1 to 2.8).
- After a decision from Jon that changes scope, wording or settings (also recorded in the spec Change log).
- After an environment change: a new key or secret stored, DNS or Microsoft 365 changes, a new AWS resource.
- Before anything risky: a migration that touches existing data, or a production deploy.
- When a test log comes back, with what was signed off and what was not.

## 2026-11-24 (night): wording from the existing website entered; Ex14 and ExF eLearning created

- Jon asked for the real wording from the existing ECI-Hub website (eci-hub.co.uk) instead of the drafts. Entered on the test site for 11 courses (description, search title and description, who it is for, what you will cover, before you book, assessment, certificate, questions and answers, related courses): ExA classroom and eLearning, ExF classroom and eLearning, Ex12, Ex14, DSEAR, EUSR National Water Hygiene, SHEA Water, Process Safety Awareness, Thames Water Safety Passport. Prices, durations and short descriptions were not changed. Ex01 to Ex04 are deliberately not mentioned (spec). Rollback: /opt/eci/backups/before-wording-from-website.sql.gz on the server. Audit action COURSE_WORDING_SET.
- Ex14 CompEx Ex14 Responsible Persons Training now live at 1,850 (website says 1,650: Jon to confirm), 4 days, 8 places, five 2027 dates at Summit House. ExF eLearning created at 650 (provider Trainor and 28 days copied from ExA eLearning: to confirm). Not yet linked as formats (needs the format tabs deploy).
- Differences between the website and the new site left for Jon: Thames Water passport 185 here vs 75 on the website; National Water Hygiene 145 vs 140 and QuartzWeb vs XAMS; SHEA Water 160 vs 165; ExA classroom 175 vs 125 and 1 day vs half day; ExF 500 vs 450; Ex12 2 days here vs 5 days; DSEAR half day vs 1 day; Process Safety Awareness live online here vs on site or open course. The Default cloud environment now allows eci-hub.co.uk and www.eci-hub.co.uk (an unused extra environment named ECI_hub also exists).

## 2026-11-25: format tabs and Duplicate course (built, not deployed)

- Jon decided: the classroom and online versions of a course stay separate pages, with tabs at the top to switch between them, and a Duplicate course button in Admin. Built on branch course-formats-duplicate: Course.formatGroup (additive migration 20261124230000), an "Other formats of this course" section on the course form, format tabs under the breadcrumb bar (published formats only, label plus price), "Also available as" in the AI Markdown version, Admin > Course > Duplicate course (/admin/courses/new?from=id: copies details, wording and photo, draft, linked to the original, no dates). Also fixed: the contact form crashed its console with two courses of the same title. Ex14 Responsible Persons Training exists as a draft (price 1,850) awaiting its details.

## 2026-11-24 (late): deploy 2 and a seed pitfall

- Course page template, POA, simpler checkout deployed to the test site (overlay method as below; rollback tags app-previous and app-before-2026-11-24b, backups before-2026-11-24-deploy and before-2026-11-24b-deploy in /opt/eci/backups).
- Pitfall found and fixed: passing `seed` to run.sh runs prisma/seed.ts, which upserted every sample course with `update: data`, so each deploy reset prices, wording and status of those courses to the sample values (it reverted Jon's price list once; a comparison of the two backups showed nothing else was lost). Prices re-applied. Fixed in the repo: seed.ts creates only, and the deploy scripts no longer pass `seed`. The `tools` image in ECR still holds the old seed script, so never pass `seed` to run.sh on the existing database. Subject edits (approval, places display) were also overwritten before this fix.

## 2026-11-24 (later): course page template, POA, prices (built, not deployed; prices changed on the test site)

- Branch course-page-template (includes booking-flow-step3). Admin > Course form has a Course page wording section (label, who it is for, what you will cover x6, before you book, assessment, certificate, Q and A x8, related courses); [Check: ...] or [YOUR ANSWER ...] text blocks publishing. The course page opens with an answer-first "In short" summary and fuller facts; Course markup adds teaches, prerequisites, audience, language, price specification; Organization and LocalBusiness markup on every public page; each course as Markdown at /llms/courses/<slug>, linked from llms.txt. Blank price shows POA. Wording drafts for the courses are in the Claude Doc "Course page wording (draft)" awaiting Jon's checks; nothing from them is entered on the site.
- Prices set on the test site from Jon's list (audit logged, action COURSE_PRICE_SET): CompEx ExA Awareness classroom 175, ExA Awareness eLearning 250, ExF Foundation 500 (was 450), Ex12 Application Design Engineer 2,050, all plus VAT. Not on the site yet: Ex14 at 1,850 and ExF eLearning at 650 (no such courses exist); DSEAR and Process Safety Awareness stay blank (POA).

## 2026-11-24: deployed to the test site (booking flow steps 1 and 2, staff authenticator sign-in, Tasks provider filter, 1280px page width)

- Live on https://test.eci-hub.co.uk from about 22:15 UTC, with Jon's agreement. Branch site-max-width (contains browser-checks, staff-authenticator-signin, booking-flow-2-10, tasks-provider-filter). Three migrations applied: staff_totp_lockout, registration_entered_by (both additive). 117 browser checks and 88 tests passed locally before deploying; after deploying only simple page and wording checks were done (home, courses, login, delegates, breadcrumb bar, 1280px, migrations 17 applied, no errors in the log). Nothing has been clicked through on the live site yet.
- Method used (no Docker or ARM emulation needed): native `npm run build`; one extra image layer with the changed files (standalone output without .env, .uploads and node_modules/@img, plus .next/static, public, prisma, entrypoint.sh) built with Python and uploaded to ECR as tag `overlay`; the existing image's config was read from the server (`docker save ... | tar -xO`), the layer appended, and the combined manifest pushed to ECR as tag `app` through the ECR API (the server's role cannot push). The previous image is kept as tag `app-previous`: to roll back, put its manifest back on tag `app` and rerun /opt/eci/run.sh. A database backup is at /opt/eci/backups/before-2026-11-24-deploy.sql.gz on the server. The server /tmp is a small memory disk: never `docker save` to a file there, stream it.
- Found: the image from the 20 Nov quick deploy contains a blank `/app/.env` template and old test PO files in `/app/.uploads` (test data, no secrets). Not changed. The proper build (CodeBuild from git) will not include them.
- Staff now sign in with the authenticator app only (no email code). Jon and Kirsty already have authenticators. The sample trainers (aisha.khan and dan.hughes at example.co.uk) have none and cannot sign in until a Super Admin creates a setup link.

## 2026-11-24: Tasks page provider filter (built)

- Jon asked for a filter per course type on the enrolment tasks (EUSR QuartzWeb, Trainor, SkillGuard for Thames Water, others later). Built as a second row of buttons on Tasks > Enrolment, one per e-learning provider taken from the courses' Provider field, with open counts; SkillGuard or any new provider appears once a course uses it. Also a Provider selector on the Done tab. Branch tasks-provider-filter.

## 2026-11-24: booking flow 2.10, steps 1 and 2 built (not deployed)

- Approved by Jon: delegate details option "I have their full details" lives on the Delegate details page, not in checkout. Step 1: breadcrumbs on every public and portal page (Breadcrumbs in ui.tsx, PortalCrumbs for the portal and trainer app). Step 2: new page /book/delegates?ref=... listing every delegate with status (Complete, Entered by you, Link sent, Details needed) and a progress bar; per delegate Fill in now or Email them a link; the booker ticks "I am authorised to give these details" when filling in for someone else and the delegate is emailed a copy to check (trigger REGISTRATION_ENTERED_FOR); outcome page and booking detail link to it. Additive migration 20261124090000_registration_entered_by (Registration.enteredById, authorityAt). The 5 day reminders already existed (jobs.ts, sendRegistrationReminders) for named attendees who have not registered and for bookers with unnamed places. Step 3 (quicker checkout without the attendee entry) not started. Branch booking-flow-2-10; 105 browser checks and 86 tests pass.

## 2026-11-23: browser checks (e2e)

- `npm run e2e` plays the main journeys in a real browser against a running local copy (`npm run dev` first; Playwright comes with the Claude Code environment, the project does not depend on it). About 90 checks: public pages at desktop and 390 px, access rules, customer, staff and trainer sign-in (lockout, setup link), booking on account with PO, Admin Add booking, every admin, booker and trainer page, credit account application, full session. Local copies only: it creates e2e.* test records and never contacts Stripe, Xero, Teams or email. Failures save a screenshot in e2e/out. Not covered: card payment (needs Stripe test keys), real email delivery, how pages look. Those stay with Kirsty.

## 2026-11-23: staff sign-in by authenticator only (built locally, not deployed)

- Jon decided: Admins, Super Admins and trainers sign in with the authenticator app alone; customers keep the email code or link. Built: no email for staff; lock for 15 minutes after 5 wrong codes (new Person fields totpFailures and totpLockedUntil, migration 20261123210000_staff_totp_lockout); a new authenticator only from a Super Admin's one-time setup link (People page, Access, Create setup link, 24 hours, dead once used); clearer authenticator wording; trainers keep the 30 day device option. Super Admin only creates setup links (an Admin could otherwise take over a Super Admin account that has no authenticator). Existing authenticators keep working, so Jon and Kirsty set up nothing again. 86 tests pass; checked in a local browser (staff, trainer, lockout, setup link, customer). Not deployed.
- Same day: Mail.Send added to the ECI Booking Platform app and admin consent granted (it had not been on the app); the app was restarted so it picked it up; a test email reached Jon. Mail.Send is tenant wide (can send as anyone); Jon accepts this for the test site, go-live checklist still limits or removes it.

## 2026-11-16: fixes from Kirsty's Round 2 and Round 3 testing

- Signed off by Jon one by one. Built: bad PO files no longer vanish (booking goes ahead, confirmation page warns which files were not saved); Log out link on checkout works (GET /logout, plain link; it had been a link to a POST-only route); "This course gives a certificate" tick per course (no certificate task when off); Change date or time for one session (emails everyone booked, moves the Teams invite, audit entry); test emails through Microsoft 365 (EMAIL_MODE=graph from /opt/eci/mail.env, only to allow-listed addresses, needs Mail.Send); application audit now records PO choice and other bookers; Test log (Super Admin only, Settings) of odd input on the booking, credit account and registration forms.
- Checked against the test database and not app faults: no course has a photo (G1); kirsty+acme2 does not exist as a person and no application since 12 Nov exists (B1, C2, N4); the "Please select" county cannot come from our county box, which is plain text (A1). Left as is by Jon: six files at once error page (N8). Emails were never sent on the test server (TEST_NOT_SENT) until the Microsoft 365 route.
- Go-live: ECFIO Xero needs a sales code per course type (200-1 to 200-5), and Stripe clearing account 695 does not exist there (Stripe is a bank account "Stripe GBP"). Staff monitoring notice must mention the Test log.

## 2026-11-15: CRM proposal and mock-up

- CRM proposal (Claude Doc) and clickable mock-up written for Jon; Jon's first answers: Teams call recording and transcription probably owned but not switched on (to check); first line is the main contact number; recording notice to be added later; email logging probably limited to the shared mailboxes (support, bookings, training), to be revisited. Remaining questions are listed in the proposal. Nothing built yet; CRM is Phase 3.1 and 3.2.
- Dark Admin theme built and deployed (3ebcb7e).

## 2026-11-15: Full Xero run passed on the test organisation

- Card booking, refund credit note, account contacts (including a duplicate name), month-end draft invoice with PO files attached (needed the `accounting.attachments` permission, so Xero had to be reconnected once), and payment in Xero marking the statement paid with credit restored all worked end to end against ECI Test Hub.
- Invoice INV-0003: dated 31 Oct 2026, due 30 Nov 2026, reference "Training October 2026", one line per booking with its PO number, 20% VAT on Income (OUTPUT2), total £666.00, two files attached, paid.
- Booking flow mock-up approved by Jon (plan item 2.10); Admin Add booking (2.9) approved. Both are built after Kirsty's testing.
- Still open for Jon: connect real Xero and Stripe at go-live (docs/go-live-checklist.md), Kirsty's checklists, SharePoint upload of the 2026-11-14b Word spec.

## 2026-11-14: Jon's decisions

- Booking flow review requested: add breadcrumbs, and review the step after booking ("Complete registration") so a booker reaches payment as soon as places are held, with delegate details collected as fast as possible. Proposal sent to Jon; build plan item 2.10 (proposed).
- Xero month-end test: the draft invoice reached Xero but attaching the PO files was refused (401) because the app had not asked Xero for the `accounting.attachments` permission. Fixed in the code; Jon must Disconnect and Connect Xero again in Settings once the deploy is live, then Retry now.
- Admin Add booking added to the plan (2.9) and spec (ADM-12): staff may override a credit limit or a full session, but only with a warning, an override box and a reason, audited. Open point: how already-paid bookings show in Xero.
- Admin approval ceiling stays at £5,000 (Settings, Super Admin can change it).
- Late PO files are attached to the Xero draft invoice automatically on the next scheduled run. PO uploads stay PDF or image only; the checkout says "PDF preferred, photo also works".
- Wording edits: Jon and Kirsty list them in the shared Doc "Website wording changes"; Claude applies them in one batch and deploys once on request ("apply the wording changes").
- After testing: build admin-editable pages with an editable template for each page type (homepage, content pages, and so on).
- Phase 3 order: pipelines and reports first, then SCORM, then Zoom.
- Production setup (London region, real domain, web firewall, malware scanning) planned after testing.
- Test data (the two ECFIO accounts and others) is wiped before the real Xero connection and go-live.
- Go-live checklist started: `docs/go-live-checklist.md` (includes a small real refund test once the real Xero and Stripe accounts are set up).

## Reminder for the next session with Jon (13 Nov 2026)

- **Prompt Jon to get Kirsty testing:** Phase 2 checklist (rounds 1 and 2), then "Round 3 checklist for Kirsty: new items" (N1 to N12). Her first results are in; B1 and B2 need the retest on the ready-made account kirsty+po@ecfio.co.uk.
- Jon is connecting Xero (Demo Company) and still needs the Stripe clearing account code entered in Settings.
- Decided: malware scanning on uploads via GuardDuty Malware Protection for S3 for production (docs/security.md item 8); build before go-live. Open: wording edits across the site (method agreed with Jon), spec version 2026-11-13.

## 2026-11-12: P1 to P5 approved, Kirsty's first Phase 2 results

- Jon approved P1 to P5. P3 changed: default credit limit is now £1,000 (was £5,000). Admins can approve up to the default; Super Admin above. Spec is version 2026-11-12 (GitHub master, Claude Doc, Word copy in `docs/spec-versions`).
- Kirsty's results so far: A1 to A3, B3, B4, C1 to C3 pass; B1 and B2 marked Fail with no note. Both test accounts were approved with PO numbers set to "No", which explains B1 (no PO message). B2 unknown; ask Kirsty what she saw.
- Kirsty's comment: mark mandatory fields with an asterisk. Done on the credit account application form.
- Xero jobs from her tests are queued and waiting (Xero not connected).
- Not yet deployed: asterisks and the £1,000 default. Deploy after Kirsty finishes this round so her checklist (written for £5,000 and £2,500) stays valid.

## 2026-11-11 (evening): Xero sync built

- Paid card bookings go to Xero straight away: authorised invoice plus a payment into the Stripe clearing account. Refunds become credit notes.
- Credit accounts: approval creates the Xero contact from the application (structured registered and invoice addresses, accounts phone). Month end creates one DRAFT invoice per account dated the last day of the month; a payment in Xero marks the statement paid and restores credit. Statement due date now runs from month end (resolves P2 wording).
- All sends use a retrying queue (lease based, nothing sent twice, failures raise a task). Settings has the Xero panel. 66 tests pass against a simulated Xero.
- Not live: needs the secure domain (Xero requires https), the Xero app keys in Secrets Manager (`docs/xero-setup.md`), and the Stripe clearing account code from the accountant. Test on the Demo Company first.
- Fixed in passing: cancelling a session now credits on-account bookings too.

## 2026-11-11 (later): Test Log 1 fixes, batch 1

Jon signed off the Test Log 1 fixes (with notes) and answered the open questions. Built and deployed this batch: waitlist on the customer dashboard (claim, leave) and claim link and expiry for admins; booked-for-others list; draft dates no longer counted as upcoming; "+ VAT" on course cards; date-change task shows the date; empty date-change message; EC&I wording; Done tab (all history, searchable) and a "Filter on, clear all filters" banner in Tasks; Full label on dates; richer bookings export; Expired checkouts hidden from Bookings; two open checkouts per person; duration as number and unit, usual start and end times per course, and a last-day field when adding a date; placeholder text (TODO) blocks publishing; friendly error pages. Not reproduced: the first-login crash (#1); error pages added, Kirsty to re-test and capture the browser console if it recurs.

**Batch 2 (built, deployed with batch 1):** cancellation policy in Settings (tiers, late window, wording) feeding the Admin steer, checkout wording and the public Terms page; customer cancellation releases places at once and creates a Cancellation to review task; Admin decides refund, charge, part charge, waive (reason) or move to another date, for card and on-account bookings; customer sees the outcome; checkout hold 5 minutes and two open checkouts per person; Add places as a linked booking. Spec version 2026-11-11b records these. Still open: re-test by Kirsty (Test Log 1 rows plus new cancellation tests), and the Phase 2 checklist needs the new cancellation steps added.

## 2026-11-11: Phase 2 build complete (tasks 2.1 to 2.8)

**Live on the test site** http://13.63.252.95 (http only, sample data, emails not sent). 45 automated tests pass (`npm test`), typecheck and build clean.

**Built in Phase 2:** credit account application and approval; book on account (credit check, PO rule, hold when overdue); booker portal (Team, Account and billing); month-end statements and the Xero import file; Admin Accounts; in-person venues, venue-change emails and the printable class list; eLearning provider packs and completion; trainer app (sessions, attendance, availability, profile); certificates (upload task, downloads, three-month expiry reminders).

**Where things are**
- Code: GitHub JonECI371/ECI_hub, folder eci-hub-platform. Spec master: `docs/spec.md` (change process in `docs/spec-change-process.md`, dated Word copy in `docs/spec-versions/`).
- Test server: EC2 `i-0567b0e02843cb540` (eu-north-1 Stockholm), Docker, images in ECR `eci-hub`. Secrets in Secrets Manager: `eci-hub/test/microsoft`, `eci-hub/test/stripe`. Managed through SSM.
- Deploy tooling: `infra/test-server/tools/` (`up.sh` starts local Docker and Postgres, `deploy.sh` builds the ARM image locally, pushes it and restarts the server). Set `SCRATCH` to a working folder. The build needs the cached base image `eci-base:node22` and the local Postgres.
- Email: SES identity `eci-hub.co.uk` created in Stockholm, still in sandbox, waiting on DNS records. Test mode logs emails and shows sign-in codes on screen.
- Teams: works end to end from the support@ mailbox; invites on the test site only go to @ecfio.co.uk and @eci-hub.co.uk.
- Stripe: sandbox keys; server side verified; the in-browser card test is Jon's step.

**Waiting on Jon** (nothing is built until he signs off)
1. Sign off the fixes in the Test Log 1 doc (15 issues plus 7 extra suggestions) and the five pending changes in the Specification doc.
2. Add the five email DNS records for eci-hub.co.uk, then SES can be verified and moved out of sandbox.
3. Optional: free Companies House API key (until then applications are checked by hand).
4. Upload `ECI-Hub Specification 2026-11-10.docx` to SharePoint Automations (no Zapier).
5. Test one card payment on the test site.
6. Before go-live: one test import of the Xero file into a Xero demo company; solicitor review of the cancellation and credit account terms.

**Gotchas learned**
- Files marked `'use server'` may only export async functions; put constants in `src/lib`.
- Do not run two Docker builds at once; deploys take about 25 minutes. A Google Fonts download can fail once and succeed on retry.
- The local Postgres stops when the workspace restarts: run `up.sh`.
- Prisma blocks destructive resets from an AI agent; use `migrate deploy` and ask Jon before any reset.
- Never paste secrets in chat; they go to Secrets Manager. No Zapier.

**Next:** build the approved fixes from Test Log 1; write the Phase 2 test checklist for Kirsty (using the requirement IDs PUB, POR, ADM, TRN); then Phase 3 (pipelines and reports, Zoom and Xero API, SCORM, free tools, email block editor) once Phase 1 and 2 checks pass.
