# Hand-off for the CRM chat (written 25 Nov 2026)

Paste this whole file into a new chat to start the CRM build. This chat is for the CRM only. The rest of the platform (booking, courses, consultancy pages, SimplyBook move, redirects, testing) is handled in other chats, so do not work on those here.

## 1. Who you are working with and how

- **Jon Wallis** (jon@ecfio.co.uk) owns ECFIO Engineering Ltd, trading as ECI-Hub. Super Admin. Not technical. **Kirsty** (kirsty@ecfio.co.uk) is an Admin and Trainer, and does the human testing.
- Plain English, one clear recommendation at a time. Jon signs off before anything is built. Use yes/no options and work through questions one by one.
- Never ask Jon to paste secrets or customer data into chat. Keep to the AWS spend cap. No Zapier. Ask before anything on production or any paid service.
- Report honestly. Say when something was not checked on screen.
- **Testing rule (Jon, 25 Nov 2026):** Claude and automated browsers must NOT be used to test the test site or the live site. Website tracking is switched on, so automated visits count as real visitors and report false issues. Claude's browser checks (`npm run e2e`) run only against a private local copy.
- Copy: UK English, plain and direct. Never use em dashes. GBP, UK time. Never put names, emails or other personal details in requests to outside services.

## 2. Read first

In the repo (GitHub JonECI371/ECI_hub, private, currently branch `services-admin`; check what is merged to `main` first):
1. `CLAUDE.md` (project rules, stack, "Ask Jon before you", "Done means").
2. `docs/handover.md`, `docs/spec.md` (source of truth), `docs/build-plan.md`, `docs/progress.md`, `docs/go-live-checklist.md`, `docs/security.md`, `docs/design-system.md`.
3. Approved designs for the CRM screens: `docs/design/AdminPipeline.dc.html`, `AdminReport.dc.html`, `Enquiry.dc.html`, `Hook.dc.html`, `AdminPerson.dc.html`, `AdminTasks.dc.html`, `AdminSettings.dc.html`. Ignore prototype-only parts ("Prototype states" bars, `data-props`, `{{...}}`, `<sc-if>`/`<sc-for>`); copy layout, wording and states.
4. Claude Docs (read with the Docs tools, never web fetch): **CRM proposal** https://claude.ai/artifact/R67jnbJCDsEZLeUJuSgpY3 (full proposal with questions and Jon's answers) and the clickable mock-up https://claude.ai/artifact/GL3enm2nTkRqRuHWRn2cms (CRM Preview).

## 3. Stack and commands

Next.js 15 App Router, React 19, TypeScript strict, Tailwind 3, Prisma 6 + Postgres (money in integer pence, times in UTC and shown in Europe/London), vitest, Playwright e2e. AWS (London for production, Stockholm for the test site): Fargate, RDS, S3, SES, Secrets Manager. Integrations: Stripe, Microsoft Graph (Teams, calendar, mail), SES, Xero.

- Local Postgres: after a workspace restart start it with `pg_ctlcluster 16 main start` (or `docker compose up -d`). Tests need database `eci_test`.
- `npm run dev`, `npm run typecheck`, `npm run build` (both must pass), `npx vitest run`, `npm run db:migrate -- --name <change>`, `npm run e2e` (against a built local copy only).
- Rules that matter for the CRM (see CLAUDE.md): server components and server actions by default; check permissions on the server for every request; every change to a booking, person, account or setting writes an `AuditLog` row; external calls go through `src/lib/integrations/*`, retry safely, and create a `Task` of type `INTEGRATION_FAILURE` when they fail; use `src/components/ui.tsx`; WCAG 2.2 AA, 44 px targets, every screen works at 390 px; write tests for what you build.
- Never run a migration that drops or renames a column or table with data in it without asking Jon. All migrations so far are additive.

## 4. The spec for the CRM (what to build)

From `docs/spec.md` and `docs/build-plan.md`:
- **Phase 3.1 Contact form and pipelines** (Enquiry, AdminPipeline, Deal model). ADM-08: "Drag deals between stages; owner and value; one board per pipeline."
- **Phase 3.2 Reports** (AdminReport, CSV). ADM-09: "Bookings and revenue, attendance, expiries, waitlists; date and subject filters; CSV."
- **3.3 Email block editor** (EmailTemplate) and **3.4 Free tools template** (PUB-11 Hook: admin-editable template for a quiz, tool or gated guide; captures name, email and opt-in into the CRM) are related Phase 3 items and feed the CRM.
- **3.8 Data migration from Zoho** (second half): companies, contacts, open deals with stage and owner; one re-runnable import script with a reconciliation report. The SimplyBook half is handled in another chat.
- Phase 3 gate: Zoho switched off with pipelines live here. Order agreed with Jon on 14 Nov 2026: pipelines and reports first, then SCORM, then Zoom.
- The spec wins over the designs if they disagree. Any spec change goes through `docs/spec-change-process.md` and is dated in the spec change log.

## 5. What exists today (verified in the code on 25 Nov 2026)

**The Deal model** (`prisma/schema.prisma`, `model Deal`): `id, pipeline (String: CONSULTANCY | COMPEX | ELEARNING | THAMES_WATER | GENERAL), stage (String), company (String), contact (String), email, phone?, valuePence?, ownerId?, notes?, source? (ENQUIRY | HOOK | MANUAL), createdAt, updatedAt`. It is deliberately basic: company and contact are plain strings, not links to `Account` or `Person`, there is no activity history, no tags, no lost reason, and `ownerId` is not a relation.

**Where Deals come from today**: only the public contact form, `src/app/(site)/contact/actions.ts` (`sendEnquiry`). It validates, rate-limits to 3 enquiries an hour per email, creates a Deal (pipeline from topic: team and onsite go to COMPEX, consult to CONSULTANCY, other to GENERAL; stage "Enquiry"; the form answers go into `notes`), writes an `ENQUIRY_RECEIVED` audit row, emails the enquirer and `ENQUIRY_INBOX` (default support@eci-hub.co.uk). Consultancy pages link to `/contact?topic=consult&service=<slug>`.

**There is NO pipeline board, no Deal admin screen, no reports screen, no Zoho import, and no CRM timeline yet.** `ELEARNING` and `THAMES_WATER` pipelines exist only as names.

**Records the CRM should link to** (all already built and in use):
- `Person` (email, names, mobile, employer, job title, `roles`, `marketingOptIn`, `xeroContactId`), `Account` (company, number, credit limit and status, members, bookings, statements, purchase orders), `Booking`, `Attendee`, `Certificate` (person, course, `issuedAt`, `expiresAt`: drives expiry reminders and would drive the "renewal deal" idea), `Payment`, `Statement`, `Task` (typed inbox: `type`, `status`, `recordType`, `recordId`, `assigneeId`, `dueAt`), `AuditLog`, `EmailTemplate`/`EmailLog`, `Setting`, `Service` (consultancy pages).
- Admin shell at `src/app/(app)/admin/` (people, accounts, bookings, courses, schedule, tasks, services, settings, venues, xero, billing, files, test-log). Roles: Super Admin, Admin, Trainer, Booker, Delegate. Staff sign in with an authenticator app only. Permissions are checked server-side.
- Integrations in `src/lib/integrations/`: email (Microsoft Graph in test, SES planned), Teams, Stripe, Xero. Test site sends email through Microsoft 365 as support@ecfio.co.uk, only to `@ecfio.co.uk` and `@eci-hub.co.uk` addresses.
- Tasks inbox pattern (`src/app/(app)/admin/tasks`) is the model for follow-up tasks and the "needs attention" lists.

**Test site**: https://test.eci-hub.co.uk (EC2 i-0567b0e02843cb540, Stockholm eu-north-1, account 992868470990), reachable from Claude only through AWS SSM. Deploys use the overlay method in `docs/progress.md` (native `npm run build`, one extra image layer, tag `app`, then `/opt/eci/run.sh`; NEVER pass `seed`, never put personal details in commands; keep ECR rollback tags and a DB backup before each deploy). Ask Jon before deploying; production is out of bounds without his say.

## 6. The CRM proposal, as agreed so far

Full text in the Claude Doc (section 2 link). Summary of the recommended design:
- **Stage A, core CRM (Large):** one board per pipeline (Consultancy, CompEx, eLearning, Thames Water, General); suggested stages New, Contacted, Quoted, Negotiating, Won, Lost (reason required on Won and Lost), copy Zoho's real stage names when Jon exports them; contacts and companies are the existing People and Accounts (not a second list); one timeline per person and company (enquiry, call, email, meeting, note, task, booking, credit account); links both ways between deal, booking and credit account; duplicate detection and merge; company match from email domain and Companies House; search across everything; tags; saved lists with CSV export (marketing opt-in always respected); follow-up tasks.
- **Pipeline and automations builder:** Admins create and edit pipelines, stages (Automated or Manual, default probability, won or lost) and automations (trigger, action, timing, on/off, default assignee) without a developer. Source: Kirsty's draft, sections 5.6 and 5.18.
- **Stage B (Medium):** source tracking on every enquiry, booking and credit application (UTM tags, Google Ads click ID, referrer, first page), cookie consent banner, Google Analytics 4, Google Ads, Microsoft Clarity, sources dashboard (enquiries and deals by source, funnel, revenue and win rate, cost per enquiry), abandoned-checkout list with reasons, follow-up tasks and one reminder email.
- **Stage C (Medium):** Outlook email logging and sending, follow-up prompts in Outlook and Teams, meetings from a deal. Starts with shared mailboxes only (support, bookings, training), per Jon.
- **Stage D (small test, then medium):** Teams phone calls and transcripts on the right record by phone number. Microsoft's call-transcript interface is beta for ordinary calls, so test one line first; fallback is automatic call logging with a note prompt.
- **Stage E (extras):** renewal deals 90 days before certificate expiry, call summaries, Xero quotes from a deal, hot-lead signals, response-time reminders, win and loss reasons and forecast, data protection export and erase, quick-log from a phone.
- **Stage F (Large):** marketing email (campaigns, delivery and click tracking, engagement score, interest heat map, preference page and suppression), built on SES. Depends on A and B, the email block editor and the five email DNS records.
- **Access:** Admins and Super Admins only for now; the design leaves room for a later Sales role (CRM only, no finance or settings). Super Admin sees everything; private items and call transcripts are opened through a logged step; every view is audited.

**Jon's answers so far (15 Nov 2026):**
1. Teams call recording and transcription probably owned but not switched on. To check. Stage D waits for it.
2. Start with the main contact number.
3. Callers will hear a recording notice, later. Must be in place before any recording is switched on for real calls.
5. Email logging: probably only the shared mailboxes (support, bookings, training); to be revisited.

**Still open (get Jon's answers one at a time, with yes/no options): 4, 6 to 13, 14 to 17.**
- 4. Which phone numbers matter first (main line, direct lines, mobiles)? (Partly answered by 2.)
- 6. Follow-up prompts: Outlook tasks, Teams messages, or both?
- 7. Private items: hidden from other Admins and opened by Super Admin through a logged step (recommended), or visible without a step?
- 8. Who may read call transcripts: Super Admin only, all Admins, or the record's owner?
- 9. Do you have Google Analytics 4 and Google Ads accounts, and who holds the logins?
- 10. One automatic reminder email to someone who abandons a checkout, or tasks only?
- 11. Add Microsoft Clarity alongside Google Analytics?
- 12. Can Jon export Zoho's current stage names and open deals so boards match?
- 13. Who are the ECI employees doing sales, and what should a Sales role see later?
- 14. Build marketing email on SES (recommended) or connect Mailchimp or Brevo?
- 15. Roughly how many contacts, and how often?
- 16. Is there an existing mailing list with a record of permission?
- 17. Which interest tags for the heat map? Starting list: CompEx, DSEAR, Thames Water, eLearning, Process safety, Consultancy, Functional safety, Water and utilities.

## 7. Dependencies and things only Jon can do

- Zoho exports (stages, open deals, companies, contacts). Real customer data: Jon saves files and tells you where; he must never paste them into chat; do not commit them to git.
- Teams call recording and transcription switched on, and Microsoft 365 admin consent for any new Graph permission (CallTranscripts.Read.All, mail and calendar read permissions for Stage C). Jon can grant consent in Entra; Claude cannot.
- Google Analytics, Google Ads, Clarity accounts and logins (Stage B). Do not ask for passwords; use the sharing or API-key routes the services provide, saved via the environment's credential tools if available.
- The five SES DNS records, real Stripe and Xero accounts, and solicitor review of: cookie banner, abandoned-checkout reminder wording, staff monitoring notice, call recording notice, marketing consent wording. These are tracked in `docs/go-live-checklist.md`.
- Spend: any paid AWS service or paid licence (for example Teams Premium) needs Jon's yes first.

## 8. Suggested first steps for this chat

1. Read the files in section 2, then report back to Jon in plain English: what the CRM is meant to do, what exists today (section 5), what the first build would be, and which of his open questions block it.
2. Recommend a **Stage A first slice** that needs no new accounts and no Microsoft consent: make Deals real (link to Person and Account, owner as a relation, lost reason, activity notes), build the pipeline board (ADM-08, with drag between stages, owner and value), a Deal screen with a timeline, follow-up tasks into the existing Tasks inbox, and search. Migrations must be additive.
3. Ask Jon the open questions that block it, one at a time (12 first: Zoho stage names).
4. Get his sign-off before building. Then build one task at a time, with tests, `npm run typecheck` and `npm run build` passing, the screen matching its design at desktop and 390 px, and `docs/build-plan.md` ticked.
5. After each batch, update `docs/progress.md`, push to a branch (never commit secrets), and ask Jon before deploying to the test site. Kirsty tests by hand; write her a short checklist like `docs/kirsty-retest.md` and a Claude Doc in the Round 3 and Round 4 format.

## 9. What is going on in other chats (do not duplicate)

- SimplyBook booking move (3.8 first half), 301 redirects from the old website (built and held on branch `services-admin`, deliberately not deployed yet), Kirsty's testing rounds, AWS and go-live set-up, course and consultancy pages, subject colour coding (preview only), CSCS card extra on SHEA Water (held).
- Merge conflicts: those chats also touch `docs/progress.md` and `prisma/schema.prisma`. Work on your own branch, keep migrations separate and additive, and expect to rebase.
