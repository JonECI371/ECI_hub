# Security and ISO 27001 readiness

Version 2026-11-11. Owner: Jon Wallis. Build standard: OWASP Top 10 and OWASP ASVS Level 2.

**Position in plain words.** The platform is built to the controls a penetration tester checks, and this file lists what is in place and what is still open. No document can promise a pass. A pass comes from an independent test of the live configuration, and ISO 27001 certifies how ECFIO manages security across the organisation, not only the software. The platform supplies evidence for that.

## In place now (checked by automated tests or in a browser)

| Area | Control | Where |
| --- | --- | --- |
| Authentication | Passwordless sign-in, 6-digit code or one-click link, 15-minute expiry, 5 attempts, 5 live codes per person; authenticator app (TOTP) for staff and trainers; unknown emails get the same response | `src/lib/auth.ts`, `login/actions.ts` |
| Sessions | Signed, httpOnly, SameSite cookies, Secure on HTTPS; 12 hours, or 30 days on a trusted device; **sign out of all devices**; sessions revoked automatically when roles change or an authenticator is reset | `src/lib/auth.ts` |
| Authorisation | Server-side role checks on every admin, trainer and account action; customers only see their own or their company account's records; trainer sees only assigned sessions | `requireAdmin`, `requirePerson`, `managesBooking`, `trainerSession` |
| Input handling | Parameterised database access only (no string-built SQL); form validation with Zod; only same-site paths accepted after sign-in | Prisma, `safeNext` |
| Uploads | Type checked by file **content** (not the browser's claim), 10MB cap, random names, stored outside the web root, ID documents deleted after 30 days in production | `sniffType`, `storeFile` |
| Browser protections | Content Security Policy with a per-request nonce, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS; signed-in pages never cached | `src/middleware.ts` |
| Payments | No card data stored; Stripe handles it; webhook signature verified | `api/stripe/webhook` |
| Audit | Every change to a booking, person, account, setting, file view or download is written to an audit log (who, what, when, before and after) | `AuditLog` |
| Secrets | In AWS Secrets Manager; none in the repository (checked); `.env` ignored | `infra/` |
| Dependencies | `npm audit` run; critical issue fixed (see open items for the rest) | `package-lock.json` |
| Testing | 49 automated tests cover booking, payment, credit, access and these controls | `test/` |

## Open items, in priority order

| # | Item | Why it matters | Owner |
| --- | --- | --- | --- |
| 1 | **HTTPS on a real domain.** The test site is http only. Production and staging need TLS (CloudFront or load balancer with an ACM certificate), then HSTS preload | A tester will fail any page served over http | Claude, with Jon for DNS |
| 2 | **Edge protection (AWS WAF):** rate limits per IP on sign-in and forms, bot control, managed rule sets | Per-person limits exist; per-IP limits need the edge | Claude |
| 3 | **Dependency upgrades:** Prisma 7, Next 16, Zod 4 clear the remaining 5 high audit findings (build tools and form parsing; limited reach today because of size limits) | Scanners flag them | Claude |
| 4 | **CI security checks:** GitHub Dependabot, CodeQL and secret scanning on every change | Evidence for A.8.8 and A.8.28 | Claude |
| 5 | **Logging and alerts:** central log retention, CloudWatch alarms for failed sign-ins, errors and failed integrations; append-only audit log database role | A.8.15 and A.8.16 | Claude |
| 6 | **Staff sessions:** consider 12 hours with no 30-day trusted device for Admin and Super Admin | Shorter exposure if a laptop is stolen | **Jon to decide** |
| 7 | **Authenticator hardening:** one-time use of each code, backup codes | Stops replay | Claude |
| 8 | **Malware scanning of uploads** (for example S3 malware protection) | Uploaded files are opened by staff | Claude |
| 9 | **Backups and restore test**, KMS encryption at rest, S3 block public access, IAM least privilege, MFA on AWS and Microsoft admin accounts | A.8.13, A.8.24 | Jon and Claude |
| 10 | **Secret rotation calendar** (Microsoft client secret has an expiry date, Stripe keys) | Expired secrets break bookings; old ones are a risk | Jon |
| 11 | **Independent penetration test** by a CREST-accredited tester against staging once 1 to 5 are done, then a re-test of fixes | The actual pass | Jon to commission |

## ISO 27001:2022 Annex A, what the platform supports

| Control | Supported by | Status |
| --- | --- | --- |
| 5.15 Access control, 5.18 Access rights, 8.2 Privileged access, 8.3 Information access restriction | Roles, server-side checks, Super Admin only for roles, credit limits and settings; admin user list; revocation on role change | In place |
| 5.16 Identity management, 5.17 Authentication information, 8.5 Secure authentication | Passwordless codes, authenticator for staff, lockout | In place; item 7 improves it |
| 5.23 Cloud services | AWS, Stripe, Microsoft 365, SES in ECFIO-owned accounts | Supplier reviews needed (organisational) |
| 5.34 Privacy and protection of PII | Privacy notice, ID deletion after 30 days, data requests from the person record | In place; retention periods in Settings to confirm |
| 8.7 Protection against malware | Upload type checks | Partly; item 8 |
| 8.8 Technical vulnerability management | `npm audit`, planned CI scanning, pen test | Partly; items 3, 4, 11 |
| 8.9 Configuration management | Infrastructure as code (CDK), dated deploy scripts in the repository | In place |
| 8.10 Information deletion | ID file lifecycle rule | In place in production design |
| 8.13 Information backup | RDS snapshots and point-in-time recovery | Planned; item 9 |
| 8.15 Logging, 8.16 Monitoring | Audit log in the database; alerting planned | Partly; item 5 |
| 8.20 to 8.22 Network security | WAF, TLS, security groups | Planned; items 1, 2 |
| 8.24 Use of cryptography | TLS, S3 encryption, signed tokens, hashed codes | Partly; items 1, 9 |
| 8.25 to 8.29 Secure development and security testing | Specification, requirement IDs, automated tests, test logs, pen test | In place; items 4, 11 |
| 8.31 Separation of environments | Test server, staging and production separate | In place (test), planned (staging, production) |
| 8.32 Change management | Dated spec versions, change log, sign-off before build, Git history | In place |
| 8.33 Test information | Sample data only on the test site | In place |

## What ISO 27001 needs from ECFIO beyond the software

An information security management system covering the scope you choose (ECI-Hub only, or the whole company); a risk assessment and treatment plan; a Statement of Applicability; policies and procedures; supplier management for AWS, Stripe and Microsoft; an incident response process; staff awareness; an internal audit and a management review; then a stage 1 and stage 2 audit by a certification body. Cyber Essentials Plus is a common first step. I can draft the risk register and policy set from this document when you are ready.
