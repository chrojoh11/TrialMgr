# C-WAGS to SDDA workflow alignment

This review treats the C-WAGS application on `E:` as a read-only usability reference. SDDA TrialDesk implementation remains exclusively on `K:`. C-WAGS rules, branding, database objects, credentials, and deployment assumptions are not copied.

## Alignment principle

Reuse familiar secretary interaction patterns wherever the underlying action is the same. Preserve SDDA-native terminology, eligibility rules, official forms, calculations, and reporting whenever the organizations differ.

| Workflow | Reuse the C-WAGS interaction pattern | Keep SDDA-native |
| --- | --- | --- |
| Dashboard and sidebar | Expand a trial to expose its tools; keep Trial Details, Activity Journal, Entries, title review, live operations, summary/reporting, and finances in a predictable order; provide Copy Entry Link beside Entries. | SDDA names, colors, trial formats, Official Workbook, Trial Closeout, and separate official document steps. |
| Trial setup | One trial workspace with editable details, day assignments, offerings, fees, and a visible readiness checklist. Allow details and judges to be completed or substituted later. | One-to-four-day structure supported by TrialDesk; Started, Advanced, Excellent, Elite; Scent components; SDDA Games; per-offering FEO; Amateur/Working on the competitor selection rather than setup. |
| Entries | Search, status filter, card/roster view, direct secretary Edit Entry, status decision, spreadsheet export, and a secondary import action. Competitors may reload an entry with registration number plus matching email. | SDDA registration, component-level streams, Games details, formal alerts, reactivity, declaration, confirmation states, pricing, and Google Form CSV mapping. |
| Running order | Group by day/class, show conflicts and special handling, allow drag-and-drop, preserve manual order, and export a formatted XLSX. | SDDA running-order grouping and conflict rules; Official/Regular/Second dog/FEO/BIS placement; per-component move-ups; reactive value in export; Scent and Games distinctions. |
| Score sheets and score entry | Keep production and data entry adjacent in the workflow; support save-all and resuming corrections; clearly show the competitor and class. | Every official SDDA PDF template and its individual coordinate map; formal-alert placement; Games categories; SDDA qualifying logic and placements. Score Sheets and Score Entry remain separate because the paper sheets are official source records. |
| Title review | A pre-trial exception report rather than a registry-management screen; search/filter; visually separate ordinary history, title opportunity, already titled/must be Working, and ribbon planning. | SDDA title requirements, component-specific progress, Special Excellent, Working move-up rules, and the limits of available SDDA history. No competitor-reported Gold calculation. |
| Finances | Entry balances, collected amounts, outstanding amounts, transactions, expenses, refunds, judge breakdown, and a readable ledger. | SDDA entry pricing, remittance, judge compensation, Games versus Scent fees, and Canadian-dollar calculations. |
| Activity journal | Search and filter; show who performed an action; describe meaningful before/after changes; group one setup save or CSV import as one secretary-facing event. Hide database IDs and unchanged technical fields. | SDDA entity names and SDDA-specific snapshots. Preserve the immutable audit records underneath the streamlined presentation. |
| Results and closeout | Make the end-of-trial path sequential and obvious; validate completeness before final export. | SDDA placements, title calculations, official Trial Results Workbook, backups, and closeout checks. The workbook is downloaded for submission through the SDDA-required channel; TrialDesk does not submit it to an unrelated organization. |

## Current alignment status

- Sidebar order and per-trial expansion now closely follow the C-WAGS pattern.
- Trial Details provides the central setup workspace and direct operational links.
- Entries supports search, status decisions, editing, mailing export, CSV import, and verified public return-to-entry.
- Running Order supports drag-and-drop and the original SDDA-style XLSX export.
- Activity Journal supports search/filter and groups offerings and CSV imports into secretary-facing events.
- Finances provides automatic entry balances, payments, expenses, SDDA fees, and judge compensation.
- SDDA-specific Score Sheets, Score Entry, Results, Official Workbook, and Closeout are intentionally separate steps.

## Remaining usability alignment priorities

1. Add a compact workflow/status strip on Trial Details showing Setup → Entries → Running Order → Score Sheets → Score Entry → Results → Workbook → Closeout.
2. Give Entries the same quick operational summary as C-WAGS: totals by Received, Accepted, Waitlisted, and Rejected, plus balances where useful.
3. Add day/class search or filters to Running Order when a large trial makes the page long, while preserving drag-and-drop within valid SDDA groups.
4. Add Activity Journal date filtering and clearer action categories, matching the C-WAGS journal without exposing database internals.
5. Add financial XLSX export with the same readable statement structure as C-WAGS, using SDDA calculations.
6. Add a secretary-facing trial summary that consolidates readiness, entry counts, unresolved conflicts, missing scores, ribbon forecast, finances, and workbook status.

## Explicit non-reuse boundary

Do not copy C-WAGS Supabase tables, credentials, service-role behavior, Vercel configuration, registry data, rules, classes, score calculations, forms, logos, exports, or organization-specific wording into SDDA TrialDesk.
