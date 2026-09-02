# Payment workflow milestone — migration 0043

Status: implemented and locally tested; user reported migration 0043 applied successfully on 2026-09-02. Deployment authorized. Live browser acceptance testing remains pending.

## Deployment order

1. Apply `supabase/sdda-migrations/20260902_0043_payment_workflow.sql` in the dedicated **SDDA-Trialdesk** Supabase project only (`hsxwwtvzfulxdqimkgcc`). Earlier SDDA migrations must already be applied.
2. Success normally reports no rows returned. If it reports an error, stop and retain the complete error message.
3. Deploy the matching application changes after migration success. New finance queries require the new columns and RPCs.

The migration preserves existing ledger records. It adds audited fee waivers/restorations, signed charge adjustments, expense payees, transaction edits, and atomic multi-dog payment recording. RLS remains enabled. Direct authenticated financial table writes are removed in favor of permission-checked RPCs. No service-role credential is used.

## Secretary workflow

- Accept entries to activate automatic Scent/Games charges. Do not add the same fees manually.
- Find a handler under Finances. Dogs with the same normalized email and handler name are grouped; entries without an email stay separate.
- **Record payment** accepts partial payments or overpayments. A combined payment is allocated to the dogs' outstanding balances; any excess remains as credit.
- **Waive fees** reduces a dog's current outstanding balance, requires a reason, and does not count as cash received. This is a fixed amount, not a permanent free-entry flag. Review it after adding runs or changing prices.
- **Restore fees** reverses an existing waiver once while preserving its history.
- **Refund** records money returned, up to net payments recorded for that dog. It does not cancel the entry charge; adjust or waive the charge separately when appropriate.
- **Adjust** supports a positive additional charge or negative credit with a reason.
- **Add expense** records operating, judge, volunteer, or SDDA remittance expenditure with payee and notes.
- Ledger records can be corrected. Waivers cannot be edited or deleted; use Restore fees. Completed trials must be reopened before finance changes.
- **Cash net** subtracts actual refunds and actual expenses only. Judge/SDDA estimates are displayed separately, avoiding double counting when those bills have been recorded.
- **Export Excel** includes entry balances, the ledger, summary, and judge estimates. **Print statement** uses the page's print layout.

## Checks before operational use

Local verification: production build; 61 SDDA tests; 45 schema contracts; six environment-safety tests. Isolated PostgreSQL execution also tested pricing, partial payment/waiver restoration, refund/edit/delete limits, failed-batch rollback, financial permission denial, direct-write RLS denial, and completed-trial protection.

The PostgreSQL test uses a minimal fixture schema, not a clone of live Supabase. Actual browser/payment acceptance testing is still required after applying the migration and deploying:

1. Check one accepted entry's fees against its selections.
2. Record a partial payment and verify the remaining balance.
3. Waive the balance, verify collections did not increase, then restore it.
4. Record one payment for a handler's two dogs and verify the allocations.
5. Test a credit/refund, an expense, Excel export, and print preview.

Reproduce isolated SQL tests without a cloud connection:
`node scripts/test-payment-database.mjs tmp/finance-validation/node_modules/@electric-sql/pglite/dist/index.js`

The isolated PGlite library is under ignored `tmp/`, not an application dependency. All implementation is on K. E was used only as a read-only workflow reference.
