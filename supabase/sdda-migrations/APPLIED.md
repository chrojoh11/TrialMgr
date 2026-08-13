# Applied SDDA migrations

## `20260813_0001_sdda_core.sql`

- Applied: 2026-08-13 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Database branch: `main` / Production
- Execution result: success, no rows returned
- Verification: 10 `public.sdda_*` tables found
- RLS verification: enabled on all 10 tables
- Policy verification: every table reported two or more policies

The verification query inspected `pg_class`, `pg_namespace`, and `pg_policies`.
No legacy C-WAGS migration was applied.

## `20260813_0002_auth_profile_bootstrap.sql`

- Applied: 2026-08-13 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Database branch: `main` / Production
- Execution result: success, no rows returned
- Verification: `sdda_handle_new_auth_user` function exists
- Verification: `sdda_auth_user_profile` trigger exists on `auth.users`
- Backfill verification: 0 Auth users and 0 SDDA profiles before account setup

## `20260813_0003_atomic_trial_creation.sql`

- Applied: 2026-08-13 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Database branch: `main` / Production
- Execution result: success, no rows returned
- Verification: `sdda_create_trial` exists as `SECURITY INVOKER`
- Permission verification: `authenticated` can execute; `anon` cannot execute
- Data impact: additive function only; no existing rows changed

## `20260813_0010_unified_entry_runs.sql`

- Applied: 2026-08-13 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Database branch: `main` / Production
- Execution result: success, no rows returned
- Verification: `sdda_runs.stream` exists and the import function contains unified-entry reuse logic
- Permission verification: authenticated execution allowed; anonymous execution denied
- Data impact: existing runs were backfilled from their entry stream; subsequent imports reuse entries and upsert runs

## `20260813_0011_formal_alerts.sql`

- Applied: 2026-08-13 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Execution result: success, no rows returned
- Verification: `sdda_entries.formal_alerts` exists and the authenticated importer accepts `entry_formal_alerts`
- Data impact: additive nullable field; existing values are populated on idempotent CSV re-import

## `20260813_0012_component_move_up.sql`

- Applied: 2026-08-13 (America/Edmonton)
- Project: `SDDA-Trialdesk` (`hsxwwtvzfulxdqimkgcc`)
- Verification: component move-up function and `move_up_from_level` column installed
- Rules: available on any day; secretary confirms qualification and host approval; offering, stream, capacity, and duplicate checks enforced
- Audit: approvals and undo actions retained in `sdda_audit_records`

## `20260813_0008_delete_draft_trial.sql`

- Applied: 2026-08-13 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Database branch: `main` / Production
- Execution result: success, no rows returned
- Security: only the authenticated owner can delete a trial whose status is `draft`; anonymous execution is denied
- Audit: deletion metadata is retained independently of the deleted trial
- Data impact: additive function only; no existing trials were deleted during migration

## `20260813_0009_fix_draft_delete_audit.sql`

- Applied: 2026-08-13 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Database branch: `main` / Production
- Execution result: success, no rows returned
- Fix: cascading offering deletion no longer creates audit rows referencing the parent trial being deleted
- Audit: normal offering changes remain audited; the independent `trial.deleted` record remains durable
- Data impact: function definitions only; no trials were deleted during migration

## `20260813_0007_secure_trial_creation.sql`

- Applied: 2026-08-13 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Database branch: `main` / Production
- Execution result: success, no rows returned
- Security: function requires `auth.uid()`, assigns ownership to that user, and remains executable only by `authenticated`
- Data impact: function execution mode changed from invoker to definer; no existing rows changed

## `20260813_0006_atomic_running_order.sql`

- Applied: 2026-08-13 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Database branch: `main` / Production
- Execution result: success, no rows returned
- Verification: `sdda_save_running_order` exists as `SECURITY INVOKER`
- Permission verification: authenticated execution allowed; anonymous execution denied
- Data impact: additive function only; no existing rows changed

## `20260813_0004_trial_offerings.sql`

- Applied: 2026-08-13 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Database branch: `main` / Production
- Execution result: success, no rows returned
- Verification: `sdda_trial_offerings` exists with RLS and two policies
- Permission verification: authenticated read/write allowed; anonymous read denied
- Initial state verification: 0 offering rows
- Audit verification: offering insert/update/delete trigger installed
- Data impact: additive table, policies, and audit trigger; no existing rows changed

## `20260813_0005_atomic_entry_import.sql`

- Applied: 2026-08-13 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Database branch: `main` / Production
- Execution result: success, no rows returned
- Verification: `sdda_import_entry` exists as `SECURITY INVOKER`
- Permission verification: authenticated execution allowed; anonymous execution denied
- Data impact: additive function only; no existing rows changed
