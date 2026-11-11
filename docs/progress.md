# Progress notes

One note per build stage, newest first. Written at the end of each stage so a new session (or a new person) can pick up without re-reading the whole history. Step-by-step history is in the git log.

## When a note is written

- At the end of every build stage (a phase task group such as 2.1 to 2.8).
- After a decision from Jon that changes scope, wording or settings (also recorded in the spec Change log).
- After an environment change: a new key or secret stored, DNS or Microsoft 365 changes, a new AWS resource.
- Before anything risky: a migration that touches existing data, or a production deploy.
- When a test log comes back, with what was signed off and what was not.

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
