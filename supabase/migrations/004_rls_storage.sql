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
