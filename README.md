# ForthPoint Equity Terminal

Equity research platform: Excel workbooks in, reviewed and approved research out.
Stack: Next.js (App Router), TypeScript, Tailwind, Supabase (Postgres, Auth, Storage), Vercel.

## Status: Phase 4 (public company pages and charts)
Done: foundation (Phase 1), workbook import and validation (Phase 2), comparison with the published version, approve / reject, atomic publish, rollback, audit trail (Phase 3).
Phase 4 adds the public site: home, company directory with search, company overview, financial statements and ratios with Recharts charts.
Not yet built: valuation, DCF, peers, thesis and reports pages (Phase 5), the data-quality dashboard.
Type A (integrated multi-company) workbooks are detected but have no mapping template yet.

## Setup
See `SETUP.md` for a full step-by-step guide for a NEW GitHub repository, Supabase project and Vercel project.
New database: run `supabase/fresh_install.sql` once, then `select public.grant_admin('you@example.com');`.
Local: `cp .env.example .env.local`, `npm install`, `npm run dev`.

## Phase 2 setup
1. Existing database only: run `supabase/phase2_setup.sql` (migration 006). New databases already have it in `fresh_install.sql`.
2. Admin: Companies, add the ticker (e.g. BATBC) before importing its workbook.
3. Admin: Upload, choose the .xlsx files. Each becomes an import with a draft snapshot; nothing is published.

Import flow: browser uploads straight to the private `company-workbooks` bucket (signed URL, avoids the 4.5 MB serverless body limit), then the server checks the file content, rejects duplicates by SHA-256, reads values and saved formula results (no recalculation), validates, and stores a draft snapshot.

## Phase 3 setup
1. Existing database only: run `supabase/phase3_setup.sql` (migration 007).
2. Optional self-test: run `supabase/tests/phase3_workflow_test.sql`. It rolls back everything and returns one row per check, all `ok = true`.

Workflow: Upload, Process (draft snapshot), Compare, Review, Approve, Publish. Errors block approval. Warnings need an explicit acknowledgement. Approve, reject, publish and rollback run as database functions in one transaction and are callable only by the server. Reviewers can inspect and comment but cannot approve or publish.

## Phase 4 setup
1. Existing database only: run `supabase/phase4_setup.sql` (migration 008). It limits what anonymous visitors can read.
2. Self-test: run `supabase/tests/phase4_public_test.sql` as one statement; 12 lines should say PASS.
3. Supabase, Authentication: turn off new sign-ups (administrators are created by hand).

Public pages use an anonymous client with no login session, so they show only the currently published research, even when an administrator is signed in. Unpublished companies return 404. Missing figures show as n/a or Data unavailable and are never drawn as zero.

## Checks
`npm run typecheck` · `npm run lint` · `npm test`

## Security notes
- Service-role key is used only in `src/lib/supabase/admin.ts` (server-only).
- Public users read only records whose snapshot is the current publication (RLS).
- Never commit `.env*` files or real workbooks (`*.xlsx` is git-ignored).
