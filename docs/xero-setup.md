# Xero connection

How ECI-Hub talks to Xero, and the steps to connect it. Secrets never go in chat or in git.

## What happens automatically (once connected)

| Event | What goes to Xero |
|---|---|
| Card booking paid | Authorised invoice (contact matched by email, created if new), then a payment into the Stripe clearing account |
| Card refund or session cancelled | Credit note, then a payment out of the Stripe clearing account |
| Credit account approved or terms changed | Xero contact with every application field (company, number, VAT, addresses, accounts phone, up to 5 contact people, payment terms) |
| Month end | One DRAFT invoice per account, dated the last day of the month, one line per booking (cancellations as negative lines). Kirsty reviews and approves it in Xero |
| Invoice paid in Xero | Statement marked paid here, credit restored, holds lift |

Every send goes through a queue (Settings, Credit accounts and Xero). Failed sends retry, then raise an Integration failure task; press Retry failed once the cause is fixed. Nothing is sent twice.

## Steps for Jon

1. Xero Developer portal (developer.xero.com), My Apps, New app, type "Web app". Redirect URI: `https://<secure domain>/admin/xero/callback` (must be https, so this waits for the secure domain).
2. Store the Client ID and Client secret in AWS Secrets Manager (Stockholm) as `eci-hub/test/xero` with keys `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET`. Do this in the AWS console, not in chat.
3. On the server, create `/opt/eci/xero.env` containing `XERO_SECRET_ID=eci-hub/test/xero`, then restart the app.
4. Sign in as Super Admin, Settings, Credit accounts and Xero, Connect to Xero. Choose the **Demo Company (UK)** first.
5. Ask the accountant for the Stripe clearing account code and enter it, with the sales account code (200) and the tax code (OUTPUT2 for 20% VAT on income). Held invoices wait until the clearing code is set.
6. Book a test course by card and check the invoice and payment appear in Xero. Then run month end for a test account.

If Xero rejects the scopes, set `XERO_SCOPES` (default `offline_access accounting.invoices accounting.payments accounting.contacts accounting.settings.read`).
