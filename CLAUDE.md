# ECI-Hub platform

Booking website, customer portal, trainer app, admin back office and CRM for ECI-Hub (ECFIO Engineering Ltd). Replaces SimplyBook.me and Zoho CRM. Hosted on AWS, London region (eu-west-2).

## Read before building anything

1. `docs/spec.md`: the build specification. It is the source of truth. If the spec and a design disagree, the spec wins.
2. `docs/build-plan.md`: the phases and the task order. Work on one task at a time, in order.
3. `docs/design-system.md`: tokens, components and rules.
4. `docs/design/<Screen>.dc.html`: the approved design for each screen. Open the matching file before you build or change a screen. Ignore anything in them that only drives the prototype ("Prototype states" bars, `data-props`, `{{...}}` placeholders, `<sc-if>`/`<sc-for>` tags); copy the layout, content, wording and states.

## Stack

- Next.js 15 App Router, React 19, TypeScript (strict), Tailwind CSS 3 with the tokens in `tailwind.config.ts`.
- PostgreSQL via Prisma (`prisma/schema.prisma`). Money is stored as integer pence. Times stored in UTC, shown in Europe/London.
- AWS: Fargate behind a load balancer, RDS Postgres, S3, SES, Secrets Manager. Infrastructure as code in `infra/` (AWS CDK).
- Integrations: Stripe (Payment Element), Microsoft Graph (Teams meetings and calendar invites), SES email. Zoom, Xero API and SCORM are Phase 3.

## Commands

- `docker compose up -d`: local Postgres
- `npm run dev`: app on http://localhost:3000
- `npm run db:migrate -- --name <change>`: create and apply a migration after a schema change
- `npm run db:seed`: sample courses and sessions
- `npm run typecheck` and `npm run build`: must both pass before you say a task is done
- `cd infra && npx cdk diff EciHub-staging`: preview infrastructure changes

## Rules

- Server components and server actions by default. Client components only for interaction (steppers, filters, drag and drop).
- Every page that lists or shows courses is server-rendered and has correct metadata. Course pages keep their JSON-LD (`src/lib/seo.ts`).
- Check permissions on the server for every request. Customers only see their own records or their account's records.
- Every change to a booking, person, account or setting writes an `AuditLog` row.
- External calls (Stripe, Graph, SES) go through `src/lib/integrations/*`, retry safely, and create a `Task` of type `INTEGRATION_FAILURE` when they fail. Never fail silently.
- Use the components in `src/components/ui.tsx`. Add new shared components there rather than styling inline.
- Accessibility: WCAG 2.2 AA. Real `<button>`, `<a>`, `<label>`; visible focus; 44 px touch targets; every screen works at 390 px wide.
- Copy: UK English, plain and direct. Never use em dashes. GBP, UK time.
- Never commit secrets. Local values in `.env`; AWS values in Secrets Manager (`eci-hub/<stage>/app`).
- Write tests for booking, payment, credit limit, invite creation and statement export as you build them.

## Ask Jon before you

- deploy to production, or change anything in the production stack
- run a migration that drops or renames a column or table with data in it
- send real emails, create real Teams meetings or take live payments (use test mode and a test mailbox)
- add a paid AWS service or a new third-party dependency with a licence cost
- delete records or files

## Done means

The task's acceptance criteria in `docs/spec.md` pass, typecheck and build pass, the screen matches its design at desktop and 390 px, and `docs/build-plan.md` is ticked.
