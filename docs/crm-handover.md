# CRM handover (written 27 Nov 2026)

**How to use this file:** open the chat that will carry on with the CRM and paste everything under "Prompt to paste" into it. The rest of the file is the background that chat will read from the project.

---

## Prompt to paste

You are taking over the CRM work for the ECI-Hub platform (ECFIO Engineering Ltd). Jon, the owner, is not technical: plain English, one clear recommendation at a time, and his sign-off before anything is built. Present decisions one at a time with options.

**Read first, in this order**
1. In the repository JonECI371/ECI_hub (branch main; attach and clone it if it is not there): `docs/handover.md`, then `docs/crm-handover.md`, then `CLAUDE.md`, `docs/spec.md` (the CRM is Phase 3) and `docs/build-plan.md`.
2. The CRM proposal, a Claude Doc: https://claude.ai/artifact/R67jnbJCDsEZLeUJuSgpY3 (read it with the Claude Docs tools, not the Artifact tool). It holds the 17 questions and Jon's answers so far.
3. The clickable mock-up: https://claude.ai/artifact/GL3enm2nTkRqRuHWRn2cms (source copy: `docs/design/crm-mockup.html`).

**Where we are:** the CRM proposal and mock-up are written. Jon has answered 4 of the 17 questions (see below). Nothing is built. The CRM is Phase 3 of the build and comes after the other Phase 3 items already agreed (order pipelines and reports, SCORM, Zoom), so do not start building it until Jon says so.

**What I want you to do now:**
1. Tell me, in a short list, what you understand the CRM is meant to do, what is decided, and what is still open.
2. Ask me the unanswered questions **one at a time**, with options and your recommendation (they are in `docs/crm-handover.md`). Start with the ones that block the first build stage.
3. As I answer, record each answer in the proposal doc (the "Jon's answers" table at the end) and in `docs/progress.md`.
4. When enough is answered, update the proposal, `docs/spec.md` and `docs/build-plan.md` for my sign-off. Do not build before I sign off.

**Rules:** never ask me to paste secrets; keep to the AWS spend cap; no Zapier; ask before production or paid services; say honestly when something was not checked. Do not message customers or send real emails. Do not touch the live test site's data.

---

## What the CRM is for (Jon's words, condensed)

Replace Zoho CRM. One timeline per person and company. Specifically Jon asked for:
- Teams phone call transcripts added to records by phone number.
- An Outlook link, with follow-up prompts.
- Activity history, tasks and follow-ups.
- Deals linked to bookings and credit accounts, and enquiries linkable to future deals.
- A dashboard of where enquiries come from, with Google Analytics, Google Ads and Microsoft Clarity (he said "Dynamics"; Clarity is the right tool).
- Abandoned-checkout recovery.
- Search, tags and lists.
- Admin-only access for now, Super Admin sees everything, a Sales role later.
- Communications visible on the record unless marked private; Super Admin sees all.
- A Mailchimp-style marketing tool: who was mailed and what they clicked, an engagement score on each profile, and an interest heat map against tags.
- Kirsty's draft added a "Pipeline and automations builder" (sections 5.6 and 5.18 of her draft), now a section in the proposal.

## Recommended stages (from the proposal)

A core CRM (large) · B source tracking, cookie banner, Google Analytics, Ads, Clarity, sources dashboard, abandoned checkouts (medium) · C Outlook and Teams logging and prompts (medium) · D Teams phone test, then transcripts (small test, then medium) · E extras (small each) · F marketing email, scores and heat map (large).

## Jon's answers so far

| # | Question | Answer | Effect |
|---|---|---|---|
| 1 | Do you already record and transcribe Teams calls? Which licences? | Probably have it, not switched on. Jon to check. | Stage D waits for that |
| 2 | Which numbers first? | The main contact number | Test and first build use one line |
| 3 | Do callers hear a "recorded" message? | Not yet; yes, later | Must be in place before real recording |
| 5 | Microsoft 365 email and shared mailboxes? | Under review. Probably only shared mailboxes (support, bookings, training). To come back to | Stage C starts with shared mailboxes only |

## Questions still to ask Jon (ask one at a time)

4. Can we run the short Teams phone test on one number (the main line)?
6. Follow-up prompts: Outlook tasks, Teams messages, or both?
7. Private items: hidden from other Admins and opened by Super Admin through a logged "view private" step (recommended), or visible to Super Admin without a step? (May be reduced by the shared-mailbox-only decision.)
8. Who may read call transcripts: Super Admin only, all Admins, or the record's owner?
9. Do you have Google Analytics 4 and Google Ads accounts already, and who holds the logins?
10. Is one automatic reminder email to someone who abandons a checkout acceptable, or tasks only?
11. Add Microsoft Clarity alongside Google Analytics?
12. Can you export Zoho's current stage names and open deals so the boards match?
13. Who are the ECI employees doing sales, and what should a Sales role see later?
14. Marketing email: build on the Amazon email service we already use (recommended), or connect Mailchimp or Brevo?
15. Roughly how many contacts will be emailed, and how often?
16. Is there an existing mailing list (Zoho or Mailchimp) with a record of how people gave permission?
17. Which interest tags for the heat map? Starting list: CompEx, DSEAR, Thames Water, eLearning, Process safety, Consultancy, Functional safety, Water and utilities.

## What already exists in the code

- A `Deal` model (pipelines CONSULTANCY, COMPEX, ELEARNING, THAMES_WATER, GENERAL; stage, company, contact, email, phone, value, owner, notes, source). The contact form already creates Deals.
- People and Accounts are the contacts and companies; bookings, credit accounts, certificates (with expiry dates) and Tasks already exist; the Admin Tasks inbox is where follow-ups would appear.
- Microsoft Graph is already connected (Teams meetings from support@, test email). The app's access is locked to a mailbox group by an Exchange application access policy: any mail or calendar access for the CRM must be allowed through that policy, for shared mailboxes only.
- Amazon SES is the planned email service for production (the five DNS records, task #20, are not done).
- The registration selfie is kept as the profile picture and shows in Admin; the CRM would use it.
- A Test log (Super Admin only) records odd form input; communications monitoring will need a staff notice, and the go-live checklist already lists the solicitor review.

## Dependencies and decisions that are Jon's

- Microsoft side: Jon is checking whether Teams call recording and transcription can be switched on for the main number. Transcript access needs `CallTranscripts.Read.All` with admin consent; Microsoft labels it beta for ordinary phone calls, and some tenants return empty results. **Test before promising it.**
- A recording notice for callers must be in place before any real call is recorded.
- Solicitor: cookie banner, call recording notice, staff monitoring notice, checkout reminder wording and marketing consent wording, all in one review.
- Cost: Google Analytics, Clarity and Outlook logging are free to connect; Teams call transcription may need a paid Microsoft licence (to confirm); AI call summaries cost a small amount per call. Ask Jon before adding any paid service.

## Not to forget

- The proposal doc is edited with the Claude Docs tools. Kirsty's Claude has added to it before, so read it again before editing.
- Spec version in the repo: `docs/spec.md`; the Word copy goes to SharePoint by Jon (task #46).
- Production setup (London, WAF, SES, domain) comes before real customer data goes into a CRM. Nothing in the CRM should store real call transcripts on the test server.

## Added 27 Nov 2026

**CRM framework (Jon asked for HubSpot-style best practice to be included).** Follow HubSpot's structure, kept small: contacts (People), companies (Accounts), deals, activity timeline, pipelines with stage probabilities, owners, original and latest source. Three additions: a **lifecycle stage** on every person (Subscriber, Lead, Qualified, Opportunity, Customer, Repeat customer; a first booking makes a Customer, certificate expiry starts renewals), a **fit score** beside the engagement score, and **exit criteria** on every deal stage. Training bookings made on the website are not deals; deals are for consultancy, corporate and Thames Water work and credit applications. Left out for now: tickets, email sequences, round-robin, forecasting. All of this is now a section in the proposal doc.

**Process courses (Thames Passport, EUSR National Water Hygiene eLearning, EUSR SHEA Water virtual classroom).** Jon's answer: the CRM holds **everything from the registration**; Admin can **mark when a learner has been uploaded to SkillGuard** (who and when, with a list of those not yet uploaded); and **comments** can be added on the learner and on the booker. Photo ID copies are deleted after a month, so the CRM shows received and deleted dates, not the file. Still to ask Jon: how far ahead renewals should start and who they go to (options were 90 days to person and booker, 180 for companies, or 60 to ECI first); which courses need the SkillGuard mark; whether Thames Passport has its own ID number. Note that Person already has a `schemeIds` field (skillguard, compex, eusr).
