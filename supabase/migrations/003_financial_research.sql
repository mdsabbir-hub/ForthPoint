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
