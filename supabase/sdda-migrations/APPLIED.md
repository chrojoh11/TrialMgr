# Applied SDDA migrations

## `20260820_0020_secure_formatted_trial_creation.sql`

- Applied: 2026-08-20 (America/Edmonton)
- Project: `SDDA-Trialdesk` (`hsxwwtvzfulxdqimkgcc`)
- Database branch: `main` / Production
- Execution result: success, no rows returned
- Fix: restored secure-definer execution for the five-argument formatted-trial function so its atomic child inserts pass RLS
- Security: anonymous execution remains revoked; only authenticated users may call it, and the function still requires `auth.uid()` and assigns ownership to that user
- Data impact: function security configuration only; no trial or entry records were changed

## `20260820_0019_public_games_entries.sql`

- Applied: 2026-08-20 (America/Edmonton)
- Project: `SDDA-Trialdesk` (`hsxwwtvzfulxdqimkgcc`)
- Database branch: `main` / Production
- Execution result: success, no rows returned
- Verification: `sdda_game_runs.requested_team_partner`, the Games-aware public setup function, and the combined public submission function are available
- Security verification: anonymous direct table access remains denied; the two narrow public entry functions reject trials that are not accepting entries
- Entry behavior: one submission may contain Scent runs, Games runs, or both; Games support Regular/FEO and require a requested partner for Team
- Data impact: function replacement and one additive nullable field; existing entries and runs were not rewritten

## `20260819_0018_trial_formats_and_games.sql`

- Applied: 2026-08-20 (America/Edmonton)
- Project: `SDDA-Trialdesk` (`hsxwwtvzfulxdqimkgcc`)
- Database branch: `main` / Production
- Execution result: success
- Verification: `sdda_trials.trial_format`, all four `sdda_game_*` tables, and the five-argument `sdda_create_trial` function are visible through the dedicated project API
- Security verification: anonymous table and function requests are denied; authenticated access remains governed by existing SDDA trial-access and trial-management helpers
- Architecture: Games use dedicated offerings, team pairs, runs, and scores linked to the existing SDDA trial/day/entry records
- Data impact: existing trials retain the default `scent` format; no existing trial, entry, dog, or scent-run rows were rewritten

## `20260813_0016_public_entry_run_group_requests.sql`

- Applied: 2026-08-13 (America/Edmonton)
- Project: `SDDA-Trialdesk` (`hsxwwtvzfulxdqimkgcc`)
- Execution result: success, no rows returned
- Entry behavior: competitors may request Regular, Official, Second dog, FEO, or BIS separately for each selected run
- Secretary control: requests populate the existing run-group field and remain editable from Running Orders
- Security: the original submission implementation is private; anonymous callers can execute only the validated wrapper
- Data impact: function definitions only; no existing trial, entry, dog, or run rows changed

## `20260813_0015_public_entry_random_bytes.sql`

- Applied: 2026-08-13 (America/Edmonton)
- Project: `SDDA-Trialdesk` (`hsxwwtvzfulxdqimkgcc`)
- Execution result: success, no rows returned
- Fix: public entry receipt-token generation resolves Supabase `pgcrypto` from the trusted `extensions` schema
- Verification: submission function configuration reports `search_path=public, extensions` with row security disabled only inside the validated security-definer function
- Data impact: function configuration only; no trial, entry, dog, or run rows changed

## `20260813_0014_public_entry_confirmations.sql`

- Applied: 2026-08-13 (America/Edmonton)
- Project: `SDDA-Trialdesk` (`hsxwwtvzfulxdqimkgcc`)
- Execution result: success, no rows returned
- Architecture: anonymous table access remains denied; only setup, validated submission, and token-protected receipt functions are executable
- Privacy: receipt tokens are stored only as SHA-256 hashes; confirmation status begins as `received`, separately from secretary acceptance
- Data impact: additive columns, functions, and index only; existing entries and runs were not rewritten

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

## `20260813_0013_multilevel_component_runs.sql`

- Applied: 2026-08-13 (America/Edmonton)
- Project: `SDDA-Trialdesk` (`hsxwwtvzfulxdqimkgcc`)
- Verification: run uniqueness and import upsert now include level
- Data impact: preserves legitimate Advanced and Excellent runs for the same dog/day/component; missing runs are restored by idempotent CSV re-import

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

## `20260813_0017_per_run_entry_streams.sql`

- Applied: 2026-08-13 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Database branch: `main` / Production
- Execution result: success, no rows returned
- Verification: public entry submission derives each run stream from its selected trial offering
- Compatibility: entry-level stream may be `Mixed`; Started, Advanced, and Excellent runs remain individually Amateur or Working; Elite is presented without a stream
- Data impact: constraint and submission function replaced transactionally; no existing rows rewritten

## `20260820_0021_entry_editing_and_aerial.sql`

- Applied: 2026-08-20 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Database branch: `main` / Production
- Reported execution result: applied successfully
- Capability: token-scoped competitor editing and authorized secretary editing
- Games: records Aerial High and Highfly divisions
- Security: competitor edits require the private receipt token and an open, unconfirmed entry; secretary edits require trial-management access
- Audit: before/after snapshots are retained for public and secretary entry changes

## `20260820_0022_financial_ledger.sql`

- Applied: 2026-08-20 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Database branch: `main` / Production
- Reported execution result: applied successfully
- Capability: audited entry fees, payments, refunds, adjustments, trial expenses, judge expenses, and volunteer expenses
- Security: recording and deletion require finance access; entry-linked transactions are checked against the trial
- Audit: transaction creation and deletion are retained in `sdda_audit_records`

## `20260820_0023_reported_gold_snapshots.sql`

- Applied: 2026-08-20 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Database branch: `main` / Production
- Reported execution result: success, no rows returned
- Capability: dated Advanced, Excellent, and Elite Gold-count snapshots declared on an entry
- Verification status: competitor-reported only; declarations do not automatically approve a title or move-up
- Security: public changes require the private receipt token and an open, received entry; authorized trial managers may correct a snapshot
- Audit: every snapshot addition or correction is retained in `sdda_audit_records`

## `20260820_0024_trial_pricing.sql`

- Applied: 2026-08-20 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Database branch: `main` / Production
- Reported execution result: success, no rows returned
- Capability: audited Scent component, three-component package, and Elite pricing
- Financials: accepted entries can now be tallied automatically alongside Games fees, payments, refunds, adjustments, operating expenses, SDDA remittance estimates, and judge compensation estimates
- Security: pricing changes require authenticated trial-management access; no anonymous table access or privileged service-role credential is used
- Audit: every pricing change is retained in `sdda_audit_records`

## `20260820_0025_trial_day_details.sql`

- Applied: 2026-08-20 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Database branch: `main` / Production
- Reported execution result: success, no rows returned
- Capability: trial numbers and day-level judge assignments can be entered later or replaced on the trial workspace
- Security: changes require authenticated trial-management access
- Audit: every trial-number update and judge substitution retains before/after values in `sdda_audit_records`

## `20260820_0026_entry_confirmation_workflow.sql`

- Applied: 2026-08-20 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Database branch: `main` / Production
- Reported execution result: success, no rows returned
- Capability: secretaries can move entries between Received, Accepted, Waitlisted, and Rejected
- Operational boundary: only accepted entries are used for running orders, score sheets, judge packets, and official workbook output
- Audit: every confirmation-status change retains before/after values

## `20260820_0027_trial_public_details.sql`

- Applied: 2026-08-20 (America/Edmonton)
- Project: `SDDA-Trialdesk`
- Project reference: `hsxwwtvzfulxdqimkgcc`
- Database branch: `main` / Production
- Reported execution result: success, no rows returned
- Capability: trial secretary contact, payment instructions, cancellation policy, and Scent pricing are available to the public entry workflow
- Security: public setup remains available only through the narrow entry-setup function; writes require trial-management access
- Audit: every competitor-facing detail change retains before/after values
