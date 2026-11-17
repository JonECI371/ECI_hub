# Handover (written 17 Nov 2026)

Read this first in a new chat, then `docs/spec.md`, `docs/build-plan.md`, `docs/progress.md`, `docs/go-live-checklist.md`, `docs/security.md`. Jon (Super Admin, jon@ecfio.co.uk) is a newbie: plain English, one clear recommendation, no jargon. Kirsty (kirsty@ecfio.co.uk, Admin and Trainer) tests.

## How we work (Jon's standing rules)
- Jon signs off recommendations before changes are built. Present decisions one at a time with options (AskUserQuestion).
- Never ask for secrets in chat. Keep to the AWS spend cap. No Zapier. Ask before production or paid services.
- Report honestly: say when something was not checked on screen or on the live site.
- Tasks live in the task list (TaskList). Jon's own to-dos are prefixed "Jon:".

## Where things are
- Repo: /home/user/eci-hub-platform-src/eci-hub-platform (branch as checked out; push to origin). Scratchpad for helper scripts: /tmp/claude-0/-home-user/5147478d-0c46-5f67-b65d-56a16e8c4224/scratchpad (may be cleared; deploy.sh, up.sh, ssm-*.json live there and can be recreated from the notes below).
- Test site: https://test.eci-hub.co.uk (EC2 i-0567b0e02843cb540, Stockholm eu-north-1, Elastic IP 13.63.252.95, account 992868470990). Production is planned for London eu-west-2 after testing.
- Stack: Next.js 15, React 19, Prisma 6 + Postgres, Tailwind. Tests: `npx vitest run` (needs local Postgres eci_test; 75 tests passed on 16 Nov). `npx tsc --noEmit` must be clean.
- Local live preview: `bash up.sh` (starts Docker, Postgres, migrations) then `npm run dev -- -p 3000`; call report_preview_port 3000. Local Postgres is often down after a workspace restart; fix: start docker, `docker compose up -d db`. Never restart dockerd while a deploy is building.
- Checklists for Kirsty (Claude Docs): Phase 2 https://claude.ai/artifact/FXUn5caDU37AaxU5DFvtKH, Round 3 https://claude.ai/artifact/F4idzuCqgSax9pdqWxJuKx; Website wording changes https://claude.ai/artifact/4jyMBUerHtVKPmrMfqophR (Jon says "apply the wording changes"); CRM proposal https://claude.ai/artifact/R67jnbJCDsEZLeUJuSgpY3 and mock-up https://claude.ai/artifact/GL3enm2nTkRqRuHWRn2cms; specification doc https://claude.ai/artifact/XcpTAcoqCY9WwXcC853Akq. Read and edit Claude Docs with the Claude Docs tools, not the Artifact tool. Her results arrive as comments and dropdowns; her edits come through a Claude connector (via mcp), so they show as "Claude".

## Deploying to the test server (slow and fragile)
- `bash deploy.sh` in the scratchpad: copies tracked files, builds ARM images under qemu in this workspace, pushes to ECR, uploads run.sh and restarts via SSM, then health checks. About 25 minutes. Run in the background with a retry loop and log to deployN.log. The workspace restarts and kills builds (uptime resets); restart the deploy, and do not start a waiter that pgrep-matches itself.
- DECISION PENDING for Jon: move builds out of this workspace (AWS CodeBuild or GitHub Actions, native ARM, 5 to 8 min). Needs an AWS role Jon or the developer creates; I cannot edit IAM.
- Server env files in /opt/eci: ms.env (Teams, MS_MEETING_HOST=support@ecfio.co.uk, allow-list @ecfio.co.uk,@eci-hub.co.uk), stripe.env, xero.env, mail.env (EMAIL_MODE=graph, MS_MAIL_FROM=support@ecfio.co.uk). SSM commands use a parameters JSON file; DB is the `db` container (psql -U eci -d eci).

## State at handover
- Last deploy attempt (deploy19) was building commit 41a2f7e. CHECK that it finished (tail deploy19.log, health checks) before assuming anything below is live: test emails through Microsoft 365, fixes from Kirsty's testing (PO file warning, Log out link GET, per-course certificate tick, change one session's date and time, application audit detail, Test log at Admin > Settings > Test log, Super Admin only), date of birth as day/month/year, selfie wording, profile picture from the registration selfie (auto, kept until removed; visible to Admin, Super Admin and trainers for their sessions), customer pages and account pages content width (max-w-screen-2xl, 11/12). Dark Admin theme is live.
- After the deploy: send a test email (Mail.Send was added by Jon) and check it arrives; tell Jon; Kirsty retests email steps (F2, I1, K6 to K9, N7), PO files, J2/J3, G2.
- Kirsty's results so far: Phase 2 A to L mostly done; Round 3 N4 blocked (no application task appeared; no application since 12 Nov in the database). Not app faults after checking the database: no course has a photo (G1), kirsty+acme2 never existed (C2), "Please select" county cannot come from our text box (A1). Six-files error page (N8, "Unexpected end of form") left as is by Jon. E3 wording in the checklist is wrong (default limit is 1,000 pounds; 5,000 is the Admin ceiling), Jon said to ignore.
- Jon is considering how to be sure testing is done by a person (a visible code-word step for all testers is the open idea). He does not want covert traps; the Test log records odd input only.

## Jon's open to-dos
#20 five email DNS records; #23 card test; #37 optional Companies House key; #41/#46 upload spec Word (use 2026-11-14b) to SharePoint; #48 AWS budget (about 13 USD, alerts incl. forecast and free-tier); #49 anomaly alerts; #50 root MFA; #51 review AWS protections with the developer; #52 ask Kirsty the three sign-in questions (does it happen while using the site or after closing the browser, which address she uses, how often); #55 done (Mail.Send added). Teams recording/transcription check for the CRM.
- Sign-in length: Admin and Super Admin sessions are 12 hours, a session cookie that dies when the browser closes. Proposed (not built): make it persist the full 12 hours. Awaiting Kirsty's answers and Jon's decision.

## Next build order (approved)
1. Anything Kirsty finds on retest. 2. Admin Add booking (2.9) and booking flow with delegate details and breadcrumbs (2.10; mock-up approved). 3. Admin-editable pages with templates (3.9). 4. Phase 3: order pipelines and reports, SCORM, Zoom. 5. CRM (proposal waiting on Jon's answers to questions 4, 6 to 13, 14 to 17; Teams phone transcripts need recording switched on first, main number only, recording notice before live calls). 6. Production setup (London, WAF, GuardDuty, malware scanning, SES) after testing.

## Go-live reminders (see docs/go-live-checklist.md)
Real Stripe and Xero accounts, clear test data before connecting real Xero, small real refund test, Xero sales code per course type (200-1 to 200-5) and a Stripe clearing account (695 does not exist in ECFIO's Xero), SES replaces test email, solicitor checks (cancellation, credit terms, staff monitoring notice incl. Test log, cookie banner, recording notice, profile picture wording).
