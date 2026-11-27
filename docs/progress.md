# Progress notes

One note per build stage, newest first. Written at the end of each stage so a new session (or a new person) can pick up without re-reading the whole history. Step-by-step history is in the git log.

## When a note is written

- At the end of every build stage (a phase task group such as 2.1 to 2.8).
- After a decision from Jon that changes scope, wording or settings (also recorded in the spec Change log).
- After an environment change: a new key or secret stored, DNS or Microsoft 365 changes, a new AWS resource.
- Before anything risky: a migration that touches existing data, or a production deploy.
- When a test log comes back, with what was signed off and what was not.

## 2026-11-28: Per-course delegate field settings built, not deployed

- Approved by Jon 27 Nov (matrix in docs/delegate-fields.md). `Course.delegateFields` (JSON, null = template for subject and delivery), `Person.address`; migration 20261128090000 (additive). Admin course form has a Delegate details section (Required / Optional / Not asked, hold the certificate, templates) and Admin > Courses > Delegate fields shows a read-only grid.
- The registration form, `questionSet`, the booker's Delegate details page (now any course without photo or ID uploads and not eLearning, with approval tasks and venue release handled), the certificate check and the weekly chase (`sendMissingDetailsChases`) all read the settings. CompEx ID and ULN are one field (stored under schemeIds.compex). Photo and photo ID courses (EUSR) and eLearning keep the registration form.
- Tests: new test/delegate-fields.test.ts; typecheck and build clean. Not checked on screen or on the test site. The templates match the matrix, so Thames Water, CompEx and EUSR behaviour changes as the matrix says (telephone optional for Thames Water, required for CompEx; emergency contact removed; accessibility only for in-person CompEx; ULN required for in-person CompEx).

## 2026-11-27: Delegate details page built (Thames Water), not deployed

- Approved by Jon 27 Nov (spec PUB-13). Built on the booking outcome page, Thames Water only (registration set `thames-water`; other courses keep the registration form because they need photo and ID). Breadcrumbs Course > Book > Delegate details. One row per delegate: first name, last name, email, date of birth required; telephone and SkillGuard number optional; Fill in now or Email them a link (name and email only); one authority tick; progress bar; optional "PO or reference for invoicing" per delegate (new column `Attendee.invoiceRef`, migration 20261127120000, additive), shown in the statement line description as `Refs: name ref` for references that differ from the booking PO; the invoice stays one line per booking.
- SkillGuard rule: `issueCertificate` refuses Thames Water attendees with no SkillGuard number ("SkillGuard number needed"); `sendSkillguardChases` (job) emails the delegate and the booker the day after the course and then weekly. Telephone and employer are now optional on the Thames Water registration form.
- 90 tests pass (7 new in test/delegate-details.test.ts), typecheck and build clean. Not checked on screen or on the test site. Not yet done: SkillGuard-missing marker on the Admin class list and delegate dashboard, mention in the 5-day pre-course reminder, breadcrumbs on other pages, and the Admin Add booking flow does not use the new page.
- Local test database: Postgres from /usr/lib/postgresql/16 with `DATABASE_URL=postgresql://eci:eci@localhost:5432/eci_test` (the earlier container had no Docker daemon running by default).

## 2026-11-27: Admin back to the light look

- Jon switched the dark Admin theme off (Admin only) and kept the coloured strip (Test site green, Live site orange) so it is still obvious when you are in Admin. The dark theme is not deleted: set ADMIN_DARK to true in `src/app/(app)/admin/layout.tsx` to bring it back. Checked locally on Admin home, Bookings, Tasks and Add booking; not yet deployed.

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
