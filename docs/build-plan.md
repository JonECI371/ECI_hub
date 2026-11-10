# Build plan

One task per Claude Code session. Paste the prompt, let it plan, approve the plan, let it build, then check the result yourself before the next task. Tick the box when done.

Already in the starter: database schema, sample data, design tokens, Courses page, course page with structured data, sitemap, robots.txt, llms.txt, health check, Docker image and AWS infrastructure.

## Phase 0: Get it running

- [ ] **0.1 Local run.** "Read CLAUDE.md. Start Postgres with docker compose, create the first migration from prisma/schema.prisma, seed the database and run the app. Tell me the URL and fix anything that stops it starting."
- [ ] **0.2 First deploy to staging.** "Read README.md section 'Deploy to AWS'. Check my AWS credentials work for eu-west-2, bootstrap CDK if needed, and deploy EciHub-staging. Do not touch production. Give me the app URL when it's healthy."
- [ ] **0.3 Domain and HTTPS.** "Help me put staging on staging.eci-hub.co.uk: request an ACM certificate, tell me the DNS records to add, then add the certificate ARN to infra/cdk.json and redeploy staging."

## Phase 1: Replace SimplyBook (gate: a Thames Water cohort runs with no manual invites)

- [x] **1.1 Sign-in.** "Build passwordless sign-in to docs/spec.md: email code or magic link, 15-minute expiry, 5 attempts, 30-day trusted device, TOTP for TRAINER and ADMIN roles. Match docs/design/Login.dc.html. Send email through SES in src/lib/integrations/email.ts (log to console in dev)."
- [x] **1.2 Layout and home.** "Rebuild the header, footer and home page to match docs/design/Main.dc.html using the components in src/components/ui.tsx. Next dates must come from the database."
- [x] **1.3 Courses views.** "Extend /courses to match docs/design/Courses.dc.html: add the Dates and Calendar views, keep filters in the URL, eLearning only in the Courses view."
- [x] **1.4 Course page.** "Finish /courses/[slug] to match docs/design/Course.dc.html: places left from attendee counts, FAQs with FAQPage JSON-LD, breadcrumbs, waitlist for full sessions."
- [x] **1.5 Checkout (card).** "Build /book/[sessionId] and /book/course/[slug] to match docs/design/Checkout.dc.html, card state only: places stepper, attendees now or later, 15-minute place hold, Stripe Payment Element in test mode, webhook to confirm the booking. Create the Person account silently from the booker's details."
- [x] **1.6 Outcome.** "Build the outcome page to match docs/design/Outcome.dc.html: confirmed by card, eLearning, waitlist and payment failed states, with 'Complete registration now' when needed."
- [x] **1.7 Registration.** "Build the registration form to match docs/design/Registration.dc.html: questions from the subject's registrationSet, prefilled answers, uploads to the ID docs bucket, approval task when the subject requires it."
- [x] **1.8 Teams meetings.** "Build src/lib/integrations/teams.ts with Microsoft Graph (client credentials): create one online meeting per virtual session when it is published, store joinUrl, send a calendar invite to every confirmed attendee, the booker and the trainer, update on date change and cancel on cancellation. Failures create an INTEGRATION_FAILURE task. Use my test mailbox only."
- [x] **1.9 Emails.** "Build the email templates and triggers listed in docs/spec.md 'Notifications and emails' that Phase 1 needs, using the layout in docs/design/EmailTemplate.dc.html. Coded templates for now; the block editor comes in Phase 3."
- [x] **1.10 Delegate dashboard and booking detail.** "Build the delegate view of docs/design/Dashboard.dc.html and docs/design/BookingDetail.dc.html: upcoming bookings by delivery type, Join on Teams, change date and cancel within the cut-off, certificates."
- [x] **1.11 Admin core.** "Build the admin shell and these screens to match their designs: AdminHome, AdminList (bookings), AdminCourse, AdminCourseForm (including the Search and sharing panel), AdminSchedule. ADMIN role only."
- [x] **1.12 Tasks inbox.** "Build docs/design/AdminTasks.dc.html on the Task model: filter by type, each task actioned in place, done tasks leave the list."
- [x] **1.13 Waitlist.** "Build the waitlist: join from a full session, offer by one-click signed link valid 24 hours, claim and pay, expiry passes the place on. Match docs/design/WaitlistClaim.dc.html."
- [ ] **1.14 Phase 1 check.** "Run every Phase 1 acceptance criterion in docs/spec.md against staging and give me a pass or fail list with fixes for the fails."

## Phase 2: Accounts and CompEx (gate: first statement in Xero and a CompEx session delivered)

- [x] **2.1 Credit account application.** "Build docs/design/CorporateRequest.dc.html and the approval task with a Companies House lookup."
- [x] **2.2 Book on account.** "Add the credit account state of docs/design/Checkout.dc.html: available credit check, PO number, statement line, account on hold rules."
- [x] **2.3 Booker portal.** "Build the booker view of docs/design/Dashboard.dc.html and docs/design/AccountProfile.dc.html: credit tiles, needs attention, team expiries, statements, invite and remove bookers."
- [x] **2.4 Month-end statements.** "Close statements on the statement date and produce one Xero sales invoice import CSV from the Tasks inbox. Check the columns against Xero's import template."
- [x] **2.5 In person.** "Venues, venue address release rules, dietary and access needs on the class list."
- [ ] **2.6 eLearning enrolment packs.** "Enrolment task with copy fields and Mark enrolled, or email to the provider, per course setting."
- [ ] **2.7 Trainer app.** "Build the four trainer screens (TrainerSessions, TrainerAttendance, TrainerAvailability, TrainerProfile), phone first. Attendance creates the certificate upload task."
- [ ] **2.8 Certificates and expiry reminders.**

## Phase 3: Replace Zoho and automate (gate: Zoho switched off)

- [ ] **3.1 Contact form and pipelines** (Enquiry, AdminPipeline, Deal model)
- [ ] **3.2 Reports** (AdminReport, CSV)
- [ ] **3.3 Email block editor** (EmailTemplate)
- [ ] **3.4 Free tools template** (Hook)
- [ ] **3.5 Zoom**
- [ ] **3.6 Xero API**
- [ ] **3.7 SCORM hosting and provider APIs**
- [ ] **3.8 Data migration from SimplyBook and Zoho**, re-runnable with a reconciliation report
