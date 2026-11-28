# Hand-off for the next main build chat (written 26 Nov 2026)

Paste this whole file into a new chat to carry on with the main ECI-Hub build. It replaces the older `docs/handover.md` as the place to start (that file is still useful for background, and its "Testing rule" and "Sequencing rule" sections are current). The CRM is built in a separate chat: see `docs/handoff-crm.md`. Do not duplicate CRM work here.

## 1. Who and how

- **Jon Wallis** owns ECFIO Engineering Ltd, trading as ECI-Hub. Super Admin. Not technical. **Kirsty** is an Admin and Trainer and tests by hand. **Dean** will read the team summary (Claude Doc "ECI-Hub build summary", https://claude.ai/artifact/HHnNEvbjzq7CjkTypsUgqf); his role has not been stated, so do not assign him tasks.
- Plain English, one clear recommendation at a time. Jon signs off before anything is built. Use yes/no options and work through questions one by one.
- Never ask Jon to paste secrets or customer data into chat. Keep to the AWS spend cap. No Zapier. Ask before production, before any paid service, and before deleting records or files.
- Report honestly. Say when something was not checked on screen.
- Copy: UK English, plain, no em dashes. GBP, UK time.
- Never put names, emails or other personal details in commands or requests to outside services. (Lapse on record: `scripts/restart-test-server.sh` still has an email address in an old command. Do not copy it into new commands.)
- **Testing rule (Jon, 25 Nov 2026):** Claude and automated browsers must NOT be used to test the test site (https://test.eci-hub.co.uk) or the live site. Tracking is switched on, so automated visits count as real ones. Testing there is by people, by hand. `npm run e2e` runs only against a private local copy. Fetching a page during a deploy to confirm it is up is acceptable (plain requests; no tracking script runs), but ask Jon if unsure.
- **Sequencing rule (Jon, 26 Nov 2026):** finish the tool and have it independently penetration tested BEFORE any data is moved in from SimplyBook or Zoho. Until then no real customer data goes into the new platform and no importer is run on real exports. The old-website redirects stay undeployed until the final switch-over. Jon commissions the pen test (paid: ask first).

## 2. Read first

In the repo `JonECI371/ECI_hub` (private). Current work is on branch `services-admin` (19 commits ahead of `main`, pushed; nothing is merged to `main` yet, so ask Jon before merging). Clone it in a new chat with the repo-attach tool, branch `services-admin`.
1. `CLAUDE.md`, `docs/spec.md` (the source of truth), `docs/build-plan.md`, `docs/progress.md` (newest entries at the bottom: 25 and 26 Nov), `docs/go-live-checklist.md`, `docs/security.md`, `docs/design-system.md`.
2. Approved designs: `docs/design/<Screen>.dc.html` for each screen. Ignore prototype-only parts.
3. `docs/kirsty-retest.md` (Kirsty's list in the repo) and the Claude Docs listed in section 6.

## 3. State of the build

**Spec phases:** Phase 1 (replace SimplyBook) and Phase 2 (accounts and CompEx) are built and on the test site. Booking flow review 2.10 is built (breadcrumb bar everywhere, Delegate details page with the booker optional, simpler checkout) but `docs/build-plan.md` has not been ticked for 2.10 and 1.14 (the Phase 1 acceptance run) has never been done as one pass. Phase 3 has started only with Xero (done) and the CRM (separate chat).

**Built in the last stretch (all on the test site unless noted):**
- Staff sign-in by authenticator app only (Admin, Super Admin, Trainer), 15-minute lockout after 5 wrong codes, setup link by Super Admin only. Customers keep email code or link.
- Email through Microsoft 365 on the test site (Mail.Send granted by Jon).
- 118 browser checks (`npm run e2e`, run against a built local copy).
- Course page template: key facts, who it is for, FAQs, JSON-LD, per-course Markdown for AI, format tabs (`Course.formatGroup`), Duplicate course, POA when price is 0, provider name hidden, `issuesCertificate`. Real wording and prices from the old website entered for 11 courses. Ex14 and ExF eLearning added.
- Tasks filter by e-learning provider.
- Consultancy: public `/consultancy` and `/consultancy/[slug]` with a process-style "Our approach", Admin > Services (create, edit, duplicate, publish rules), `/llms/consultancy/[slug]`, sitemap and llms.txt. Five services entered from the old website: DSEAR Risk Assessment and HAC (published demo) and four DRAFTS (Battery Room Assessment, DSEAR Gap Analysis, DSEAR Verification, I.S. Circuit Design). Jon or Kirsty check and publish them in Admin > Services.
- Public pages capped at 1,280 px on large screens.

**Built but NOT deployed (on `services-admin`):**
- `src/lib/old-site-redirects.json` + `next.config.mjs` `redirects()`: 48 old eci-hub.co.uk addresses to their new pages (308, two hops when the old address has a trailing slash), test `test/old-site-redirects.test.ts`, target list `prisma/redirect-targets.json`. Held on Jon's instruction until the final switch-over. Where a course is not on the new site yet (CAT & Genny, Functional Safety Foundation, Process Safety Leadership, PSMF, PSMO, Ageing Asset Risk, Site Safety, Bespoke training) the redirect goes to the nearest list; repoint when the course is added (update the JSON and `prisma/redirect-targets.json`).

**Previewed only (not built):** subject colour coding. Preview artifact https://claude.ai/artifact/2hUTn85kaUQ5er3iq4X5CD. Agreed so far: left-edge stripe (same width for every subject, 6 px), subject name always beside it, colour never alone; Thames Water blue `#1E78C8`, CompEx golden yellow `#F2B705`, Process safety teal `#0F8A94`, DSEAR a yellow and black diagonal hazard stripe (7 px bars, same width edge as the others), services use the colour of their closest subject, delivery chips unchanged; dark mode uses lighter tints. Open for Jon: EUSR navy (`#002868`, taken from their logo, my recommendation) or another option, and whether CompEx should move away from yellow if it looks too close to the DSEAR stripe. Needs a `Subject` colour field (additive migration) and an Admin picker limited to the palette. Show Jon screenshots before deploying.

**Held for a later build:** optional extras on courses: CSCS card at 30 pounds plus VAT per card on SHEA Water, shown as a coloured "+ CSCS card" label on the QuartzWeb upload action, which also needs a QuartzWeb upload action generalised for SHEA (design in `docs/progress.md`).

**Remaining spec items (not CRM):**
- **3.7 SCORM hosting and provider connections** (next in Jon's agreed order: SCORM, then Zoom). Needs answers from Jon first: which providers have an API (QuartzWeb, others), whether to host SCORM ourselves, which providers should be enrolled automatically.
- **3.5 Zoom**, **3.9 Admin-editable pages with a template per page type**, **3.3 Email block editor** (also feeds CRM marketing email), **3.4 Free tools template** (Hook).
- **3.8 Data migration** (SimplyBook half here; Zoho half in the CRM chat): after the pen test only. Importers may be written and tried on made-up files. A SimplyBook connector appeared in the available tools late on 26 Nov; do not use it to read real data before the pen test, and ask Jon first.
- Course page extras from the spec: trainer names and credentials, genuine reviews, photography, Core Web Vitals on mobile, course-withdrawn redirect to subject page.
- Go-live items in `docs/go-live-checklist.md`: real Stripe and Xero, email DNS records (five), SES out of sandbox, WAF, malware scanning of uploads, backups and restore tested, production in London, solicitor reviews, pen test, test-data clear-out, CodeBuild (task #57, `docs/build-in-aws.md`, not done), AWS developer review (#51), delete the test budget when its alert arrives.

**Open points for Jon (not coding):** confirm ExA eLearning "28 days to finish" (unchanged); check and publish the four draft services; subject colour decisions; the unused extra cloud environment "ECI_hub" can be deleted by him.

## 4. Environment and commands

- Repo working copy in this chat was `/home/user/eci_hub`. Stack: Next.js 15 App Router, React 19, TypeScript strict, Tailwind 3, Prisma 6 + Postgres, vitest, Playwright. Money in integer pence; times UTC, shown Europe/London.
- Local Postgres is often down in a new workspace: `pg_ctlcluster 16 main start`. Tests need DB `eci_test`. `npx vitest run` (about 100 tests), `npm run typecheck`, `npm run build` (both must pass before saying done).
- Playwright is global in the Claude Code environment (do not install). `npm run e2e` against a built copy: `npm run build`, then `npm start` with `DATABASE_URL`, `AUTH_SECRET`, `SITE_URL` set (local database only).
- Rules from `CLAUDE.md` that bite: server components and actions by default; check permissions on the server; every change to a booking, person, account or setting writes an `AuditLog` row; external calls go through `src/lib/integrations/*` and create an `INTEGRATION_FAILURE` task on failure; use `src/components/ui.tsx`; WCAG 2.2 AA; works at 390 px; write tests for booking, payment, credit limit, invite and statement export. Never run a migration that drops or renames a column or table with data without asking Jon (all so far are additive).
- The outside website eci-hub.co.uk is reachable from the session (added to the Default environment's allowed hosts). The test site itself is not reachable from the session; use AWS SSM.

## 5. Deploying to the test site (the working method)

Ask Jon before each deploy. Test site: https://test.eci-hub.co.uk, EC2 `i-0567b0e02843cb540` in Stockholm (eu-north-1), AWS account 992868470990. AWS access is injected by the session's proxy (no keys to ask for); boto3 may need `pip install boto3`.

1. `npm run build` (native, about 2 minutes). No Docker or ARM emulation.
2. Take a database backup on the server first (over SSM), for example `docker exec db pg_dump -U eci eci | gzip > /opt/eci/backups/before-deploy-N.sql.gz`. The database container is `db` (user `eci`, database `eci`). Never `docker save` to a file on the server: its `/tmp` is a small memory disk.
3. `python3 scripts/test-deploy/deploy_overlay.py app-before-deploy-N` (new in the repo: copied from the working scratchpad version). It builds one image layer of the changed files (standalone output without `.env`, `.uploads`, `node_modules/@img`, plus `.next/static`, `public`, `prisma`, `entrypoint.sh`), tags the live image as the rollback tag you give, and pushes manifest = base image `app-previous` (31 layers; manifest and config JSON are in `scripts/test-deploy/`) plus the overlay as tag `app` in ECR repo `eci-hub`. The last rollback tag used was `app-before-deploy-5`, so the next is `app-before-deploy-6`.
4. Restart through SSM with `scripts/test-deploy/ssm_run.py` (function `run(commands, comment, timeout)`): run `/opt/eci/run.sh <ecr-registry> https://test.eci-hub.co.uk` on the server, **NEVER passing `seed`** (seed reset prices and wording once) and never putting personal details in the command. Then check `/`, `/courses`, `/login`, `/api/health` return 200.
5. Rollback: put the manifest of a rollback tag (`app-previous`, `app-before-2026-11-24b`, `app-before-deploy-3` to `-5`) back on tag `app` and rerun `run.sh`. Database backups are in `/opt/eci/backups` on the server.
6. Server data fixes are done with SQL over SSM using psql variables from base64'd files, with an `AuditLog` row. Do not put secrets or personal details in commands.
7. The server holds its own settings in `/opt/eci/*.env` (Teams, Stripe, Xero, mail). Do not print them.
8. `docs/progress.md` has the full account, including the migrations applied (`staff_totp_lockout`, `registration_entered_by`, `course_format_group`, `consultancy_service`), the pitfalls found, and each deploy's rollback tag.

## 6. Where things are (Claude Docs and other artifacts)

Read and edit Docs with the Docs tools (never a web fetch of the link).
- **ECI-Hub build summary** (for Jon, Dean, Kirsty): https://claude.ai/artifact/HHnNEvbjzq7CjkTypsUgqf
- **Round 4 checklist for Kirsty** (newest, interactive Result dropdowns; R13 old-address check is Blocked until redirects are live): https://claude.ai/artifact/MWu83miNnuW7SUY57WdA5T. Earlier: Round 3 https://claude.ai/artifact/F4idzuCqgSax9pdqWxJuKx and Phase 2 https://claude.ai/artifact/FXUn5caDU37AaxU5DFvtKH (the "do NOT use Claude or any automated browser" note is at the top of all three).
- Website wording changes: https://claude.ai/artifact/4jyMBUerHtVKPmrMfqophR (Jon says "apply the wording changes").
- CRM proposal https://claude.ai/artifact/R67jnbJCDsEZLeUJuSgpY3 and mock-up https://claude.ai/artifact/GL3enm2nTkRqRuHWRn2cms (CRM chat).
- Previews: running order https://claude.ai/artifact/4CE5E5ihW3hvMAxVdsTMxE, consultancy page https://claude.ai/artifact/GScFrS4JgSPaHrsDo7y7xw, Admin Services https://claude.ai/artifact/4GGnaywiGEB2Hu2PHXqXA4, subject colours https://claude.ai/artifact/2hUTn85kaUQ5er3iq4X5CD.
- Specification doc: https://claude.ai/artifact/XcpTAcoqCY9WwXcC853Akq (older; `docs/spec.md` in the repo is the source of truth).

## 7. Suggested first steps for the new chat

1. Read the files in section 2. Report to Jon in plain English: what is built, what is live on the test site, what is waiting on him, and your recommended first step. Change and deploy nothing until he agrees.
2. Check the test site is healthy (ask Jon whether he wants you to; the session cannot reach it directly, so use SSM) and that the four draft services are still drafts.
3. Recommended order for Jon's sign-off: (a) subject colour coding (preview approved except for the EUSR and CompEx points); (b) tick 2.10 and plan a Phase 1 acceptance run (1.14) that people do by hand; (c) ask Jon the 3.7 questions one at a time, then build SCORM and provider connections; then Zoom (3.5), admin-editable pages (3.9), email block editor (3.3), free tools (3.4).
4. Keep `docs/progress.md` updated after each batch and push to a branch. Write Kirsty a short checklist for each batch (same format as Round 4) and remind her not to use automated browsers.
5. Near the end of the build, give Jon a plain-English brief and a rough cost for the penetration test, and ask before he commissions it.

## 8. Do not duplicate other chats

- CRM (pipelines, deals, reports, Zoho import, marketing email, Outlook and Teams links): the CRM chat, see `docs/handoff-crm.md`.
- Both chats touch `docs/progress.md` and `prisma/schema.prisma`. Work on your own branch, keep migrations separate and additive, and expect to rebase.
