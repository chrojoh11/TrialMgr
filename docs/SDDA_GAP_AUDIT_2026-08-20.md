# SDDA TrialDesk gap audit — 2026-08-20

This audit compares the SDDA-only application in `K:\TrialManager` with the reusable secretary workflows in the original application on E. The E application was inspected read-only. This is an SDDA requirements comparison, not a plan to copy C-WAGS rules or branding.

## Current architecture

- Next.js application hosted by Vercel, with a dedicated SDDA Supabase project.
- Browser and server access are scoped to the SDDA schema and Supabase project guard.
- Supabase remains the appropriate shared database for online entry forms and multiple secretary devices. Local-first/offline reliability still requires a separate synchronization and recovery milestone.
- Database migrations are additive and manually applied. Migrations 0021 and 0022 are intentionally not assumed live until verified in SDDA-Trialdesk.

## Trial lifecycle coverage

| Area | Status | Current capability | Remaining work |
| --- | --- | --- | --- |
| Trial setup | Substantial | 1–4 days, Scent/Games/Combined, offerings, Games fees/judges/capacity | FEO-offered controls; trial application/sanction metadata; richer judge assignment |
| Online entries | Substantial | Public form, receipt, private edit token, multiple dogs, per-run stream, Scent and Games selections | Capacity/waitlist decisions; explicit secretary “add paper/day-of entry” path; Team partner validation; configurable declarations/policies |
| CSV import | Substantial | Original Google Form headers, multi-run rows, offering discovery | Import preview reconciliation and explicit duplicate/update strategy |
| Entry management | Partial | Roster, search, edit, mailing-list export | Accept/reject/waitlist/withdraw workflow, bulk actions, payment-state filters, entry fee generation |
| Running order | Substantial for Scent | SDDA grouping, manual group changes, drag/drop, XLSX export, reactivity | Confirm Games ordering and Team pairing workflow; conflict dashboard; printable steward copies |
| Move-ups | Partial | Component-specific move-up/undo on eligible Scent runs | Stronger qualification evidence, cross-trial/manual provenance, Games implications if any |
| Score sheets | Substantial | Official PDFs, per-template coordinate maps, Scent and Games, alerts, stream/FEO marks | Full visual regression set for every official template revision; smaller-output option; template version registry |
| Scoring/live event | Substantial | Audited Scent/Games score entry, corrections, accepted-entry boundary, provisional placements, printable results | Bulk score entry, offline queue/recovery, final results publication and closeout lock |
| Official workbook | Partial | SDDA workbook export and Games workbook groundwork | Complete all rule-driven Games/classes mapping, score-fed results, visual comparison to official workbook |
| Title watch | Partial/missing | Entry title-watch notes exist | Results-based title calculations, imported history, close-to-title report and warnings |
| Finances | New partial | Transaction ledger, payments/refunds/costs, summaries, audited deletion | Automatic charges from selections, per-entry balance table, fee waivers, judge/volunteer detail, XLSX closeout, break-even |
| Activity journal | New substantial | Search/filter audit history and before/after snapshots | Friendly event-specific narratives, optional secretary notes, export, retention policy |
| Trial summary/closeout | Substantial | Readiness checklist, final-export links, complete JSON backup, audited completion/reopen, database-enforced operational lock | Restore-from-backup workflow and optional published-results package |
| Collaborators | Schema only | Trial-member roles exist | Invite/manage UI and role-specific workflow validation |
| Backups/recovery | Missing | Supabase platform backup only | Secretary-triggered export bundle, restore rehearsal, attachment/template inventory, documented disaster recovery |
| Offline reliability | Missing | Normal browser caching only | Offline score-entry strategy, conflict-safe sync queue, connectivity indicator and recovery tests |
| Email | Deliberately out of scope | Mailing-list XLSX supports external bulk email | No email delivery service requested |
| Registry | Missing | SDDA registration numbers captured | Optional registry import/lookup and duplicate-dog reconciliation |
| Reports/tools | Missing | Core exports only | Time calculator, judge/volunteer reports, public/ringside display, admin reporting |

## Priority sequence before online production testing

1. Apply and verify migrations 0021 and 0022 in the dedicated SDDA project; never apply them to C-WAGS.
2. Build entry acceptance, waitlist, withdrawal, and capacity controls. Generate entry-fee ledger charges from accepted selections.
3. Build audited score entry for Scent and Games, then feed results into the official workbook and title watch.
4. Complete Games running-order/Team pairing and all workbook mappings against the official forms.
5. Add closeout summary, finance export, and a full backup/export bundle.
6. Test permissions with owner, secretary, finance-only, scoring-only, and public users.
7. Run a complete two-day mock trial: online entry, CSV import, edits, move-ups, running orders, sheets, scoring, workbook, finances, audit, and recovery.

## Highest-risk gaps

- Scoring is the largest missing operational path: tables alone do not make the program usable on trial day.
- Entry acceptance/capacity and automatic fee calculation are needed before finances can be treated as authoritative.
- Offline operation and backup/restore have not been proven; they require deliberate design rather than relying on the browser cache.
- Official PDF/workbook templates must be versioned and visually tested because field coordinates differ by class and element.
- Migrations not yet applied to the dedicated SDDA database will make new UI paths fail even when the application code is correct.

## Explicitly excluded C-WAGS concepts

C-WAGS branding, C-WAGS classes, C-WAGS title rules, C-WAGS database credentials, C-WAGS Vercel configuration, and C-WAGS Supabase access are not requirements and must not be reintroduced. Reused ideas are limited to generic secretary workflows such as payment ledgers, journals, permissions, waitlists, scoring audit, and closeout reports.
