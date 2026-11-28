# Go-live checklist

Everything that must be true before real customers use the platform. Items are collected from decisions and test findings; tick them off as they are done. Production changes need Jon's say-so (see CLAUDE.md).

## A. Real accounts (Jon)

- [ ] Real Stripe account chosen (ECFIO Engineering Ltd), live keys stored in Secrets Manager, webhook set up.
- [ ] Real Xero organisation (ECFIO Engineering Ltd) agreed with the accountant: Stripe clearing account created with "Enable payments to this account" ticked, sales account code, tax code (OUTPUT2 for 20% VAT on income).
- [ ] Test data cleared first (including Kirsty's test accounts), then Xero connected to the real organisation from Settings.
- [ ] **Small real refund test:** one real card payment of a small amount, then cancel and refund it. Check the money returns to the card, the invoice and credit note appear in the real Xero, and the Stripe clearing account returns to zero. Reconcile the Stripe payout in Xero (sales, refund and fee).
- [ ] Accountant confirms how Stripe fees and payouts are booked against the clearing account.

## B. Production environment (after testing)

- [ ] London region (eu-west-2), production domain, https certificate, DNS.
- [ ] Web application firewall on.
- [ ] Malware scanning of uploads on (GuardDuty Malware Protection for S3 on the files bucket; app serves, attaches to Xero or opens a file only once it is tagged clean).
- [ ] Email domain verified and out of the SES sandbox (the five DNS records for eci-hub.co.uk).
- [ ] Backups and restore tested; logging and alerts on failures.
- [ ] Independent penetration test done; open items in docs/security.md closed or accepted. (Jon, 26 Nov 2026: this comes BEFORE any SimplyBook or Zoho data is migrated in. Test with made-up data only.)

## C. Content and legal

- [ ] Solicitor review of the cancellation policy and credit account terms.
- [ ] Placeholder figures on the homepage replaced (the [NUMBER] items).
- [ ] Wording changes from the "Website wording changes" doc applied.
- [ ] Companies House API key added (optional; until then applications are checked by hand).

## D. Testing sign-off

- [ ] Kirsty's Phase 1 and Phase 2 checklists and Round 3 signed off.
- [x] (15 Nov 2026, ECI Test Hub) Full Xero run against the test organisation passed: card invoice and payment, refund credit note, account contact, month-end draft invoice with PO files, payment in Xero marks the statement paid.

## Added 16 Nov 2026

- [ ] Xero (ECFIO real organisation): choose a sales account per course type (200-1 Safety passport, 200-2 CompEx, 200-3 Cogent, 200-4 Bespoke, 200-5 EUSR eLearning) instead of one code; create or choose the Stripe clearing account (695 does not exist; Stripe is a bank account "Stripe GBP" with no code).
- [ ] Staff monitoring notice covers the Test log (odd input, fast and automated-looking submissions) before anyone is told it exists on production, or switch the Test log off for production.
- [ ] Email: replace the test route (Microsoft 365, Mail.Send, support@, allow-listed addresses only) with Amazon SES:
  - add the 5 email DNS records for eci-hub.co.uk (SES domain verification, DKIM, SPF, DMARC, custom mail-from);
  - ask AWS to move SES out of sandbox so it can send to any customer;
  - verify bookings@ and support@ as senders and set EMAIL_FROM;
  - set EMAIL_MODE=ses in production and do not copy /opt/eci/mail.env;
  - remove the Mail.Send permission from the Microsoft 365 app (it was for the test server only) or keep it limited to support@ by the access policy;
  - remove the test allow-list so real customers receive invites and emails;
  - handle bounces and complaints into the Email bounce task;
  - send one of every email type to a real mailbox and check wording, branding and spam score;
  - solicitor checks reminder wording and unsubscribe rules for marketing email.
- [ ] Solicitor approves the profile picture wording: the registration selfie is kept as a profile picture automatically (not opt-in), visible to Admin, Super Admin and trainers, until the person removes it. Check the privacy page text, the retention rule for closed accounts, and whether a tick box is needed.
- [ ] Account closure or deletion must also delete the profile picture file (no delete helper yet for stored files).
- Old-address redirects (48 addresses, `src/lib/old-site-redirects.json`): they are off until the final switch-over. Build the production image with `OLD_SITE_REDIRECTS=1` to switch them on. Test them first on a private copy.
