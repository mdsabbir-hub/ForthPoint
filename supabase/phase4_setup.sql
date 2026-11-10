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
