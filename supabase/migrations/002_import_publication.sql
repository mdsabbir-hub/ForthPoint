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
