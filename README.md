# SDDA TrialDesk

SDDA TrialDesk is a secretary application for Sporting Detection Dogs Association trials. It supports one-to-four-day Scent, Games, and combined trials while preserving an offline-friendly operational workflow.

## Current scope

- Started, Advanced, Excellent, and Elite
- Container, Interior, and Exterior
- Amateur and Working streams per selected run
- SDDA Games: Aerial, Distance, Speed, and Team
- Built-in public entry form and Google Forms CSV import
- Entry review, controlled competitor editing, and private receipt links
- SDDA running-order rules, conflict checks, drag-and-drop ordering, FEO, officials, second dogs, and BIS
- Component-specific move-ups
- Official component-specific score-sheet PDF mapping
- Official SDDA Trial Workbook export
- Title Watch using the latest public SDDA dog-history workbook
- Competitor-reported, explicitly unverified Gold-count snapshots
- Financial ledger, mailing-list export, backups, and permanent audit records

## Architecture and database safety

The application is a Next.js client backed by the dedicated `SDDA-Trialdesk` Supabase project (`hsxwwtvzfulxdqimkgcc`). Access is controlled by Supabase authentication and row-level security.

The production build validates its environment before compiling:

- `SUPABASE_SERVICE_ROLE_KEY` is forbidden.
- A configured Supabase URL must point to the dedicated SDDA project.
- Local `.env*` files are ignored by Git.

Required deployment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Do not configure a Supabase service-role key in Vercel or local development.

## Local development

```bash
npm install
npm run dev
```

The default development URL is `http://localhost:3000`.

## Verification

```bash
npm run test:environment-safety
npm run test:sdda-schema
npm run test:sdda
npm run build
```

## Database migrations

SDDA migrations are stored in `supabase/sdda-migrations/`. The production application currently expects migrations through `20260820_0023_reported_gold_snapshots.sql`. Applied production migrations are recorded in `supabase/sdda-migrations/APPLIED.md`.

## Deployment

The intended production stack is:

- GitHub repository: `chrojoh11/TrialMgr`
- Vercel project: `trial-mgr`
- Supabase project: `SDDA-Trialdesk`

Before deploying, confirm that Vercel contains only the dedicated SDDA public URL and publishable/anonymous key. Supabase schema migrations must be applied separately; a Vercel deployment does not run them automatically.
