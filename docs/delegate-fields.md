# Delegate fields by course

Agreed with Jon on 27 Nov 2026 using the "Delegate Field Matrix" page (Claude artifact https://claude.ai/artifact/LPNUeC11CB19yTE8cNtGXB). This file is the written record. **R** required, **o** asked but can be left blank, **-** not asked.

Courses: **TW** Thames Water Safety Passport (virtual) · **A** CompEx ExA Awareness (in person) · **F** CompEx ExF Foundation (in person) · **E** CompEx Ex12 Application Design Engineer (in person) · **L** CompEx ExA Awareness (eLearning) · **U** EUSR National Water Hygiene (eLearning) · **P** Process Safety Awareness (virtual) · **D** DSEAR Awareness (virtual)

| Field | TW | A | F | E | L | U | P | D | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| First name | R | R | R | R | R | R | R | R | |
| Last name | R | R | R | R | R | R | R | R | |
| Email | R | R | R | R | R | R | R | R | |
| Telephone | o | R | R | R | R | R | o | o | Jon: optional for Thames Water |
| Date of birth | R | R | R | R | R | R | - | - | Thames Water: SkillGuard matching |
| Employer | o | R | R | R | o | o | o | o | |
| Job title | - | - | - | - | - | - | - | - | In the CRM record if wanted |
| Postal address | - | - | - | - | - | - | - | - | Only if a physical card or certificate is offered (for example CSCS, SHEA Water) |
| SkillGuard number | o | - | - | - | - | - | - | - | Optional at booking, required before the certificate is issued |
| CompEx Unique Learner Number (ULN) | - | R | R | R | o | o | - | - | Replaces the separate CompEx ID |
| EUSR ID | - | - | - | - | - | o | - | - | |
| Photo (selfie) | - | - | - | - | - | R | - | - | Not needed for Thames Water or CompEx (SkillGuard manages it for Thames Water) |
| Copy of photo ID | - | - | - | - | - | R | - | - | Deleted after 30 days |
| Emergency contact | - | - | - | - | - | - | - | - | Not asked anywhere for now |
| Dietary requirements | - | o | o | o | - | - | - | - | |
| Accessibility or support needs | - | o | o | o | - | - | - | - | |
| PO or reference for invoicing | o | o | o | o | o | o | o | o | Booker, per delegate, on account bookings only |
| Marketing emails opt-in | o | o | o | o | o | o | o | o | Booker at checkout, never pre-ticked |
| Admin approves registration before the course | - | R | R | R | R | - | - | - | A setting, not a field. Confirm for CompEx eLearning |

## Open points
- The platform does not read this yet. Registration questions are still set in code per subject (`src/lib/registration-sets.ts`), and the new Delegate details page is Thames Water only. See the proposal to make these per-course settings in Admin.
- Add the ULN field and the CompEx and EUSR changes above when this is built (ULN required for in-person CompEx; telephone required for CompEx and EUSR; emergency contact removed; accessibility only for in-person CompEx).

## When a course is created
Add a column for it to the matrix page (the page has an "Add a course" form, or Claude writes a `courses` document to its database), start its ticks from a similar course, and update this file. Claude does this whenever Claude creates or changes a course. Courses made by staff in Admin are not seen by the page automatically, so tell Claude or add the column on the page.
