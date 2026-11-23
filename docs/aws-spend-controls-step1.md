# AWS Step 1: Spend limits and controls (guided walkthrough)

**How to use this file:** open a new chat and paste everything below the line into it. Claude will then walk Jon through the AWS Console one small step at a time. Written 23 Nov 2026 from the ECI-Hub project chat.

---

## Prompt to paste into the new chat

You are helping Jon set up spend limits and basic protections on his AWS account. Jon is not technical. Please follow these rules for the whole chat:

1. **One step at a time.** Give me one short step, wait for me to say "done" or send a screenshot, then give the next. Never list ten steps at once.
2. **Plain English.** No jargon without a one-line explanation. Tell me exactly what to click, using the words on the screen. If a menu name looks different from what I see, I will tell you and you adapt.
3. **Check my work.** After the important steps, ask me for a screenshot. Remind me to **crop out or hide** anything that looks like a key, secret, password, one-time code or QR code. I must never paste a secret into the chat.
4. **Say how long each part will take** and which steps need the root login and which need an administrator login.
5. **Stop and ask me** before anything that deletes something or costs money. Nothing here should cost more than pennies.
6. At the end, give me a **checklist of what is done**, and write a short summary I can paste back into the ECI-Hub project chat.

### Background you need

- **Who:** Jon Wallis, owner of ECFIO Engineering Ltd, trading as ECI-Hub. This is the AWS account for the ECI-Hub booking website. Kirsty and the developer may help.
- **AWS account number:** 992868470990. The test website runs on one small server (a "t4g.micro") in **Stockholm (eu-north-1)**. Production will later be in **London (eu-west-2)**.
- **What I checked on 18 Nov 2026 (read-only, using the deployer login):**
  - AWS Budgets: **none set up**.
  - Cost anomaly alerts: **none**.
  - Billing alarms: **none**.
  - Multi-factor login (MFA) on the root user: **off**.
  - CloudTrail (record of who did what): **no trail**.
  - S3 account-wide "Block public access": **not set**.
  - GuardDuty (threat detection): **off**.
  - Spend this month so far: about nothing.
  - The test server's firewall only allows web traffic (ports 80 and 443).
- **My spending limit:** I want an alert if this month's spend is going to go over **£10**. AWS budgets are in US dollars, so use **13 US dollars** (about £10). I also want to be warned if I am likely to **run out of free allowance** (the AWS Free Tier).
- **There is a user called `eci-hub-deployer`.** It is used by Claude to deploy the test site. It cannot see billing, and it must **not** be given extra rights in this chat.
- **Things already decided:** alerts only tell me, they do not switch anything off, for now. A hard stop is optional and comes last.
- **Ask me early:** which email address should receive the alerts, and a **second person's email** (the developer's, for example) so one inbox is not the only warning.

### The steps (do them in this order)

**Part A: root user (about 10 minutes). Sign in at the AWS Console as the ROOT user, with the email the account was opened with.**

1. **Turn on MFA for the root user (most important).** Account name, top right, then **Security credentials**, then **Multi-factor authentication (MFA)**, **Assign MFA device**. Name it (for example `jon-phone`), choose **Authenticator app**, scan the QR code with my phone's authenticator app, enter two codes in a row, **Add MFA**. Then check the same page shows **no access keys** for the root user. If there are any, do not delete them: tell me and wait.
2. **Billing emails.** Account name, **Billing and Cost Management**, **Billing preferences** (also called **Alert preferences**). Tick **Receive AWS Free Tier alerts** and enter my email. Tick **Receive CloudWatch billing alerts** if shown. **Save preferences.**

**Part B: the monthly budget (about 10 minutes)**

3. **Billing and Cost Management, Budgets, Create budget.** Choose **Customize (advanced)**, then **Cost budget**, **Next**.
4. Name `monthly-limit`. Period **Monthly**. Renewal **Recurring**. Method **Fixed**. Amount **13**. Scope: all AWS services. **Next.**
5. Add **four alert thresholds** (**Add an alert threshold** for each):
   - **Actual** 50% of the budgeted amount
   - **Actual** 80%
   - **Actual** 100%
   - **Forecasted** 100% (this is the early warning that this month is on course to go over)
6. For each alert, add my email and the second person's email under **Email recipients**. Skip "Attach actions". **Next, Create budget.**

**Part C: unusual-spend alerts (about 5 minutes)**

7. **Billing and Cost Management, Cost Anomaly Detection, Create monitor.** Type **AWS services**, name `all-services`, **Create.**
8. Create the alert subscription: name `anomaly-alerts`, threshold **5 US dollars**, frequency **Individual alerts**, recipients my email and the second email. Save.

**Part D: prove the alerts work (5 minutes now, 1 day to see the email)**

9. Create a **second** budget the same way as step 4 but amount **0.01**, only an **Actual 100%** alert, name `test-delete-me`. Within a day, check the alert email arrives (also check spam).
10. **Then delete `test-delete-me`.** Remind me to do this.

**Part E: safer day-to-day login (about 10 minutes, with the developer if possible)**

11. In **IAM**, create an **administrator user for me with MFA** and use it for daily work instead of the root login. Keep root for billing and emergencies.
12. Review **IAM, Users**: list who exists. `eci-hub-deployer` must have **no console password**. No shared logins.
13. *Optional:* as root, **Account settings, IAM access to billing information: Activate**. This lets me later give Claude **read-only** cost access to check figures. Never give Claude the right to change anything.

**Part F: cheap protections (about 15 minutes, with the developer)**

14. **S3 Block Public Access**, account level: switch **all four options on** (free).
15. **CloudTrail:** create one trail that records who did what, kept in a new S3 bucket (pennies a month). Say the expected cost before I confirm.
16. **GuardDuty:** explain it has a 30-day free trial and then a small charge. I will decide. Recommend switching it on for **production** rather than the test account.

**Part G: optional hard stop (decide with the developer, do last)**

17. Explain what an **AWS Budgets action** does (it can switch off the test server or apply a "deny" rule when spend reaches 100%), the risk (it could switch off something needed) and the cost (free). Recommend adding it only once there is something live to protect.

### When we finish

Give me a checklist like this and tick what is done:

- [ ] Root MFA on, no root access keys
- [ ] Free Tier alerts on
- [ ] Budget `monthly-limit` (13 US dollars) with 4 alerts, two emails
- [ ] Cost anomaly monitor and alert (5 US dollars)
- [ ] Test alert received, `test-delete-me` deleted
- [ ] Admin user with MFA created, deployer has no console password
- [ ] S3 Block Public Access on, CloudTrail on, GuardDuty decision made
- [ ] Optional hard stop decided

Then write a **five-line summary** for me to paste into the ECI-Hub project chat, saying what is done, what is not, and any figures or names I should remember. That chat will then tick tasks **#48 (budget), #49 (anomaly alerts), #50 (root MFA)** and **#51 (review with the developer)**.

### If something goes wrong

- If I cannot see a menu you describe, ask me what I do see and adapt.
- If AWS asks for a payment card, a support plan, or anything that costs money, **stop and tell me**.
- If I paste something that looks like a secret by mistake, tell me to remove it and to treat it as exposed.

---

## After this step (for the project chat)

The next AWS steps are, in order: fix the Microsoft 365 Mail.Send permission, set up AWS CodeBuild so deploys stop failing (`docs/build-in-aws.md`, task #57), then decide the production setup (separate AWS account, where the DNS lives, replace the Stockholm test server with a London staging copy). Production work should not start until Step 1 is done.
