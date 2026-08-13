# SDDA-only conversion plan

## Safety boundaries

- `K:\TrialManager` is the only implementation target.
- Do not write to `E:` or use it as a build, test, or migration source.
- Do not push. Local commits are recovery points only.
- Do not alter the external Vercel project. The user will disconnect it.
- Preserve `stash@{0}` (`Pre-SDDA conversion snapshot 2026-08-13`).

## Architecture decision

TrialDesk will be a local-first application backed by SQLite. A dedicated SDDA
Supabase database is deferred because the initial requirements do not require
concurrent remote editing and offline trial operation is mandatory.

The migration is phased. Existing Supabase code remains temporarily while each
secretary workflow receives a verified local replacement. Removing Supabase,
authentication, migrations, or deployment configuration is a later milestone,
not part of the first foundation commit.

## Phases

1. **Domain foundation**
   - Replace visible C-WAGS identity with SDDA TrialDesk.
   - Define SDDA levels, components, streams, registration identifiers, trial
     day limits, run groups, move-ups, and conflict checks in tested modules.
2. **Local persistence**
   - Add a versioned SQLite schema for trials, days, people, dogs, entries,
     component runs, scores, payments, audit records, and backups.
   - Add transactional repositories and automatic backup/restore validation.
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
   - Remove Supabase, hosted auth, C-WAGS migrations/assets/rules, and deployment
     coupling only after replacement acceptance tests pass.

## Verification gates

Each phase must pass focused unit tests, TypeScript checking/build validation,
and a clean Git diff review before a local milestone commit. PDF and workbook
phases also require rendered/output comparison against the official SDDA files.
