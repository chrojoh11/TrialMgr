# SDDA-only conversion plan

## Safety boundaries

- `K:\TrialManager` is the only implementation target.
- Do not write to `E:` or use it as a build, test, or migration source.
- Do not push. Local commits are recovery points only.
- Do not alter the external Vercel project. The user will disconnect it.
- The eventual deployment target is the user's `chrojoh11` Vercel account.
- Preserve `stash@{0}` (`Pre-SDDA conversion snapshot 2026-08-13`).

K may connect only to the dedicated `SDDA-Trialdesk` Supabase project with
reference `hsxwwtvzfulxdqimkgcc`. The application intentionally fails at startup
and build time if credentials point to any other Supabase project.

## Architecture decision

TrialDesk will use the dedicated SDDA Supabase project as its shared system of
record and will deploy through the user's `chrojoh11` GitHub and Vercel accounts.
Offline trial operation remains mandatory, so operational data will also be
cached locally with a durable write queue, explicit synchronization state, and
downloadable/restorable backups.

The migration is phased. Reusable database access and authentication code will
be repointed only after a new SDDA schema and RLS policies are verified. C-WAGS
migrations, data, project references, and credentials must never be copied.

## Phases

1. **Domain foundation**
   - Replace visible C-WAGS identity with SDDA TrialDesk.
   - Define SDDA levels, components, streams, registration identifiers, trial
     day limits, run groups, move-ups, and conflict checks in tested modules.
2. **Dedicated persistence**
   - Add a versioned SDDA PostgreSQL schema for trials, days, people, dogs,
     entries, component runs, scores, payments, audit records, and backups.
   - Add least-privilege RLS, transactional operations, offline caching, a
     durable synchronization queue, and automatic backup/restore validation.
3. **Entry intake and setup**
   - Port Google Forms/CSV import with mapping preview and rejection reporting.
   - Support one-to-four-day trials, SDDA registration, capacities, Amateur and
     Working streams, officials, FEO, second dogs, BIS, and waitlists.
4. **Trial operations**
   - Port running-order grouping, manual ordering, conflict checks, scoring,
     component-specific next-day move-ups, undo, and an append-only audit trail.
5. **Official outputs**
   - Port and visually verify official prefilled score-sheet PDFs.
   - Export the SDDA Trial Workbook; split three/four-day events into controlled
     workbook pairs where the official workbook remains two-day.
   - Add Title Watch with explicit championship-history limitations.
6. **Finances and hardening**
   - Port payment, refund, expense, judge/volunteer, and reconciliation flows.
   - Exercise crash recovery, offline restart, backup restore, and audit replay.
7. **Legacy removal**
   - Remove C-WAGS migrations, assets, rules, project assumptions, and obsolete
     deployment coupling only after replacement acceptance tests pass.

## Verification gates

Each phase must pass focused unit tests, TypeScript checking/build validation,
and a clean Git diff review before a local milestone commit. PDF and workbook
phases also require rendered/output comparison against the official SDDA files.
