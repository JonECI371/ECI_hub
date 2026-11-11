# ECI-Hub Booking Platform: Build Specification

| Version | Date | Status | Owner |
| --- | --- | --- | --- |
| 2026-11-11b | 11 November 2026 | Adds the cancellation policy and review, a 5-minute checkout hold, and Add places to the 2026-11-11 version | Jon Wallis |

This file in GitHub (`docs/spec.md`) is the master. The shared Claude Doc and the Word copy in SharePoint are readable copies of it, updated each time a version is approved. Every change is listed in the Change log at the end, and the full line-by-line history is in GitHub. How to propose and approve a change: `docs/spec-change-process.md`.

Requirement IDs (for example PUB-04) are used in test logs and automated tests, so each test points at the requirement it checks.

## Purpose and scope

Build one ECI-Hub platform that replaces SimplyBook.me for bookings and Zoho CRM for pipelines and contacts: public website, booking engine, customer portal, trainer app and admin back office, hosted on AWS.

**Design source:** the ECI Hub Prototype canvas (32 screens plus Design system v2). Where this spec and the canvas differ, this spec wins.

**Success measures**

- A delegate finds a course, books and pays on a phone in under 3 minutes.
- No manual meeting invites: every virtual classroom delegate, booker and trainer gets the same Teams or Zoom invite automatically.
- One invoice per credit account per month, exported to Xero in one click.
- All admin follow-up work lives in one Tasks inbox.
- Every course page is indexable by search engines and readable by AI assistants.

**In scope:** public site and course catalogue, booking and checkout, customer portal, trainer app, admin back office, CRM pipelines and reports, and the integrations listed below.

**Out of scope:** consultancy project delivery tooling beyond the pipeline, learning content authoring, payroll and associate invoicing.

## Users and roles

One person has one account and can hold several roles; a booker can also be a delegate.

| Role | Who | Can do | Signs in with |
| --- | --- | --- | --- |
| Visitor | Anyone | Browse courses, book and pay by card, apply for a credit account, enquire, use free tools | Not signed in |
| Delegate | Person attending | See own bookings, join links, venue, registration forms and certificates; change or cancel own card bookings before the cut-off | Email code or link |
| Booker | Company staff on a credit account | Book on account or by card for others, add attendees, send reminders, see team bookings, certificates and statements | Email code or link |
| Main booker | Account owner | Everything a booker can, plus invite or remove bookers (ECI approves) and request company detail changes | Email code or link |
| Trainer | Employed or associate trainer | See assigned sessions and class lists, mark attendance, set availability, upload qualifications | Email code plus authenticator app |
| Admin | ECI-Hub team | Courses, sessions, bookings, people, accounts, Tasks, emails, pipelines and reports | Email code plus authenticator app |
| Super Admin | Directors | Everything, plus payment settings, credit limits above the default, integrations, legal documents and admin users | Email code plus authenticator app |

Every change to a booking, person, account or setting is written to an audit log: who, what, when, before and after.

## Delivery types and journeys

Every course has one delivery type, and it decides the booking journey, registration questions, emails and admin tasks. Subject (CompEx, EUSR, Thames Water, Process safety, DSEAR) only controls content, accreditation and which registration question set is used.

|  | eLearning | Virtual classroom | In person |
| --- | --- | --- | --- |
| Dates and places | No dates; book any time; places unlimited or licence-limited | Fixed sessions with a place limit | Fixed sessions with a place limit |
| Location | Provider platform now, ECI-Hub hosted SCORM later | Teams or Zoom, chosen per course | A venue per session: Summit House or a client site |
| Payment | Card or credit account | Card or credit account | Card or credit account |
| After booking | Enrolment pack goes to admin Tasks, or is emailed to the provider | Meeting created per session; same invite to delegates, booker and trainer | Joining instructions with venue address |
| Registration | Date of birth, photo and photo ID where the awarding body needs them | Scheme IDs such as SkillGuard, access needs | Scheme IDs, dietary and access needs, emergency contact |
| Registration approval | Off | Off | Optional per subject (on for CompEx) |
| After the course | Completion recorded from the platform | Trainer marks attendance; admin uploads certificate | Trainer marks attendance; admin uploads certificate |

**eLearning journey**

1. Learner or booker picks the course and pays by card or on account.
2. Outcome page shows "Complete registration now"; registration collects the awarding body's fields and files.
3. The system builds an enrolment pack and either creates an admin task (copy fields, mark enrolled) or emails it to the provider, per course setting.
4. Admin marks enrolled; the learner is emailed their access details and deadline.
5. Phase 3: the learner launches the course on ECI-Hub (SCORM) or is enrolled by provider API, with no admin step.

**Virtual classroom journey**

1. Booker picks a date, sets places and pays by card or on account.
2. Attendee details are added now or later; a reminder goes 5 days before if missing.
3. On publishing a session the system creates one Teams or Zoom meeting for it. Each confirmed attendee, the booker and the assigned trainer get that meeting's calendar invite.
4. Date change or cancellation updates or withdraws the invite automatically; capacity is enforced at checkout.
5. Reminders go the day before and an hour before. Trainer marks attendance; admin uploads certificates.

**In person journey**

1. Booker picks a date and pays by card or on account.
2. Attendees get registration and joining instructions. The venue address shows in the confirmation, or only after registration approval when the subject requires it.
3. Where approval is on, each registration lands in admin Tasks to approve or return.
4. Trainer sees the class list with dietary and access needs, and marks attendance on a phone.
5. Admin uploads certificates; delegate and booker are notified; expiry reminders are scheduled.

## Data model

Twenty entities cover the whole platform; the developer may refine fields but not merge or drop entities without agreement.

| Entity | Key fields | Notes |
| --- | --- | --- |
| Subject | name, live, places-left display, change and cancel cut-off, registration question set, approval required | CompEx, EUSR, Thames Water, Process safety, DSEAR |
| Course | title, slug, subject, delivery type, price ex VAT, VAT rate, duration, description, FAQs, photo and alt text, validity years, SEO title and description, status | Delivery type drives behaviour |
| Session | course, start and end, capacity, venue or meeting, trainer, status, meeting id and join URL | Not used for eLearning |
| Venue | name, address, postcode, directions, public or client site | Summit House is the default |
| Person | name, email, mobile, date of birth, employer, scheme IDs (SkillGuard, CompEx, EUSR), marketing opt-in | One per email address |
| Account | company, company number, VAT number, addresses, credit limit, payment terms, PO rule, status | Credit account customer |
| Account member | account, person, role (main booker or booker), status | ECI approves new bookers |
| Booking | reference, booker, course, session, places, payment method, totals, PO, status | Card or on account |
| Attendee | booking, person (nullable until named), status, attendance | One per place |
| Registration | attendee, answers, files, approval status | Files deleted one month after submission to the awarding body |
| Enrolment | attendee, provider, pack sent, enrolled date, deadline, completion | eLearning only |
| Waitlist entry | session, person, places, position, offer expiry | One-click claim link |
| Payment | booking, Stripe ids, amount, status, refunds | Card payments only |
| Statement | account, month, lines, totals, Xero invoice number, status | One per account per month |
| Certificate | person, course, issued, expires, file | Drives expiry reminders |
| Trainer profile | person, subjects, home base, qualifications with expiry and file | Expired qualification blocks assignment |
| Availability | trainer, date, from, to | Days then times |
| Task | type, subject record, status, assignee, due | Feeds the Tasks inbox |
| Deal | pipeline, stage, company, contact, value, owner, notes | Replaces Zoho CRM |
| Email template and log | template blocks, trigger, recipient, sent, opened, bounced | Block editor |

An audit log and a settings store sit alongside these.

**Status flows**

- **Booking:** card: payment pending → confirmed; on account: confirmed at once; both → completed or cancelled.
- **Attendee:** details missing → invited → registered → approved (where required) → attended or no-show → certified.
- **Session:** draft → published → full → running → completed, or cancelled.
- **Account:** applied → approved with limit → active → on hold (invoice 14+ days overdue) → closed.

## Screens and acceptance criteria

Each screen is built from the canvas artboard of the same name using Design system v2 components; a screen is done when its criteria pass on desktop and on a 390 px phone.

| ID | Area | Screen (artboard) | Done when |
| --- | --- | --- | --- |
| PUB-01 | Public | Home (Main) | Two calls to action (Book a course, Open a credit account); next dates pulled live; course search returns results as you type |
| PUB-02 | Public | Courses (Courses) | Filter by delivery type and subject; Courses, Dates and Calendar views; filters kept in the URL; eLearning shown in Courses view only |
| PUB-03 | Public | Course page (Course) | Dates near the top; booking panel stays on screen; full dates offer the waitlist; structured data present |
| PUB-04 | Public | Book (Checkout) | Places stepper; attendee details now or later; card, Apple Pay, Google Pay; signed-in bookers pay on account with optional PO; no password or email verification step; places held 5 minutes with a countdown, and no more than two open checkouts per person |
| PUB-05 | Public | Outcome (Outcome) | One template for confirmed by card, confirmed on account, eLearning, waitlist and payment failed; "Complete registration now" shown when needed |
| PUB-06 | Public | Registration (Registration) | Questions from the subject's set; known answers prefilled; file uploads for photo and ID; saves on submit; approval routed to Tasks where on |
| PUB-07 | Public | Log in (Login) | Email code or magic link; 30-day trusted device; staff and trainers also need an authenticator code |
| PUB-08 | Public | Waitlist claim (WaitlistClaim) | Opens from the email link with no code; pay and confirm in one step; expired state offers other dates |
| PUB-09 | Public | Contact (Enquiry) | One form; topic changes the extra fields; creates a Deal in the right pipeline |
| PUB-10 | Public | Credit account application (CorporateRequest) | Company, booker, other bookers, billing, credit requested, terms; creates an approval task with a Companies House check |
| PUB-11 | Public | Free tools (Hook) | Admin-editable template for a quiz, tool or gated guide; captures name, email and opt-in into the CRM |
| PUB-12 | Public | Legal, System pages | Versioned legal documents; 404, maintenance, no access and expired link states |
| POR-01 | Portal | Dashboard (Dashboard) | Delegate view: action banner, upcoming by delivery type with Join, Directions or Continue, certificates. Booker view: credit tiles, needs attention, upcoming, team expiries |
| POR-02 | Portal | Booking detail (BookingDetail) | Attendees and their registration status; add or swap attendees; add places (a linked booking for the same date); change date within the cut-off; cancel any time before the start under the cancellation policy, with the refund or charge shown; documents |
| POR-03 | Portal | Settings (AccountProfile) | My details, Account and billing (limit, statements, company details), Bookers (invite, remove) |
| ADM-01 | Admin | Home (AdminHome) | Next 14 days, counts that link into Tasks, upcoming sessions |
| ADM-02 | Admin | Tasks (AdminTasks) | Filter by type, with a visible filter banner and clear-all; each task done in place (copy fields, approve, upload, export, decide a cancellation); done tasks move to a searchable Done tab |
| ADM-03 | Admin | Bookings, Accounts (AdminList) | Search, filter, bulk email, CSV export, pagination |
| ADM-04 | Admin | Person record (AdminPerson) | Tabs for details, bookings, certificates, documents, emails, audit history |
| ADM-05 | Admin | Course record (AdminCourse) | Sessions, attendees with status, waitlist, workflow, edit and cancel |
| ADM-06 | Admin | Course form (AdminCourseForm) | Delivery type switches the form; Teams or Zoom options; venue and address release; eLearning fulfilment; approval toggle; SEO panel; publish rules |
| ADM-07 | Admin | Calendar (AdminSchedule) | Month, week and day; trainer filter; conflicts flagged; create a session from a slot |
| ADM-08 | Admin | Pipelines (AdminPipeline) | Drag deals between stages; owner and value; one board per pipeline |
| ADM-09 | Admin | Reports (AdminReport) | Bookings and revenue, attendance, expiries, waitlists; date and subject filters; CSV |
| ADM-10 | Admin | Settings (AdminSettings) | Integrations, subjects, credit account defaults, cancellation policy, emails, legal documents, admin users |
| ADM-11 | Admin | Email template (EmailTemplate) | Block editor: heading, text, booking summary, code, button, footer; preview per trigger |
| TRN-01 | Trainer | Sessions, Attendance, Availability, Profile | Phone first; today's session at the top; attendance saved in one tap per delegate; days then times; qualification expiry warnings |

## Payments and credit accounts

There are two ways to pay: card at checkout, or on account for approved companies billed once a month. There is no per-booking invoice route.

**Card (Stripe)**

- Stripe Payment Element with card, Apple Pay and Google Pay; 3D Secure handled by Stripe.
- Places are held for 5 minutes from the start of checkout, with a countdown; the hold is released on timeout or failure. Each person can have two open checkouts at a time, so places cannot be held without paying.
- VAT shown per line and in total; receipts emailed by the platform.
- Refunds raised from the booking record by an Admin; partial refunds supported.
- **Cancellations:** a customer can cancel any time before the start. The places are released at once and an Admin gets a Cancellation to review task. The Admin decides: refund in full, charge in full, part charge, waive the charge for extenuating circumstances (with a reason), or move the booking to another date. The task shows a steer from the cancellation policy, for example a late cancellation inside 24 hours suggests charging in full. This applies to card and on-account bookings (a charge stays on the statement; a refund removes or credits the line).
- **Cancellation policy:** one editable place in Settings (tiers of days before the start and the share charged, a late-cancellation window, and opening wording). It drives the Admin steer, the checkout wording and the Cancellations section of the public Terms page, so they cannot disagree. Defaults: 28 or more days before, full refund; 7 to 27 days, 50% charged; under 7 days, no refund; within 24 hours, no refund unless extenuating circumstances.

**Credit accounts**

1. Company applies (CorporateRequest). The application creates an approval task with an automatic Companies House lookup.
2. Admin approves and sets the credit limit, payment terms and PO rule. Limits above the default need a Super Admin.
3. Main booker and listed bookers get sign-in links; new bookers invited later need ECI approval.
4. Each on-account booking is confirmed at once if it fits within available credit, and adds a line to that month's statement.
5. At month end, every account's lines close into a statement. With Xero connected, one DRAFT invoice per account (dated the last day of the month, one line per booking, cancellations as negative lines) is created in Xero for Admin to review and approve; without it, Admin downloads the Xero import CSV from Tasks.
6. When the invoice is paid in Xero the statement is marked paid automatically (or manually). Available credit is restored when the statement is marked paid.
7. An invoice 14 or more days overdue puts the account on hold: new on-account bookings are blocked, card still works.

**Rules**

- Available credit = limit minus open statement lines minus unpaid statements.
- The booker is warned when available credit drops below the threshold set in Settings.
- Cancellations within the cut-off remove the line from the open statement, or add a credit line if already invoiced.
- The Xero CSV columns must match Xero's sales invoice import template; confirm against a test import before launch.

## Integrations

Each integration is connected once in Admin Settings and then used automatically; a failed call creates a Task instead of failing silently.

| Integration | Purpose | Phase | Build notes |
| --- | --- | --- | --- |
| Microsoft Teams (Microsoft Graph) | One meeting per virtual session; calendar invite to attendees, booker and trainer; update or cancel on change | 1 | App registration in ECI-Hub's Microsoft 365 tenant; host mailbox set per course; store meeting id and join URL on the session |
| Stripe | Card, Apple Pay, Google Pay, refunds | 1 | Payment Element plus webhooks for success, failure and refund |
| Email sending (AWS SES) | All system emails from bookings@eci-hub.co.uk | 1 | SPF, DKIM and DMARC on the domain; bounce and complaint handling feeds the Tasks inbox |
| Companies House API | Check company number on account applications | 2 | Show status and incorporation date on the approval task |
| Xero | Card payments, refunds, monthly statements, credit account contacts | 2 (CSV and API) | Card booking: invoice plus payment into the Stripe clearing account; refund: credit note; account approval: Xero contact with every application field; month end: one draft invoice per account; paid status read back. Built against a simulated Xero; real connection needs the secure domain, tested on the Xero demo company first |
| Zoom | Same as Teams for courses set to Zoom | 3 | Server-to-server OAuth app; meeting registrants per attendee |
| Learning platforms | Enrol eLearning learners without admin copying | 3 | SCORM player hosted on ECI-Hub, or provider APIs (EUSR QuartzWeb, Trainor) where available |
| Analytics | Traffic and booking funnel | 1 | Privacy-friendly analytics behind the cookie banner |

Any interim SimplyBook workaround, such as a Power Automate flow for Teams links, stays in place until Phase 1 replaces it.

## Notifications and emails

Every email is a template built in the block editor, sent on a trigger, and logged against the person with delivered, opened and bounced status.

| Trigger | Delegate | Booker | Trainer | Admin |
| --- | --- | --- | --- | --- |
| Booking confirmed | Confirmation, receipt if card | Confirmation, receipt or statement note |  |  |
| Attendee added | Joining details, registration link |  |  |  |
| Session invite (virtual) | Calendar invite with join link | Calendar invite | Calendar invite |  |
| Registration missing (5 days before) | Reminder | Reminder listing who is missing |  |  |
| Registration submitted (approval on) |  |  |  | Task |
| Day before and hour before | Reminder with link or venue |  | Class list with needs |  |
| Date changed or cancelled | Updated invite or cancellation | Same | Same |  |
| Waitlist place free | One-click claim link, 24 hours |  |  |  |
| Attendance marked |  |  |  | Task to upload certificates |
| Certificate uploaded | Certificate available | Team certificate available |  |  |
| Expiry in 3 months | Renewal reminder with dates | Renewal reminder |  |  |
| eLearning enrolled | Access details and deadline |  |  |  |
| Statement issued |  | Statement summary (invoice from Xero) |  |  |
| Account application or new booker |  |  |  | Task |
| Email bounced |  |  |  | Task |
| Sign-in code | Code and magic link, 15 minutes | Same | Same | Same |

**Template rules**

- Blocks: heading, text, booking summary, code, button, footer.
- Variables are inserted as chips (name, course, date, link) and previewed with sample data.
- Service emails cannot be switched off; marketing emails honour the opt-in and carry an unsubscribe link.

## SEO and AI visibility

Every course gets one permanent, server-rendered page with structured data generated from the course record, so publishing a date needs no SEO work from admins.

**Build requirements**

- One URL per course, such as `/courses/compex-exf-foundation`; dates are listed on that page, never as pages of their own.
- Pages are server-rendered or statically generated; course name, description, dates and prices are in the HTML on first load.
- Core Web Vitals pass on mobile: LCP under 2.5 s, CLS under 0.1, INP under 200 ms. Images served as responsive AVIF or WebP.
- XML sitemap regenerated on every publish, unpublish or date change.
- A past date drops off the page; the page stays. A withdrawn course 301-redirects to its subject page.
- Canonical URLs, Open Graph and social image per course; filter states on Courses are not indexed.

**Structured data (JSON-LD, automatic)**

- `Course` with provider (ECI-Hub, ECFIO Engineering Ltd), accreditation, description and offers.
- `CourseInstance` per session: courseMode (online, onsite or blended), startDate, endDate, location or online URL, price, availability.
- `Event` per dated session, for event listings.
- `Organization` and `LocalBusiness` for Summit House; `FAQPage` where FAQs exist; `BreadcrumbList` on every page.

**AI assistants**

- robots.txt allows GPTBot, ClaudeBot, PerplexityBot and Google-Extended.
- An `llms.txt` file at the site root summarising courses, delivery types, locations and how to book, regenerated from the catalogue.
- Course copy answers real questions directly: who needs it, what it covers, duration, price, prerequisites, validity.
- Trainer names and credentials, accreditation bodies and genuine reviews shown on course pages.

**Admin "Search and sharing" panel on the course form**

- URL slug, search title (60 characters) and description (155 characters), prefilled from the course and editable.
- Social image, defaulting to the course photo.
- A live preview of the Google result.

Google stopped showing its "Course info" rich result in 2025; the markup is still required because search engines and AI tools use it to understand the offer ([source](https://searchengineland.com/google-to-drop-support-for-several-rich-result-types-to-simplify-the-search-results-page-456969)).

## Platform, security and quality

The recommended stack is TypeScript end to end on AWS in the UK region (eu-west-2, London); the developer may propose alternatives in their quote with reasons.

| Layer | Recommendation |
| --- | --- |
| Web app | Next.js (server rendering for SEO), React, Design system v2 as a shared component library |
| API and jobs | Next.js server routes or a Node service; a queue (SQS) for emails, meeting creation and exports |
| Database | PostgreSQL on Amazon RDS, daily snapshots kept 30 days, point-in-time recovery |
| Files | S3 with encryption; registration ID files in a separate bucket with a one-month lifecycle rule |
| Hosting | AWS (ECS Fargate or Amplify), CloudFront CDN, separate dev, staging and production |
| Email | Amazon SES |
| Monitoring | CloudWatch alarms, error tracking, uptime checks on checkout and sign-in |

**Security and sign-in**

- Passwordless sign-in by 6-digit email code or magic link, 15-minute expiry, 5 attempts. Staff and trainers add TOTP (authenticator app).
- Admin and Super Admin sessions last 12 hours and never use a trusted device; delegates, bookers and trainers can stay signed in for 30 days on a trusted device. Anyone can sign out of all devices, and sessions are revoked when roles change or an authenticator is reset.
- Role-based access checked on the server for every request; customers only ever see their own or their account's records.
- No card data stored; Stripe handles it. All traffic over HTTPS; secrets in AWS Secrets Manager.
- Rate limits on sign-in, checkout and forms; bot protection on public forms.

**Data protection (UK GDPR)**

- Photo ID and passport photos deleted automatically one month after submission to the awarding body.
- Data requests (copy or deletion) logged and actioned from the person record.
- Privacy notice, cookie banner with consent before non-essential cookies, and retention periods in Settings.

**Accessibility**

- WCAG 2.2 AA: visible focus, keyboard operable, labelled fields, 4.5:1 text contrast, 44 px touch targets, error messages tied to fields.

**Quality**

- Automated tests on booking, payment, credit limit, invite creation and statement export.
- Built to OWASP ASVS Level 2, with a strict Content Security Policy and security headers. An independent penetration test by a CREST-accredited tester on staging, with every high and critical finding fixed and re-tested, is required before go-live. The control mapping for ISO 27001 is kept in `docs/security.md`.
- Staging mirrors production with Stripe test mode and a test Microsoft 365 mailbox.
- Source code, infrastructure and data owned by ECFIO Engineering Ltd, in ECI-Hub's own GitHub and AWS accounts.

## Phasing and deliverables

Build in three phases, starting with the Thames Water bookings that cause the most manual work today; each phase is quoted and signed off separately.

Phase 1: Replace SimplyBook (courses, course page, checkout, outcome, registration, sign-in, dashboard, admin core, Tasks, virtual classroom with Teams, Stripe, email, SEO, analytics). Gate: a Thames Water cohort runs with no manual invites.

Phase 2: Accounts and CompEx (credit accounts and statements, Xero CSV, Companies House, in person with venues and approvals, eLearning enrolment packs, trainer phone screens). Gate: first statement in Xero and a CompEx session delivered.

Phase 3: Replace Zoho and automate (pipelines and reports, Zoom, SCORM and provider APIs, free tools templates, email block editor). Gate: Zoho switched off with pipelines live here.

Phase 1 goes live only when a real Thames Water cohort is booked and run with every invite sent automatically.

**Every phase delivers**

- Working software on staging, then production, in ECI-Hub's own AWS and GitHub accounts
- Automated tests for that phase's journeys, passing
- A short admin guide and handover notes
- Updated canvas or spec where anything changed during the build

## Migration, testing and launch

Run the new platform beside SimplyBook for one or two Thames Water cohorts, then switch over; Zoho stays until Phase 3 pipelines are live.

**Data to migrate**

- From SimplyBook: future bookings, clients and delegates, services (as courses and sessions).
- From Zoho CRM: companies, contacts, open deals with stage and owner.
- From records and Xero: certificates with expiry dates, credit account customers and limits.
- One import script per source, re-runnable, with a reconciliation report (counts in, counts out, rejects).

**Testing**

1. Developer tests on staging against the acceptance criteria in this spec.
2. User acceptance testing by ECI-Hub staff with real scenarios: book by card, book on account, add attendees later, change date, cancel, waitlist claim, eLearning enrolment, approve a registration, mark attendance, upload a certificate, month-end export.
3. A pilot: one real virtual classroom session booked and run end to end on the new platform.
4. Fix list closed before switch-over; nothing marked critical left open.

**Launch**

- Freeze new SimplyBook bookings, run a final migration, point booking links and the domain at the new site.
- 301 redirects from every old eci-hub.co.uk URL to its new page.
- Two weeks of daily checks on Tasks, failed emails and failed meeting creation after go-live.

## Open decisions and assumptions

These need an answer before the developer quotes; each assumption stands unless changed.

**Decisions**

- [x] Course prices for every course shown as a placeholder on the canvas
- [ ] Developer and commercial model: fixed price per phase, or time and materials with a cap
- [ ] Statement date: last working day of the month, or the 1st
- [ ] Default credit limit and payment terms (canvas shows £5,000 and 30 days)
- [ ] Which Microsoft 365 mailbox hosts Teams meetings
- [ ] Card cancellation policy wording, and the credit account terms, reviewed by a solicitor
- [ ] Photography: shoot date and locations
- [ ] Remove the Ex11 and Ex05 to Ex06 sample rows, or keep them as future courses

**Assumptions**

- The venue address shows in the booking confirmation unless the subject requires registration approval first.
- CompEx Ex01 to Ex04 is not offered and does not appear anywhere.
- VAT at 20% on all courses.
- eLearning in Phase 1 to 2 runs on provider platforms (EUSR QuartzWeb, Trainor); ECI-Hub hosting comes in Phase 3.
- UK English, GBP, UK time throughout.

## Change log

Newest first. Each change is approved by Jon before it is built. "Tests" lists the requirement and test log IDs to re-test.

| Version | Date | Change | Reason | Approved by | Tests |
| --- | --- | --- | --- | --- | --- |
| 2026-11-11b | 11 Nov 2026 | Cancellation policy in Settings and Admin cancellation review (refund, charge, part charge, waive, move); checkout hold 15 to 5 minutes with two open checkouts per person; Add places as a linked booking; Tasks filter banner and Done tab; courses have a duration with number and unit and usual times. | Test Log 1 sign-off and Jon's answers | Jon Wallis | PUB-04, POR-02, ADM-02, ADM-10, ADM-05 |
| 2026-11-11 | 11 Nov 2026 | Security standard: built to OWASP ASVS Level 2 with a penetration test before go-live. Admin and Super Admin sessions limited to 12 hours with no trusted device. | ISO 27001 readiness and penetration testing | Jon Wallis | PUB-07, ADM-04 (sign-in and sessions) |
| 2026-11-10 | 10 Nov 2026 | Baseline. Added version table, requirement IDs on the acceptance criteria and this change log. No requirement changed. | Version control and test traceability | Jon Wallis | None |
