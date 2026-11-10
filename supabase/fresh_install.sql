-- ForthPoint fresh install. Paste this whole file into a NEW Supabase project (SQL Editor) and run it once.
-- Then create your login under Authentication > Users and run:  select public.grant_admin('you@example.com');

-- ===== 001_core_admin.sql =====
-- 001: core master data, administration, helper functions
create type public.app_role as enum ('admin', 'reviewer', 'publisher');

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
create index user_roles_user_idx on public.user_roles(user_id);
create table public.bootstrap_admins (email text primary key);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);

create or replace function public.has_role(_role public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = _role)
$$;
create or replace function public.has_any_role() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid())
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
    on conflict (id) do nothing;
  if exists (select 1 from public.bootstrap_admins b where lower(b.email) = lower(new.email)) then
    insert into public.user_roles (user_id, role) values (new.id, 'admin') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sector_type text not null default 'industrial' check (sector_type in ('industrial','bank','insurance','other')),
  created_at timestamptz not null default now()
);
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  short_name text,
  sector_id uuid references public.sectors(id),
  exchange text not null default 'DSE',
  country text not null default 'BD',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_sector_idx on public.companies(sector_id);
create trigger companies_updated before update on public.companies for each row execute function public.set_updated_at();

create table public.securities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ticker text not null unique,
  exchange text not null default 'DSE',
  isin text unique,
  currency text not null default 'BDT',
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);
create index securities_company_idx on public.securities(company_id);
create unique index securities_one_primary on public.securities(company_id) where is_primary;

create table public.company_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  description text,
  website text,
  founded_year int,
  headquarters text,
  updated_at timestamptz not null default now()
);

-- ===== 002_import_publication.sql =====
-- 002: import pipeline and publication versioning
create table public.workbook_templates (
  id uuid primary key default gen_random_uuid(),
  workbook_type text not null check (workbook_type in ('TYPE_A','TYPE_B')),
  version int not null,
  name text not null,
  is_active boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workbook_type, version)
);
create table public.worksheet_mappings (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workbook_templates(id) on delete cascade,
  sheet_rule text not null,
  header_row int,
  data_start_row int,
  metric_code text,
  company_rule jsonb not null default '{}'::jsonb,
  period_rule jsonb not null default '{}'::jsonb,
  currency text,
  unit text,
  classification text check (classification in ('reported','calculated','normalized','estimated')),
  source_cell text,
  created_at timestamptz not null default now()
);
create index worksheet_mappings_template_idx on public.worksheet_mappings(template_id);

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid,
  company_id uuid references public.companies(id),
  template_id uuid references public.workbook_templates(id),
  status text not null default 'uploaded'
    check (status in ('uploaded','processing','needs_review','approved','rejected','published','failed')),
  error_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index import_jobs_company_idx on public.import_jobs(company_id);
create index import_jobs_batch_idx on public.import_jobs(batch_id);
create index import_jobs_status_idx on public.import_jobs(status);
create trigger import_jobs_updated before update on public.import_jobs for each row execute function public.set_updated_at();

create table public.import_files (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  storage_bucket text not null default 'company-workbooks',
  storage_path text not null unique,
  original_filename text not null,
  mime_type text,
  size_bytes bigint not null,
  sha256 text not null,
  created_at timestamptz not null default now()
);
-- Duplicate-import prevention: the same file content cannot be registered twice.
create unique index import_files_sha256_uniq on public.import_files(sha256);

create table public.import_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  import_job_id uuid not null references public.import_jobs(id),
  version_no int not null,
  status text not null default 'draft'
    check (status in ('draft','approved','rejected','published','superseded')),
  created_at timestamptz not null default now(),
  unique (company_id, version_no)
);
create index import_snapshots_company_idx on public.import_snapshots(company_id);
create index import_snapshots_job_idx on public.import_snapshots(import_job_id);

create table public.import_records (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.import_snapshots(id) on delete cascade,
  sheet_name text not null,
  cell_ref text not null,
  raw_value jsonb,
  formula_text text,
  has_cached_value boolean,
  created_at timestamptz not null default now()
);
create index import_records_snapshot_idx on public.import_records(snapshot_id);

create table public.import_validation_issues (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  snapshot_id uuid references public.import_snapshots(id) on delete cascade,
  severity text not null check (severity in ('ERROR','WARNING','INFO')),
  code text not null,
  message text not null,
  sheet_name text,
  cell_ref text,
  resolution text,
  created_at timestamptz not null default now()
);
create index import_issues_job_idx on public.import_validation_issues(import_job_id);

create table public.import_diffs (
  id uuid primary key default gen_random_uuid(),
  new_snapshot_id uuid not null references public.import_snapshots(id) on delete cascade,
  old_snapshot_id uuid references public.import_snapshots(id),
  change_type text not null check (change_type in
    ('added','changed','removed','period','unit','classification','formula','source','sheet_added','sheet_removed')),
  metric_code text,
  reporting_period_id uuid,
  old_value numeric,
  new_value numeric,
  absolute_change numeric,
  percent_change numeric,
  decision text not null default 'pending' check (decision in ('pending','approved','rejected')),
  review_comment text,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index import_diffs_new_idx on public.import_diffs(new_snapshot_id);

create table public.publication_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  snapshot_id uuid not null references public.import_snapshots(id),
  is_current boolean not null default false,
  published_by uuid references auth.users(id),
  published_at timestamptz not null default now(),
  rolled_back_from uuid references public.publication_versions(id),
  notes text
);
create index publication_company_idx on public.publication_versions(company_id);
create index publication_snapshot_idx on public.publication_versions(snapshot_id);
-- Exactly one current publication per company.
create unique index publication_one_current on public.publication_versions(company_id) where is_current;

create or replace function public.is_company_published(_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.publication_versions where company_id = _company and is_current)
$$;
create or replace function public.is_published_snapshot(_snapshot uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.publication_versions where snapshot_id = _snapshot and is_current)
$$;

-- ===== 003_financial_research.sql =====
-- 003: financial, market, valuation, research tables
create table public.reporting_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_type text not null check (period_type in ('annual','half','quarterly')),
  fiscal_year int not null,
  period_end date not null,
  label text not null,
  is_forecast boolean not null default false,
  unique (company_id, period_type, period_end)
);
create index reporting_periods_company_idx on public.reporting_periods(company_id);

create table public.metric_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null,
  default_unit text,
  sector_type text not null default 'all' check (sector_type in ('all','industrial','bank','insurance')),
  created_at timestamptz not null default now()
);
create table public.financial_sources (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.import_snapshots(id) on delete cascade,
  workbook_name text not null,
  sheet_name text,
  cell_ref text,
  formula_text text,
  data_date date
);
create index financial_sources_snapshot_idx on public.financial_sources(snapshot_id);

create table public.financial_statements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_id uuid not null references public.import_snapshots(id) on delete cascade,
  reporting_period_id uuid not null references public.reporting_periods(id),
  statement_type text not null check (statement_type in ('income','balance_sheet','cash_flow')),
  currency text not null,
  unit text not null,
  unique (snapshot_id, reporting_period_id, statement_type)
);
create index financial_statements_company_idx on public.financial_statements(company_id);

create table public.financial_metrics (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_id uuid not null references public.import_snapshots(id) on delete cascade,
  reporting_period_id uuid not null references public.reporting_periods(id),
  metric_id uuid not null references public.metric_definitions(id),
  value numeric,  -- NULL means missing. Never zero-filled.
  currency text,
  unit text not null,
  classification text not null check (classification in ('reported','calculated','normalized','estimated')),
  is_forecast boolean not null default false,
  source_id uuid references public.financial_sources(id),
  formula_text text,
  unique (snapshot_id, reporting_period_id, metric_id)
);
create index financial_metrics_company_idx on public.financial_metrics(company_id);
create index financial_metrics_period_idx on public.financial_metrics(reporting_period_id);
create index financial_metrics_metric_idx on public.financial_metrics(metric_id);
create index financial_metrics_snapshot_idx on public.financial_metrics(snapshot_id);

-- Market data: shared reference data keyed by security, reusable by future modules.
create table public.market_prices (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references public.securities(id) on delete cascade,
  price_date date not null,
  close_price numeric not null,
  currency text not null default 'BDT',
  source text not null,
  unique (security_id, price_date)
);
create table public.market_volume (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references public.securities(id) on delete cascade,
  trade_date date not null,
  volume bigint,
  source text not null,
  unique (security_id, trade_date)
);
create table public.corporate_actions (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references public.securities(id) on delete cascade,
  action_type text not null,
  ex_date date,
  details jsonb not null default '{}'::jsonb
);
create table public.dividends (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references public.securities(id) on delete cascade,
  fiscal_year int not null,
  dividend_type text not null check (dividend_type in ('cash','stock')),
  amount_per_share numeric,
  ex_date date,
  source text,
  unique (security_id, fiscal_year, dividend_type)
);
create index market_prices_security_idx on public.market_prices(security_id);
create index corporate_actions_security_idx on public.corporate_actions(security_id);
create index dividends_security_idx on public.dividends(security_id);

-- Valuation (snapshot-scoped)
create table public.valuation_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_id uuid not null references public.import_snapshots(id) on delete cascade,
  valuation_date date,
  currency text, unit text,
  market_price numeric, market_cap numeric, enterprise_value numeric,
  equity_value numeric, target_price numeric,
  recommendation text
);
create table public.valuation_multiples (
  id uuid primary key default gen_random_uuid(),
  valuation_snapshot_id uuid not null references public.valuation_snapshots(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_id uuid not null references public.import_snapshots(id) on delete cascade,
  multiple_code text not null, value numeric, reporting_period_id uuid references public.reporting_periods(id),
  classification text check (classification in ('reported','calculated','normalized','estimated'))
);
create table public.dcf_models (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_id uuid not null references public.import_snapshots(id) on delete cascade,
  wacc numeric, terminal_growth numeric, enterprise_value numeric, equity_value numeric,
  per_share_value numeric, currency text, unit text
);
create table public.dcf_forecasts (
  id uuid primary key default gen_random_uuid(),
  dcf_model_id uuid not null references public.dcf_models(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_id uuid not null references public.import_snapshots(id) on delete cascade,
  reporting_period_id uuid not null references public.reporting_periods(id),
  free_cash_flow numeric, discount_factor numeric, present_value numeric
);
create table public.valuation_scenarios (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_id uuid not null references public.import_snapshots(id) on delete cascade,
  scenario text not null check (scenario in ('bull','base','bear')),
  target_price numeric, assumptions jsonb not null default '{}'::jsonb,
  unique (snapshot_id, scenario)
);
create table public.valuation_sensitivities (
  id uuid primary key default gen_random_uuid(),
  dcf_model_id uuid not null references public.dcf_models(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_id uuid not null references public.import_snapshots(id) on delete cascade,
  wacc numeric not null, terminal_growth numeric not null, per_share_value numeric
);
create table public.peer_comparisons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_id uuid not null references public.import_snapshots(id) on delete cascade,
  peer_company_id uuid references public.companies(id),
  peer_label text, metric_code text not null, value numeric, unit text
);

-- Research (snapshot-scoped)
create table public.research_thesis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_id uuid not null references public.import_snapshots(id) on delete cascade,
  business_overview text, industry_overview text, competitive_position text,
  governance text, thesis text, recommendation text
);
create table public.risks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_id uuid not null references public.import_snapshots(id) on delete cascade,
  title text not null, description text, severity text
);
create table public.catalysts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_id uuid not null references public.import_snapshots(id) on delete cascade,
  title text not null, description text, expected_date date
);
create table public.management_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_id uuid not null references public.import_snapshots(id) on delete cascade,
  person_name text not null, role_title text, summary text
);
create table public.forthpoint_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_id uuid not null references public.import_snapshots(id) on delete cascade,
  total_score numeric, scale_max numeric
);
create table public.forthpoint_score_components (
  id uuid primary key default gen_random_uuid(),
  score_id uuid not null references public.forthpoint_scores(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_id uuid not null references public.import_snapshots(id) on delete cascade,
  component text not null, score numeric, weight numeric
);
create table public.research_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_id uuid references public.import_snapshots(id),
  title text not null, author text, report_date date,
  executive_summary text, pdf_bucket text, pdf_path text,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['valuation_snapshots','valuation_multiples','dcf_models','dcf_forecasts','valuation_scenarios',
    'valuation_sensitivities','peer_comparisons','research_thesis','risks','catalysts','management_profiles',
    'forthpoint_scores','forthpoint_score_components'] loop
    execute format('create index %I on public.%I(company_id)', t || '_company_idx', t);
    execute format('create index %I on public.%I(snapshot_id)', t || '_snapshot_idx', t);
  end loop;
end $$;
create index research_reports_company_idx on public.research_reports(company_id);

-- ===== 004_rls_storage.sql =====
-- 004: Row Level Security and private storage
do $$
declare t text;
begin
  -- Enable RLS everywhere
  foreach t in array array[
    'profiles','user_roles','bootstrap_admins','audit_logs','sectors','companies','securities','company_profiles',
    'workbook_templates','worksheet_mappings','import_jobs','import_files','import_snapshots','import_records',
    'import_validation_issues','import_diffs','publication_versions','reporting_periods','metric_definitions',
    'financial_sources','financial_statements','financial_metrics','market_prices','market_volume','corporate_actions',
    'dividends','valuation_snapshots','valuation_multiples','dcf_models','dcf_forecasts','valuation_scenarios',
    'valuation_sensitivities','peer_comparisons','research_thesis','risks','catalysts','management_profiles',
    'forthpoint_scores','forthpoint_score_components','research_reports'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- Staff (any role) can read private import/admin tables; only admin can write them.
  foreach t in array array[
    'workbook_templates','worksheet_mappings','import_jobs','import_files','import_snapshots','import_records',
    'import_validation_issues','import_diffs','financial_sources'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.has_any_role())', t||'_staff_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_role(''admin'')) with check (public.has_role(''admin''))', t||'_admin_write', t);
  end loop;

  -- Master and reference data: public read for companies with a current publication; admin write.
  foreach t in array array['sectors','metric_definitions','market_prices','market_volume','corporate_actions','dividends'] loop
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t||'_public_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_role(''admin'')) with check (public.has_role(''admin''))', t||'_admin_write', t);
  end loop;

  -- Snapshot-scoped research data: public only when its snapshot is the current publication.
  foreach t in array array[
    'financial_statements','financial_metrics','valuation_snapshots','valuation_multiples','dcf_models','dcf_forecasts',
    'valuation_scenarios','valuation_sensitivities','peer_comparisons','research_thesis','risks','catalysts',
    'management_profiles','forthpoint_scores','forthpoint_score_components'] loop
    execute format('create policy %I on public.%I for select to anon, authenticated using (public.is_published_snapshot(snapshot_id))', t||'_public_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_any_role())', t||'_staff_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_role(''admin'')) with check (public.has_role(''admin''))', t||'_admin_write', t);
  end loop;
end $$;

-- companies / securities / profiles / periods: visible publicly only when the company is published
create policy companies_public_read on public.companies for select to anon, authenticated
  using (public.is_company_published(id));
create policy companies_staff_read on public.companies for select to authenticated using (public.has_any_role());
create policy companies_admin_write on public.companies for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy securities_public_read on public.securities for select to anon, authenticated
  using (public.is_company_published(company_id));
create policy securities_staff_read on public.securities for select to authenticated using (public.has_any_role());
create policy securities_admin_write on public.securities for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy company_profiles_public_read on public.company_profiles for select to anon, authenticated
  using (public.is_company_published(company_id));
create policy company_profiles_staff_read on public.company_profiles for select to authenticated using (public.has_any_role());
create policy company_profiles_admin_write on public.company_profiles for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy reporting_periods_public_read on public.reporting_periods for select to anon, authenticated
  using (public.is_company_published(company_id));
create policy reporting_periods_staff_read on public.reporting_periods for select to authenticated using (public.has_any_role());
create policy reporting_periods_admin_write on public.reporting_periods for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- publication_versions: public may see only the current row; staff see all; admin/publisher write.
create policy publication_public_read on public.publication_versions for select to anon, authenticated using (is_current);
create policy publication_staff_read on public.publication_versions for select to authenticated using (public.has_any_role());
create policy publication_publish_write on public.publication_versions for all to authenticated
  using (public.has_role('admin') or public.has_role('publisher'))
  with check (public.has_role('admin') or public.has_role('publisher'));

-- research_reports: public only when published
create policy reports_public_read on public.research_reports for select to anon, authenticated
  using (is_published and public.is_company_published(company_id));
create policy reports_staff_read on public.research_reports for select to authenticated using (public.has_any_role());
create policy reports_admin_write on public.research_reports for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- Administration tables
create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_admin_read on public.profiles for select to authenticated using (public.has_role('admin'));
create policy user_roles_self_read on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy user_roles_admin_all on public.user_roles for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.has_role('admin'));
-- bootstrap_admins: no policies = no client access (service role / SQL editor only)
-- audit_logs inserts happen server-side with the service role.

-- Private storage buckets (no public access)
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('company-workbooks', 'company-workbooks', false, 26214400),
  ('company-reports', 'company-reports', false, 26214400),
  ('company-attachments', 'company-attachments', false, 26214400)
on conflict (id) do update set public = false;
-- No storage.objects policies for anon: files are reached only via server-issued, short-lived signed URLs.

-- ===== 005_bootstrap_admin.sql =====
-- 005: first-administrator helper (safe to re-run).
-- After creating your login under Authentication > Users, run:
--     select public.grant_admin('you@example.com');
create or replace function public.grant_admin(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from auth.users where lower(email) = lower(p_email);
  if v is null then
    raise exception 'No user with email %. Create the user under Authentication > Users first.', p_email;
  end if;
  insert into public.profiles (id, email) values (v, p_email) on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (v, 'admin') on conflict do nothing;
  return 'Administrator role granted to ' || p_email;
end $$;
revoke all on function public.grant_admin(text) from public, anon, authenticated;

-- ===== 006_phase2_import.sql =====
-- 006: Phase 2 import support (safe to re-run)
alter table public.import_jobs add column if not exists original_filename text;
alter table public.import_jobs add column if not exists workbook_type text;
alter table public.import_jobs add column if not exists detected_ticker text;
alter table public.import_jobs add column if not exists storage_path text;
alter table public.import_jobs add column if not exists summary jsonb not null default '{}'::jsonb;

insert into public.sectors (code, name, sector_type) values
  ('INDUSTRIAL', 'Industrial and consumer companies', 'industrial'),
  ('BANK', 'Banks', 'bank'),
  ('INSURANCE', 'Insurance companies', 'insurance')
on conflict (code) do nothing;

insert into public.metric_definitions (code, name, category, default_unit, sector_type) values
  ('REVENUE','Revenue','income','money','all'), ('COGS','Cost of goods sold','income','money','all'),
  ('GROSS_PROFIT','Gross profit','income','money','all'), ('OPERATING_PROFIT','Operating profit','income','money','all'),
  ('EBIT','EBIT','income','money','all'), ('EBITDA','EBITDA','income','money','all'),
  ('NET_INCOME','Net income','income','money','all'), ('EPS','Earnings per share','income','per_share','all'),
  ('DPS','Dividend per share','income','per_share','all'),
  ('TOTAL_ASSETS','Total assets','balance_sheet','money','all'), ('CURRENT_ASSETS','Current assets','balance_sheet','money','all'),
  ('NON_CURRENT_ASSETS','Non-current assets','balance_sheet','money','all'), ('TOTAL_LIABILITIES','Total liabilities','balance_sheet','money','all'),
  ('CURRENT_LIABILITIES','Current liabilities','balance_sheet','money','all'), ('TOTAL_EQUITY','Total equity','balance_sheet','money','all'),
  ('CASH','Cash','balance_sheet','money','all'), ('INVENTORY','Inventory','balance_sheet','money','all'),
  ('RECEIVABLES','Receivables','balance_sheet','money','all'), ('TOTAL_DEBT','Total debt','balance_sheet','money','all'),
  ('LEASE_LIABILITIES','Lease liabilities','balance_sheet','money','all'),
  ('SHORT_TERM_BANK_LOANS','Short-term bank loans','balance_sheet','money','all'),
  ('SUPPLIER_FINANCING','Supplier financing','balance_sheet','money','all'),
  ('OPERATING_CASH_FLOW','Operating cash flow','cash_flow','money','all'), ('INVESTING_CASH_FLOW','Investing cash flow','cash_flow','money','all'),
  ('FINANCING_CASH_FLOW','Financing cash flow','cash_flow','money','all'), ('CAPEX','Capital expenditure','cash_flow','money','all'),
  ('FREE_CASH_FLOW','Free cash flow','cash_flow','money','all'),
  ('REVENUE_GROWTH','Revenue growth','ratio','ratio','all'), ('GROSS_MARGIN','Gross margin','ratio','ratio','all'),
  ('OPERATING_MARGIN','Operating margin','ratio','ratio','all'), ('NET_MARGIN','Net margin','ratio','ratio','all'),
  ('ROE','Return on equity','ratio','ratio','all'), ('ROA','Return on assets','ratio','ratio','all'), ('ROIC','Return on invested capital','ratio','ratio','industrial'),
  ('CURRENT_RATIO','Current ratio','ratio','x','industrial'), ('DEBT_TO_EQUITY','Debt to equity','ratio','ratio','industrial'),
  ('FCF_MARGIN','Free cash flow margin','ratio','ratio','all'), ('DIVIDEND_PAYOUT','Dividend payout','ratio','ratio','all'),
  ('DEBT_LEASE_TO_EQUITY','Debt plus leases to equity','ratio','ratio','all'), ('CASH_TO_ASSETS','Cash to total assets','ratio','ratio','all'),
  ('ONE_OFF_ADJUSTMENTS','One-off adjustments','normalization','money','all'),
  ('NORMALIZED_NET_INCOME','Normalized net income','normalization','money','all'),
  ('NORMALIZED_EPS','Normalized EPS','normalization','per_share','all'), ('NORMALIZED_FCF','Normalized free cash flow','normalization','money','all'),
  ('MARKET_PRICE','Market price','valuation','per_share','all'), ('MARKET_CAP','Market capitalisation','valuation','money','all'),
  ('PE_RATIO','Price to earnings','valuation','x','all'), ('PB_RATIO','Price to book','valuation','x','all'),
  ('EV_EBITDA','EV to EBITDA','valuation','x','industrial'), ('WACC','WACC','valuation','ratio','industrial'),
  ('TERMINAL_GROWTH','Terminal growth','valuation','ratio','industrial'), ('ENTERPRISE_VALUE','Enterprise value','valuation','money','industrial'),
  ('EQUITY_VALUE','Equity value','valuation','money','all'), ('TARGET_PRICE','Target price','valuation','per_share','all')
on conflict (code) do nothing;

insert into public.workbook_templates (workbook_type, version, name, is_active)
values ('TYPE_B', 1, 'Individual company research workbook v1', true)
on conflict (workbook_type, version) do nothing;

-- ===== 007_phase3_workflow.sql =====
-- 007: Phase 3 comparison, approval and publication workflow (safe to re-run)
alter table public.import_diffs add column if not exists old_text text;
alter table public.import_diffs add column if not exists new_text text;
alter table public.import_diffs add column if not exists period_label text;
alter table public.import_diffs add column if not exists sheet_name text;
alter table public.import_diffs add column if not exists cell_ref text;
alter table public.import_jobs add column if not exists reviewed_by uuid references auth.users(id);
alter table public.import_jobs add column if not exists reviewed_at timestamptz;
alter table public.import_jobs add column if not exists review_comment text;
alter table public.import_snapshots add column if not exists approved_by uuid references auth.users(id);
alter table public.import_snapshots add column if not exists approved_at timestamptz;

-- Approve: all checks and updates happen in one transaction.
create or replace function public.approve_import(p_job uuid, p_actor uuid, p_comment text, p_ack boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_status text; v_snap uuid; v_err int; v_warn int; v_rej int;
begin
  select status into v_status from public.import_jobs where id = p_job for update;
  if v_status is null then raise exception 'Import not found.'; end if;
  if v_status <> 'needs_review' then raise exception 'Only imports awaiting review can be approved (status is %).', v_status; end if;
  select id into v_snap from public.import_snapshots where import_job_id = p_job and status = 'draft' order by version_no desc limit 1;
  if v_snap is null then raise exception 'This import has no draft snapshot.'; end if;
  select count(*) into v_err from public.import_validation_issues where import_job_id = p_job and severity = 'ERROR' and resolution is null;
  if v_err > 0 then raise exception '% error(s) block approval. Fix the workbook and upload it again.', v_err; end if;
  select count(*) into v_warn from public.import_validation_issues where import_job_id = p_job and severity = 'WARNING' and resolution is null;
  if v_warn > 0 and not coalesce(p_ack, false) then raise exception '% warning(s) must be reviewed and acknowledged first.', v_warn; end if;
  select count(*) into v_rej from public.import_diffs where new_snapshot_id = v_snap and decision = 'rejected';
  if v_rej > 0 then raise exception '% change(s) are marked rejected. Reject the import or upload a corrected workbook.', v_rej; end if;

  update public.import_validation_issues
     set resolution = 'Acknowledged at approval' || coalesce(': ' || nullif(p_comment, ''), '')
   where import_job_id = p_job and severity = 'WARNING' and resolution is null;
  update public.import_diffs set decision = 'approved', reviewed_by = p_actor where new_snapshot_id = v_snap and decision = 'pending';
  update public.import_snapshots set status = 'approved', approved_by = p_actor, approved_at = now() where id = v_snap;
  update public.import_jobs set status = 'approved', reviewed_by = p_actor, reviewed_at = now(), review_comment = p_comment where id = p_job;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (p_actor, 'import.approved', 'import_job', p_job, jsonb_build_object('snapshot_id', v_snap, 'comment', p_comment, 'warnings_acknowledged', v_warn));
  return v_snap;
end $$;

-- Reject: never touches publication_versions, so the public site is unaffected.
create or replace function public.reject_import(p_job uuid, p_actor uuid, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from public.import_jobs where id = p_job for update;
  if v_status is null then raise exception 'Import not found.'; end if;
  if v_status not in ('needs_review', 'approved') then raise exception 'This import cannot be rejected (status is %).', v_status; end if;
  update public.import_snapshots set status = 'rejected' where import_job_id = p_job and status in ('draft', 'approved');
  update public.import_jobs set status = 'rejected', reviewed_by = p_actor, reviewed_at = now(), review_comment = p_comment where id = p_job;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (p_actor, 'import.rejected', 'import_job', p_job, jsonb_build_object('comment', p_comment));
end $$;

-- Publish: atomic. The current pointer moves only if every check passes.
create or replace function public.publish_snapshot(p_snapshot uuid, p_actor uuid, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_company uuid; v_status text; v_job uuid; v_prev uuid; v_prev_snap uuid; v_pub uuid; v_err int;
begin
  select company_id, status, import_job_id into v_company, v_status, v_job from public.import_snapshots where id = p_snapshot for update;
  if v_company is null then raise exception 'Snapshot not found.'; end if;
  if v_status <> 'approved' then raise exception 'Only an approved snapshot can be published (status is %).', v_status; end if;
  select count(*) into v_err from public.import_validation_issues where import_job_id = v_job and severity = 'ERROR' and resolution is null;
  if v_err > 0 then raise exception '% unresolved error(s) block publication.', v_err; end if;
  perform 1 from public.companies where id = v_company for update;
  select id, snapshot_id into v_prev, v_prev_snap from public.publication_versions where company_id = v_company and is_current;
  if v_prev is not null then
    update public.publication_versions set is_current = false where id = v_prev;
    update public.import_snapshots set status = 'superseded' where id = v_prev_snap and status = 'published';
  end if;
  insert into public.publication_versions (company_id, snapshot_id, is_current, published_by, notes)
    values (v_company, p_snapshot, true, p_actor, p_notes) returning id into v_pub;
  update public.import_snapshots set status = 'published' where id = p_snapshot;
  update public.import_jobs set status = 'published' where id = v_job;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (p_actor, 'publication.published', 'publication', v_pub,
      jsonb_build_object('company_id', v_company, 'snapshot_id', p_snapshot, 'previous_publication', v_prev, 'notes', p_notes));
  return v_pub;
end $$;

-- Rollback: repoint to a previously published snapshot and record why.
create or replace function public.rollback_publication(p_company uuid, p_target_publication uuid, p_actor uuid, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_target_snap uuid; v_prev uuid; v_prev_snap uuid; v_pub uuid;
begin
  select snapshot_id into v_target_snap from public.publication_versions where id = p_target_publication and company_id = p_company and not is_current;
  if v_target_snap is null then raise exception 'That earlier publication was not found for this company.'; end if;
  perform 1 from public.companies where id = p_company for update;
  select id, snapshot_id into v_prev, v_prev_snap from public.publication_versions where company_id = p_company and is_current;
  if v_prev is null then raise exception 'This company has no current publication to roll back from.'; end if;
  update public.publication_versions set is_current = false where id = v_prev;
  update public.import_snapshots set status = 'superseded' where id = v_prev_snap and status = 'published';
  insert into public.publication_versions (company_id, snapshot_id, is_current, published_by, rolled_back_from, notes)
    values (p_company, v_target_snap, true, p_actor, v_prev, p_notes) returning id into v_pub;
  update public.import_snapshots set status = 'published' where id = v_target_snap;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (p_actor, 'publication.rolled_back', 'publication', v_pub,
      jsonb_build_object('company_id', p_company, 'from_publication', v_prev, 'to_snapshot', v_target_snap, 'notes', p_notes));
  return v_pub;
end $$;

-- Only the server (service role) may call these. Role checks happen in the application first.
revoke all on function public.approve_import(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.reject_import(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.publish_snapshot(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.rollback_publication(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_import(uuid, uuid, text, boolean) to service_role;
grant execute on function public.reject_import(uuid, uuid, text) to service_role;
grant execute on function public.publish_snapshot(uuid, uuid, text) to service_role;
grant execute on function public.rollback_publication(uuid, uuid, uuid, text) to service_role;

-- ===== 008_phase4_public.sql =====
-- 008: Phase 4 public access hardening (safe to re-run)
-- Public visitors (anon) may read only the columns the public pages need.
-- Row Level Security still limits rows to currently published research.

revoke select on public.financial_metrics from anon;
grant select (id, company_id, snapshot_id, reporting_period_id, metric_id, value, currency, unit, classification, is_forecast)
  on public.financial_metrics to anon;

revoke select on public.publication_versions from anon;
grant select (id, company_id, snapshot_id, is_current, published_at) on public.publication_versions to anon;

revoke select on public.research_reports from anon;
grant select (id, company_id, title, author, report_date, executive_summary, is_published, published_at)
  on public.research_reports to anon;

-- Internal tables are not reachable by anonymous visitors at all.
revoke all on public.import_jobs, public.import_files, public.import_snapshots, public.import_records,
  public.import_validation_issues, public.import_diffs, public.financial_sources, public.workbook_templates,
  public.worksheet_mappings, public.audit_logs, public.profiles, public.user_roles, public.bootstrap_admins
  from anon;
