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
