# ECI-Hub platform: setup guide

This repository is the starting point for building the ECI-Hub platform with Claude Code. Claude Code reads `CLAUDE.md` automatically and works through `docs/build-plan.md`.

## 1. Install once on your Mac

| Tool | Why | Install |
| --- | --- | --- |
| Node.js 22 | Runs the app and Claude Code | https://nodejs.org (LTS) |
| Docker Desktop | Local database, and building the image for AWS | https://www.docker.com/products/docker-desktop |
| AWS CLI v2 | Lets CDK deploy to your account | https://aws.amazon.com/cli |
| Git and a GitHub account | Version control; keep the repo private, owned by ECFIO | `xcode-select --install` |
| Claude Code | Does the building | `npm install -g @anthropic-ai/claude-code` |

## 2. Put the code in GitHub

```
cd eci-hub-platform
git init && git add . && git commit -m "Starter"
gh repo create ecfio/eci-hub-platform --private --source=. --push
```

## 3. Start Claude Code

```
cd eci-hub-platform
claude
```

Then paste task 0.1 from `docs/build-plan.md`. Work one task per session, in order.

## Run locally (what task 0.1 does)

```
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

Open http://localhost:3000/courses.

## Deploy to AWS (what task 0.2 does)

1. In the AWS console, create an IAM user or SSO profile with AdministratorAccess for setup. Run `aws configure` (or `aws configure sso`), region `eu-west-2`.
2. Check: `aws sts get-caller-identity`.
3. Deploy staging (Docker Desktop must be running; CDK builds the ARM image locally and pushes it to AWS):

```
cd infra
npm install
npx cdk bootstrap
npx cdk deploy EciHub-staging
```

4. The output `AppUrl` is the staging site. The app runs database migrations on start.
5. In Secrets Manager, open `eci-hub/staging/app` and fill in the Stripe test keys and Microsoft Graph app details when you reach those tasks. Redeploy or restart the service after changing secrets.
6. Seed staging once, from your Mac, through a temporary connection Claude Code can set up for you, or add the sample courses in the admin once it exists.

**What it creates:** a VPC with no NAT gateway (lower cost), Postgres 16 on RDS (t4g.micro for staging), two private encrypted S3 buckets (the ID docs bucket deletes files after 30 days), the app on Fargate behind a load balancer, and an app secret. Expect roughly the cost of a small RDS instance, one Fargate task and a load balancer for staging; check AWS Cost Explorer after the first week.

**Production** is the same stack with bigger sizes, two tasks, 30-day backups and deletion protection: `npx cdk deploy EciHub-production`. Only after Phase 1 passes on staging.

## Email (SES)

SES starts in sandbox mode: it only sends to verified addresses. Verify the `eci-hub.co.uk` domain in SES (add the DKIM records it gives you), then request production access in the SES console before go-live.

## Where things are

| Path | What |
| --- | --- |
| `CLAUDE.md` | Rules Claude Code follows |
| `docs/spec.md` | Build specification (source of truth) |
| `docs/build-plan.md` | Tasks and prompts, in order |
| `docs/design/` | The approved screen designs, one file per screen |
| `docs/design-system.md` | Tokens and component rules |
| `prisma/` | Database schema and sample data |
| `src/` | The Next.js app |
| `infra/` | AWS infrastructure (CDK) |
