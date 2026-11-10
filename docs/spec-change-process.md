# How the specification is changed

One master, two readable copies, every change dated and approved.

| Copy | Where | Used for |
| --- | --- | --- |
| Master | `docs/spec.md` in GitHub | What gets built. Full line-by-line history of every change. |
| Shared doc | Claude Doc "ECI-Hub Specification" | Reading, comments and suggested edits (shown as tracked changes) |
| Word copy | SharePoint, one file kept up to date | Offline reading and Word's Compare to see changes between versions |

## Versions

A version is named by the date it was approved: `2026-11-10`. If two versions are approved on the same day, the second is `2026-11-10b`.

## Making a change

1. **Propose.** Anyone (Jon, Kirsty, Claude) proposes a change: a suggested edit or comment in the shared doc, a row in a test log, or a message to Claude.
2. **Write it up.** Claude adds it to "Pending changes" in the shared doc with the reason, what it affects and which tests need re-running.
3. **Sign off.** Jon chooses Approve, Not now or Reject. Nothing is built until it is approved.
4. **Update the master.** Claude edits `docs/spec.md`, adds a Change log row (version, date, change, reason, approved by, tests) and commits it to GitHub with the message `Spec <version>: <summary>`. A change to the spec and the code that delivers it go in together where possible.
5. **Update the copies.** Claude updates the shared doc (its version history keeps the old wording) and produces `ECI-Hub Specification <version>.docx` for SharePoint.
6. **Re-test.** Kirsty re-tests the requirement IDs listed in the Change log row and records the result in the test log against those IDs.

## Word copy in SharePoint

Keep one file, `ECI-Hub Specification.docx`, in the agreed SharePoint folder. For each new version, upload the new dated file over it (SharePoint keeps every earlier version under Version history). To see what changed as tracked changes: in Word, Review, Compare, and pick the previous version and the new one.

## Test traceability

Each acceptance criterion has an ID (PUB-01 to PUB-12, POR-01 to POR-03, ADM-01 to ADM-11, TRN-01). Test logs and automated tests quote the IDs they cover, so a change to a requirement shows exactly which tests to re-run.
