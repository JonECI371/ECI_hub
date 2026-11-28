# Branches: how we keep one version of the truth

Written 28 Nov 2026 for Jon, who is learning how this works. Plain English first, the commands second.

## What a branch is
A branch is a separate copy of the code where one piece of work can be built without disturbing everything else. `main` is the real, current version of the site. Work is done on a branch, tested, then merged into `main`. Merged means the branch's changes are now inside `main`.

## Why this matters
On 27 and 28 Nov, work was built on an old copy of `main` while newer work sat on other branches. That work was then put on the test site. The result was a test site that went backwards: features disappeared and some course data was reset. It took a full day to untangle. Nothing in the code was wrong; the copies had simply drifted apart.

## The rules (for Claude, and for any chat that works on this repo)
1. **There is one `main`, and `main` is the truth.** Everything that has been agreed and tested belongs in it.
2. **Before starting anything, check the branches.** At the start of every chat, Claude runs the branch check below and tells Jon in plain English: which branches exist, which are already inside `main`, which are not, and what is in the ones that are not.
3. **One piece of work, one branch, named for the work** (for example `delegate-fields`, `crm-pipelines`). No long-lived "everything" branches.
4. **Branches stay short.** Merge into `main` as soon as the work is tested and Jon is happy. Do not let branches pile up.
5. **Never deploy from anything except an up-to-date `main`.** If `main` is not up to date with the branches that matter, merge first, then deploy.
6. **Before each deploy:** check what is live (which commit), take a database backup, tag the current app as a rollback, and never pass the seed step.
7. **A branch is never deleted without asking Jon.** Merged branches are kept until Jon says they can go.
8. **Two chats working at once** (for example the CRM chat and the main build chat) each use their own branch and merge into `main` in turn, never into each other's branches. Whoever merges second brings `main` into their branch first.

## The branch check (Claude runs this at the start of each chat)
```bash
git fetch origin '+refs/heads/*:refs/remotes/origin/*'
for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin | sed 's#origin/##' | grep -v '^HEAD$\|^main$'); do
  git merge-base --is-ancestor origin/$b origin/main && echo "$b: already in main" || echo "$b: NOT in main ($(git rev-list --count origin/main..origin/$b) commits)"
done
```
A branch that is NOT in `main` means someone's work has not been brought in yet. Claude reports it before doing anything else.

## What is live on the test site
`docs/progress.md` records every deploy: the commit, the rollback tag and the backup. Claude updates it with each deploy. If it is unclear what is live, check the test site's build against `main` before assuming.

## Branch register (28 Nov 2026)
All of these are already inside `main` (commit `dec3592`). They are kept, not deleted, until Jon says so.

| Branch | What it held |
| --- | --- |
| booking-flow-2-10, 2-10b, step3 | Breadcrumbs, the Delegate details page, simpler checkout |
| browser-checks | The browser checks (`npm run e2e`) |
| course-formats-duplicate | Format tabs, Duplicate course, course page template |
| course-page-template, prices-poa | Course page template, POA prices |
| consultancy-demo | Consultancy pages |
| services-admin | Admin Services, old-address redirects (held), hand-offs, deploy scripts |
| site-max-width, staff-authenticator-signin, tasks-provider-filter | Page width, authenticator sign-in, provider filter in Tasks |
| integrate | The merge that brought everything together on 28 Nov |

Open branches from other chats should be added here when they start, and marked merged when they finish.
