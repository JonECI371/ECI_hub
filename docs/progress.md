# Progress notes

One note per build stage, newest first. Written at the end of each stage so a new session (or a new person) can pick up without re-reading the whole history. Step-by-step history is in the git log.

## When a note is written

- At the end of every build stage (a phase task group such as 2.1 to 2.8).
- After a decision from Jon that changes scope, wording or settings (also recorded in the spec Change log).
- After an environment change: a new key or secret stored, DNS or Microsoft 365 changes, a new AWS resource.
- Before anything risky: a migration that touches existing data, or a production deploy.
- When a test log comes back, with what was signed off and what was not.

## Reminder for the next session with Jon (13 Nov 2026)

- **Prompt Jon to get Kirsty testing:** Phase 2 checklist (rounds 1 and 2), then "Round 3 checklist for Kirsty: new items" (N1 to N12). Her first results are in; B1 and B2 need the retest on the ready-made account kirsty+po@ecfio.co.uk.
- Jon is connecting Xero (Demo Company) and still needs the Stripe clearing account code entered in Settings.
- Open: malware scanning on uploads (decision), wording edits across the site (method agreed with Jon), spec version 2026-11-13.

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
