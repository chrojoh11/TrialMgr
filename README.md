# C-WAGS Trial Management System

A full-featured web application for managing **C-WAGS (Canine-Work And GameS)** dog sport competitions. Handles the complete trial lifecycle: trial creation, public entry submissions, live scoring, financial tracking, title progress, and reporting.

---

## Table of Contents

- [Overview](#overview)
- [User Roles](#user-roles)
- [Tech Stack](#tech-stack)
- [Features](#features)
- [Directory Structure](#directory-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [NPM Scripts](#npm-scripts)
- [Key Workflows](#key-workflows)
- [Database Schema](#database-schema)
- [Business Rules](#business-rules)

---

## Overview

C-WAGS trials are multi-day, multi-class dog sport competitions (scent work, rally, obedience, games). This system allows:

- **Trial Secretaries** to create and manage trials, process entries, run live scoring, and track finances.
- **Administrators** to oversee all trials, manage the judge/dog registry, merge duplicates, run reports, and import historical data.
- **Public Handlers** to submit entries online via a shareable trial link — no account required.

---

## User Roles

| Role | Capabilities |
|------|-------------|
| **Administrator** | All trials system-wide, judge & registry management, all reporting, data import/export, user management |
| **Trial Secretary** | Own trials only — create trials, process entries, score live, track financials, generate reports |
| **Public Handler** | Submit entries via public link, view trial details, no login required |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript 5.9 |
| Styling | Tailwind CSS 3.4 + Radix UI primitives |
| Forms | React Hook Form 7 + Zod 4 validation |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + NextAuth 4 |
| Date/Time | date-fns 4 + date-fns-tz 3 |
| Excel Export | xlsx-js-style 1.2 (styled workbooks) |
| PDF Export | pdf-lib 1.17 |
| Email | Nodemailer 7 |
| Icons | Lucide React |
| Notifications | React Hot Toast |

---

## Features

### Trial Management
- **Multi-step creation wizard** — Basic info → Days → Classes/Levels → Rounds → Summary
- **Trial statuses**: Draft → Published → Active → Closed → Completed
- **Multi-day support** with per-day class configuration
- **Class types**: Scent Work, Rally, Obedience, Games, Zoom
- **Fee configuration** per class with separate FEO pricing
- **Entry deadline management** with late-entry support
- **Shareable public entry links** (no handler login required)

### Entry Management
- Public entry form with CWAGS number lookup/validation
- Per-class selection with division (A, B, Trial Official, Junior) and jump height
- FEO (Field Event Only) entries per round
- Volunteer preference collection
- "Close to Titles" self-reporting by handlers
- Withdraw / no-show / re-enter support
- Full activity journal with point-in-time snapshots for audit trail

### Live Scoring
- Running order display per class/round
- Drag-and-drop reordering during the trial
- Score entry by class type:
  - **Scent**: Hides found (1–4), faults (1–2), pass/fail
  - **Numerical**: Raw score + pass/fail (Rally, Obedience)
- Reset rounds with alternate judge support
- Digital scoring — no paper required

### Financial Tracking
- Expense recording by category (Hall Rental, Judge Fees, Ribbons, Insurance, Miscellaneous)
- Payment methods: Cash, Cheque, E-Transfer, Card, PayPal
- Per-handler balance tracking with payment history
- Fee waiver recording with reason (audited)
- Refund / negative payment support
- Break-even analysis — minimum entries to cover costs
- **Excel export** with full styling (bold headers, currency formatting, colour-coded columns, SUM formulas)

### Registry & Titles
- Dog/handler registry with CWAGS number lookup
- Title progress tracking per dog per class level:
  - Qualifying runs (Qs) counted
  - Different judges verified
  - Ace progress (10 Qs post-title)
  - Master title combinations
- "Close to Titles" report per trial — identifies dogs near earning a title
- Performance history by dog across all trials

### Reporting & Export
- **Entries Excel export** — Handler, Email, Phone, Dogs, Runs, Balance Owing (bold 14pt headers, auto column widths, phone text format, currency format)
- **Financials Excel export** — Handler financials with opening balance, payments, refunds, waivers, balance owing
- **Class Summary Excel export** — Entries and pass rates per class
- **All-Trials Summary** (admin) — System-wide statistics across all clubs and trials
- **Class Statistics** (admin) — Pass rates and entry counts per class and judge
- **Score Sheets PDF** — Printable score sheets per class
- **Titles CSV** — Handlers close to titles at a given trial

### Administration
- Trial assignment (assign secretaries to trials)
- Judge compensation tracking and reporting
- Duplicate dog/handler merger tool
- Bulk registry import from Excel (`.xlsx`)
- Trial data import from external spreadsheets
- Activity journal with searchable filter by type, date, and handler

---

## Directory Structure

```
src/
├── app/                          # Next.js App Router
│   ├── dashboard/                # Authenticated area
│   │   ├── page.tsx              # Role-based dashboard (Admin or Secretary)
│   │   ├── trials/
│   │   │   ├── create/           # Trial creation wizard (multi-step)
│   │   │   ├── drafts/           # Draft trial management
│   │   │   └── [trialId]/
│   │   │       ├── entries/      # Entry list & management
│   │   │       ├── financials/   # Expenses, payments, break-even
│   │   │       ├── live-event/   # Live scoring interface
│   │   │       ├── journal/      # Activity log
│   │   │       ├── close-to-titles/
│   │   │       └── time-calculator/
│   │   ├── admin/
│   │   │   ├── all-trials-summary/
│   │   │   ├── class-statistics/
│   │   │   ├── judge-compensation/
│   │   │   ├── registry/         # Dog registry browser & import
│   │   │   ├── trial-assignments/
│   │   │   ├── merge-duplicates/
│   │   │   └── import-trial/
│   │   └── judges/               # Judge statistics
│   ├── entries/[trialId]/        # Public entry submission form
│   ├── login/                    # Login, register, reset-password
│   ├── auth/callback/            # Supabase OAuth callback
│   ├── api/
│   │   ├── admin/                # Import & merge endpoints
│   │   ├── public/               # Unauthenticated trial info
│   │   └── registry/             # Registry import endpoint
│   └── layout.tsx / page.tsx     # Root layout & landing page
│
├── components/
│   ├── ui/                       # Reusable UI primitives (Button, Card, Dialog, etc.)
│   ├── layout/                   # MainLayout, Header, Sidebar, Breadcrumbs
│   ├── dashboard/                # AdminDashboard, SecretaryDashboard
│   ├── trials/                   # DigitalScoreEntry, CloseToTitlesReport
│   ├── admin/                    # DuplicateMergerUI, DogPerformanceHistory
│   ├── financials/               # BreakEvenTab
│   ├── public/                   # TrialEntryHero, ShareableEntryLink
│   └── auth/                     # AuthGuard
│
├── lib/                          # Business logic & data access
│   ├── supabaseBrowser.ts        # Client Supabase instance
│   ├── supabaseServer.ts         # Server Supabase instance
│   ├── trialOperationsSimple.ts  # Trial CRUD
│   ├── financialOperations.ts    # Payments, expenses, balances
│   ├── breakEvenOperations.ts    # Break-even calculations
│   ├── registryOperations.ts     # Dog registry & title tracking
│   ├── journalLogger.ts          # Audit log with snapshots
│   ├── titleRequirements.ts      # Title qualification rules
│   ├── cwagsBusiness.ts          # Deadline & fee logic
│   ├── cwagsClassNames.ts        # Canonical class ordering
│   ├── divisionUtils.ts          # Division grouping (A/B/TO/JR)
│   ├── financialUtils.ts         # Balance calculations
│   ├── closeToTitlesAnalyzer.ts  # Title proximity analysis
│   ├── exportScoreSheetsPDF.ts   # PDF score sheet generation
│   ├── permissions.ts            # Role-based access helpers
│   └── utils.ts                  # General utilities
│
├── hooks/
│   ├── useAuth.ts                # User session hook
│   └── useTrialTimezone.ts       # Timezone context hook
│
├── types/
│   ├── database.ts               # Supabase-generated types
│   ├── auth.ts                   # User/role types
│   ├── forms.ts                  # Form schema types
│   └── judge.ts                  # Judge types
│
├── scripts/                      # One-time data scripts (run via tsx)
│   ├── migrate-registry.ts       # Import dog registry from Excel
│   ├── populate-judges.ts        # Seed judge database
│   └── analyzeSkippedRows.ts     # Debug import issues
│
└── middleware.ts                 # Auth token & recovery link handling
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project with the required tables
- npm or yarn

### Installation

```bash
git clone <repo-url>
cd TrialMgr
npm install
```

### Development Server

```bash
npm run dev
# Open http://localhost:3000
```

### Production Build

```bash
npm run build
npm start
```

---

## Environment Variables

Create a `.env.local` file in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-random-secret

# Site
NEXT_PUBLIC_SITE_URL=https://your-production-domain.com
```

> SDDA TrialDesk must not be configured with a Supabase service-role key. Runtime database access uses the dedicated SDDA project's publishable key, authenticated sessions, and row-level security.

---

## NPM Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test:supabase` | Verify Supabase connection |
| `npm run test:judge-insert` | Test judge insertion and clean up the test records |

---

## Key Workflows

### 1. Creating a Trial
1. Secretary logs in and clicks **Create New Trial**
2. Wizard step 1 — Trial name, club, location, dates, time zone, type
3. Step 2 — Add trial days (one or more days)
4. Step 3 — Add classes per day (name, type, fee, max entries)
5. Step 4 — Assign judges and configure rounds (FEO available, reset judge)
6. Step 5 — Review and publish → trial becomes publicly accessible

### 2. Submitting an Entry (Public)
1. Handler visits the shareable trial link (no login required)
2. Enters their CWAGS number — system looks up dog/handler details
3. Selects classes, division, and jump height for each dog
4. Optionally selects FEO for applicable rounds
5. Provides contact info, volunteer preferences, and "close to titles" notes
6. Accepts the waiver and submits
7. Activity journal entry is created with a full snapshot

### 3. Running a Live Trial
1. Secretary opens the **Live Event** page for the trial
2. Selects a class and round
3. Reviews and optionally reorders the running order (drag-and-drop)
4. As each dog runs, enters the score:
   - Scent: hides found, faults, pass/fail
   - Numerical: score, pass/fail
5. Scores are saved in real time

### 4. Recording Payments
1. Secretary opens **Financials** for the trial
2. Selects a competitor and enters payment amount and method
3. System updates balance owing automatically
4. Refunds are entered as negative amounts
5. Fee waivers are applied with a reason (logged to journal)
6. Break-even tab shows whether the trial covers its costs

### 5. Generating Reports
1. From the trial page, click **Export Entries Excel** for the handler list with balances
2. From Financials, click **Export to Excel** for the full financial summary
3. From Live Event, export **Score Sheets PDF** for printed scoring
4. From admin, view **All-Trials Summary** for system-wide analytics

---

## Database Schema

| Table | Description |
|-------|------------|
| `users` | System users — secretaries and admins |
| `trials` | Trial events with status, dates, and fee configuration |
| `trial_days` | Individual days within a trial |
| `trial_classes` | Classes offered per day (name, type, fee, max entries) |
| `trial_rounds` | Judge assignments per class with optional reset judge |
| `entries` | Handler/dog entry records with status (confirmed, withdrawn, no-show) |
| `entry_selections` | Per-class selections within an entry (division, jump height, entry type) |
| `scores` | Scoring records per entry selection |
| `judges` | Judge registry (certification levels, pay rates) |
| `cwags_registry` | Dog registry (CWAGS numbers, handler names, active status) |
| `trial_expenses` | Trial cost records by category |
| `trial_payments` | Payment records per entry (positive = paid, negative = refund) |
| `trial_activity_log` | Full audit trail with JSONB snapshots of every significant change |
| `system_config` | Key/value configuration store |

---

## Business Rules

| Rule | Detail |
|------|--------|
| Entry deadline | 7 days before trial date (calculated in trial timezone) |
| Late entries | Open 1 day after the regular deadline |
| Title requirements | 4 qualifying runs under at least 2 different judges (varies by class) |
| Ace title | 10 Qs earned after the initial title is achieved |
| Master title | Combination of multiple Ace titles depending on class |
| Divisions | Obedience and Rally require a division: A, B, Trial Official (TO), or Junior Handler (JR) |
| FEO entries | Available only on rounds where the judge has enabled it |
| Class order | All classes display in a canonical C-WAGS-defined order |
| Fee waivers | Require a written reason; change is logged to the activity journal |
| Balance formula | Opening Balance − Payments Received + Refunds Issued − Fees Waived |
