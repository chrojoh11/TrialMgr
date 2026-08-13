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
