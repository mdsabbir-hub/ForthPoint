-- Phase 4 self-test: what an anonymous visitor can and cannot see.
-- Run in the Supabase SQL Editor as ONE statement. It ends with an intentional
-- error that lists PASS/FAIL lines and rolls back everything it created.
do $$
declare
  c1 uuid; c2 uuid; j1 uuid; j2 uuid; s1 uuid; s2 uuid; per1 uuid; per2 uuid; mid uuid; pub uuid;
  n int; ok boolean; res text := '';
begin
  select id into mid from public.metric_definitions where code = 'REVENUE';
  if mid is null then raise exception 'Run phase2_setup.sql first (metric definitions are missing).'; end if;

  -- c1: published company. c2: company whose only snapshot is a draft.
  insert into public.companies (legal_name) values ('P4 Published Co') returning id into c1;
  insert into public.companies (legal_name) values ('P4 Draft Co') returning id into c2;
  insert into public.securities (company_id, ticker) values (c1, 'P4PUB'), (c2, 'P4DRAFT');
  insert into public.import_jobs (company_id, status) values (c1, 'published') returning id into j1;
  insert into public.import_jobs (company_id, status) values (c2, 'needs_review') returning id into j2;
  insert into public.import_snapshots (company_id, import_job_id, version_no, status) values (c1, j1, 1, 'published') returning id into s1;
  insert into public.import_snapshots (company_id, import_job_id, version_no, status) values (c2, j2, 1, 'draft') returning id into s2;
  insert into public.reporting_periods (company_id, period_type, fiscal_year, period_end, label) values (c1, 'annual', 2024, '2024-12-31', 'FY2024') returning id into per1;
  insert into public.reporting_periods (company_id, period_type, fiscal_year, period_end, label) values (c2, 'annual', 2024, '2024-12-31', 'FY2024') returning id into per2;
  insert into public.financial_metrics (company_id, snapshot_id, reporting_period_id, metric_id, value, unit, classification, formula_text)
    values (c1, s1, per1, mid, 100, 'million', 'reported', '=SECRET!A1'), (c2, s2, per2, mid, 999, 'million', 'reported', '=SECRET!B2');
  insert into public.publication_versions (company_id, snapshot_id, is_current, notes) values (c1, s1, true, 'internal note') returning id into pub;

  set local role anon;

  select count(*) into n from public.companies where id = c1;
  res := res || E'\n' || case when n = 1 then 'PASS ' else 'FAIL ' end || 'visitor sees the published company';
  select count(*) into n from public.companies where id = c2;
  res := res || E'\n' || case when n = 0 then 'PASS ' else 'FAIL ' end || 'visitor cannot see an unpublished company';
  select count(*) into n from public.securities where ticker = 'P4DRAFT';
  res := res || E'\n' || case when n = 0 then 'PASS ' else 'FAIL ' end || 'visitor cannot find the unpublished ticker';
  select count(*) into n from public.financial_metrics where company_id = c1;
  res := res || E'\n' || case when n = 1 then 'PASS ' else 'FAIL ' end || 'visitor sees published values';
  select count(*) into n from public.financial_metrics where company_id = c2;
  res := res || E'\n' || case when n = 0 then 'PASS ' else 'FAIL ' end || 'visitor cannot see draft values';

  ok := false; begin perform formula_text from public.financial_metrics limit 1; exception when insufficient_privilege then ok := true; end;
  res := res || E'\n' || case when ok then 'PASS ' else 'FAIL ' end || 'formula text is hidden from visitors';
  ok := false; begin perform notes from public.publication_versions limit 1; exception when insufficient_privilege then ok := true; end;
  res := res || E'\n' || case when ok then 'PASS ' else 'FAIL ' end || 'publication notes are hidden from visitors';
  ok := false; begin perform 1 from public.import_jobs limit 1; exception when insufficient_privilege then ok := true; end;
  res := res || E'\n' || case when ok then 'PASS ' else 'FAIL ' end || 'import jobs are not reachable by visitors';
  ok := false; begin perform 1 from public.financial_sources limit 1; exception when insufficient_privilege then ok := true; end;
  res := res || E'\n' || case when ok then 'PASS ' else 'FAIL ' end || 'workbook source cells are not reachable by visitors';
  ok := false; begin perform 1 from public.audit_logs limit 1; exception when insufficient_privilege then ok := true; end;
  res := res || E'\n' || case when ok then 'PASS ' else 'FAIL ' end || 'audit log is not reachable by visitors';
  select count(*) into n from public.metric_definitions;
  res := res || E'\n' || case when n > 0 then 'PASS ' else 'FAIL ' end || 'visitor can read metric names';

  reset role;
  -- Un-publishing hides the company again: the publication pointer controls visibility.
  update public.publication_versions set is_current = false where id = pub;
  set local role anon;
  select count(*) into n from public.companies where id = c1;
  res := res || E'\n' || case when n = 0 then 'PASS ' else 'FAIL ' end || 'company disappears when no publication is current';
  reset role;

  raise exception E'PHASE 4 TEST RESULTS (this error is intentional and rolls everything back):%', res;
end $$;
