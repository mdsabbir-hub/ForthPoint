# ForthPoint Equity Terminal: setup for a new project

Works for any new GitHub repository, Supabase project and Vercel project. Nothing in the code is tied to a particular name, URL or email. You can do every step from a phone browser.

## 0. You need
- A GitHub account, a Supabase account and a Vercel account (free plans are enough to start).
- This `forthpoint.zip` (the COMPLETE project), `fresh_install.sql`, and `unpack.yml`.

## 1. GitHub
1. Create a new, empty, private repository.
2. In the repository, choose Add file > Create new file. Name it `.github/workflows/unpack.yml` (type the slashes) and paste the contents of `unpack.yml`. Commit to `main`.
3. Choose Add file > Upload files, add `forthpoint.zip` at the repository root, and commit.
4. Open the Actions tab. "Unpack project" runs and finishes green in about a minute. The repository now holds the project files.
   If it fails, open the run and read the red line. It says if the zip was incomplete.

## 2. Supabase
1. Create a new project. Save the database password somewhere safe.
2. SQL Editor: paste the whole of `fresh_install.sql` and run it once. It creates every table, security rule, storage bucket and database function.
3. Authentication > Users > Add user. Enter your email and a strong password and tick Auto Confirm User.
4. SQL Editor, run (with your real email): `select public.grant_admin('you@example.com');`
5. Authentication > Sign In / Providers (or Settings): turn OFF new user sign-ups.
6. Project Settings > API: copy the Project URL, the anon (public) key and the service_role key.

## 3. Vercel
1. Add New > Project, import the repository. Framework: Next.js (detected automatically).
2. Before deploying, add these Environment Variables for Production, Preview and Development:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL (no trailing slash)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = the service_role key (Vercel only; never in GitHub or chat)
3. Deploy. After any later change to a variable, redeploy with "Use existing build cache" unticked.

## 4. First run
1. Open your Vercel address. The home page shows "Published companies: 0".
2. Go to /login and sign in with the email and password from step 2.3.
3. Companies: add a company (ticker, name, sector type).
4. Upload: choose a research workbook (.xlsx). Open the import to see extracted values and findings.
5. Compare and approve: errors block approval; warnings need acknowledgement.
6. Publish. The company then appears on the public site.

## 5. Self-tests (optional, recommended)
Run each file in `supabase/tests/` in the SQL Editor as ONE statement. Each ends with an intentional error that lists PASS or FAIL lines and rolls back its own data. Every line should say PASS.

## 6. Updating later
- Always upload the complete `forthpoint.zip`. Never a partial one.
- New project: only `fresh_install.sql` is needed.
- Existing database: run only the `phaseN_setup.sql` files newer than your last one (2, 3, 4 in order). Re-running is safe.

## 7. Troubleshooting
| What you see | Cause and fix |
|---|---|
| Vercel: "page.tsx doesn't have a root layout" | A partial zip was uploaded. Upload the complete zip. |
| "Application error" or "The site is not configured yet" | Environment variables missing or mistyped in this Vercel project. Fix, then redeploy without cache. |
| Actions tab shows "Get started" | The workflow file is not at `.github/workflows/unpack.yml` on `main`. |
| Sign in works but "You don't have access" | Run `select public.grant_admin('your email');`. |
| Upload says the company was not found | Add the company under Companies, then Re-process the import. |
| Cannot approve | Open the import: errors must be fixed in the workbook and the file uploaded again. |
| A Vercel build error | Send the first red lines of the build log. |

## 8. Security notes
- The service_role key lives only in Vercel environment variables.
- Keep sign-ups off. Create administrators by hand.
- Workbooks and report PDFs are stored in private buckets. Do not commit workbooks to GitHub (`*.xlsx` is already git-ignored).
- Public pages use an anonymous connection and only ever show published research.

## 9. What is and is not built
Built: sign-in and roles, workbook upload, validation, comparison, approval, atomic publish and rollback, audit log, public company directory, overview, financial statements, ratios and charts.
Not yet built: valuation, peers, thesis and report pages, bank and multi-company workbook mappings, user and role editing screens, data-quality dashboard.
