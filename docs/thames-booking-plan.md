# Thames Water booking at booking.eci-hub.co.uk: preparation plan

Written 27 Nov 2026. For Jon's sign-off. Nothing in this plan has been built or switched on.

## Decided by Jon (27 Nov 2026)
- Only the Thames Water booking journey is extracted. It runs on the same platform (one codebase, one database), not a separate copy.
- Address: `booking.eci-hub.co.uk`. The current website is on WordPress and links to it (no embedding: the platform deliberately refuses to be shown inside other pages).
- Stripe moves from test to a real, paid environment.
- Preparation happens now. Testing takes place later, over the next few days, by people in an ordinary browser (not by Claude, see the Testing rule in `docs/handover.md`).

## Still to decide (Jon)
1. **Order against the penetration test.** The 26 Nov rule says no real customer data before the pen test. Real Thames Water bookings are real customer data. Either pen test first, or a small pilot as a signed-off exception.
2. **Where it runs.** Options: (a) the London production stack in `infra/` (Fargate, RDS, load balancer: paid AWS services, ask first), or (b) the same single-server pattern as the test site, in London. (a) is the planned production design.

## What can be prepared now (no real data, no paid service)
| # | Item | Who | Notes |
|---|---|---|---|
| P1 | "Thames only" launch mode: only the Thames Water course and its dates are published; other courses stay draft | Claude | Uses existing publish status. Check that course search, home page and sitemap show only published courses |
| P2 | Booking-site landing page: Thames Water Safety Passport at the top level, plain links back to the WordPress site | Claude | Small. Wording to be agreed with Jon |
| P3 | WordPress side: the list of buttons and links that point to SimplyBook today, and what each should point to | Jon (WordPress owner) | I need the list of SimplyBook URLs on the site |
| P4 | Real Stripe: create or switch the live account, live keys into Secrets Manager (never in chat), live webhook to `booking.eci-hub.co.uk/api/stripe/webhook`, clearing account in Xero | Jon, then Claude | Test mode stays on the test site |
| P5 | Real Xero for card bookings: sales codes (200-1 to 200-5), Stripe clearing account (695 does not exist), clear test data first | Jon | See `docs/go-live-checklist.md` |
| P6 | Real email: five DNS records for `eci-hub.co.uk` (to-do #20), SES out of sandbox | Jon | Needed so confirmations and reminders reach real delegates |
| P7 | Teams: host mailbox confirmed able to create Teams meetings (a test invite reached Jon with a link on 27 Nov) | Jon | Safeguard (re-read link, Admin task if missing) built when approved |
| P8 | DNS: `booking.eci-hub.co.uk` pointed at the chosen environment, HTTPS certificate | Jon, then Claude | After decision 2 |
| P9 | Legal text: cancellation, terms, privacy, cookie banner, recording notice | Jon and solicitor | See go-live checklist |
| P10 | Thames Water specifics: SkillGuard question wording, passport and virtual card wording, 3-year validity, who may book | Jon | Check against what SimplyBook says today |
| P11 | Existing Thames Water delegates and future bookings in SimplyBook | Jon | Not moved until after the pen test (3.8). Decide how to handle bookings already taken in SimplyBook for dates that also open here |

## Switch-over steps (after testing and the order decision)
1. Final testing by Jon and Kirsty on the test site (ordinary browser, by hand).
2. Fixes from that testing; Kirsty retests.
3. Pen test, if decision 1 is pen test first; fixes and re-test.
4. Production environment built and checked; real Stripe, Xero and email connected; one small real card payment and refund test.
5. Thames Water dates published on `booking.eci-hub.co.uk`; WordPress buttons changed to point there.
6. SimplyBook Thames Water services closed to new bookings on the day; existing SimplyBook bookings honoured and listed so nothing is double-booked.
7. Watch the first cohort: invites sent automatically, payments in Xero, certificates raised.

## Rollback
Point the WordPress buttons back at SimplyBook. Nothing is deleted from SimplyBook during the pilot.

## Dependencies and risks
- Real Stripe, real email and the Teams host mailbox must all work before any real booking.
- Single server (910 MB) is test only; do not use for real bookings.
- Data migration (3.8) is separate and happens after the pen test.
