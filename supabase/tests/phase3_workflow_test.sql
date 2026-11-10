-- Phase 3 self-test. Run in the Supabase SQL Editor as ONE statement.
-- It ends with an intentional error whose message lists PASS/FAIL lines.
-- That error also rolls back everything the test created, so no data is kept.
do $$
declare
  c uuid; s1 uuid; s2 uuid; j1 uuid; j2 uuid; pub1 uuid; pub2 uuid; actor uuid; n int; failed boolean;
  res text := '';
begin
  select id into actor from auth.users order by created_at limit 1;
  if actor is null then raise exception 'Create a user first (your admin login), then run this test.'; end if;
  insert into public.companies (legal_name) values ('Phase3 Test Co') returning id into c;
  insert into public.import_jobs (company_id, status) values (c, 'needs_review') returning id into j1;
  insert into public.import_snapshots (company_id, import_job_id, version_no, status) values (c, j1, 1, 'draft') returning id into s1;

  -- 1. An unresolved ERROR blocks approval
  insert into public.import_validation_issues (import_job_id, snapshot_id, severity, code, message) values (j1, s1, 'ERROR', 'T', 'test error');
  failed := false; begin perform public.approve_import(j1, actor, 'x', true); exception when others then failed := true; end;
  res := res || E'\n' || case when failed then 'PASS ' else 'FAIL ' end || 'error blocks approval';
  delete from public.import_validation_issues where import_job_id = j1;

  -- 2. An unacknowledged WARNING blocks approval; acknowledging allows it
  insert into public.import_validation_issues (import_job_id, snapshot_id, severity, code, message) values (j1, s1, 'WARNING', 'T', 'test warning');
  failed := false; begin perform public.approve_import(j1, actor, 'x', false); exception when others then failed := true; end;
  res := res || E'\n' || case when failed then 'PASS ' else 'FAIL ' end || 'warning needs acknowledgement';
  perform public.approve_import(j1, actor, 'ok', true);
  res := res || E'\n' || case when (select status from public.import_snapshots where id = s1) = 'approved' then 'PASS ' else 'FAIL ' end || 'approval sets snapshot approved';

  -- 3. Publishing makes the snapshot current
  pub1 := public.publish_snapshot(s1, actor, 'first');
  res := res || E'\n' || case when exists (select 1 from public.publication_versions where id = pub1 and is_current) then 'PASS ' else 'FAIL ' end || 'publish makes it current';

  -- 4. Rejecting a second import leaves the public pointer unchanged
  insert into public.import_jobs (company_id, status) values (c, 'needs_review') returning id into j2;
  insert into public.import_snapshots (company_id, import_job_id, version_no, status) values (c, j2, 2, 'draft') returning id into s2;
  perform public.reject_import(j2, actor, 'no');
  res := res || E'\n' || case when (select snapshot_id from public.publication_versions where company_id = c and is_current) = s1 then 'PASS ' else 'FAIL ' end || 'reject leaves publication unchanged';

  -- 5. A rejected snapshot cannot be published
  failed := false; begin perform public.publish_snapshot(s2, actor, null); exception when others then failed := true; end;
  res := res || E'\n' || case when failed then 'PASS ' else 'FAIL ' end || 'rejected snapshot cannot publish';

  -- 6. Publish a newer approved version, then roll back
  insert into public.import_jobs (company_id, status) values (c, 'needs_review') returning id into j2;
  insert into public.import_snapshots (company_id, import_job_id, version_no, status) values (c, j2, 3, 'draft') returning id into s2;
  perform public.approve_import(j2, actor, null, true);
  pub2 := public.publish_snapshot(s2, actor, 'second');
  select count(*) into n from public.publication_versions where company_id = c and is_current;
  res := res || E'\n' || case when n = 1 then 'PASS ' else 'FAIL ' end || 'only one current publication';
  perform public.rollback_publication(c, pub1, actor, 'undo');
  res := res || E'\n' || case when (select snapshot_id from public.publication_versions where company_id = c and is_current) = s1 then 'PASS ' else 'FAIL ' end || 'rollback repoints to old snapshot';
  res := res || E'\n' || case when exists (select 1 from public.audit_logs where action = 'publication.rolled_back' and actor_id = actor and entity_type = 'publication') then 'PASS ' else 'FAIL ' end || 'rollback writes an audit row';

  -- 7. The unique index refuses a second current publication
  failed := false; begin insert into public.publication_versions (company_id, snapshot_id, is_current) values (c, s2, true); exception when unique_violation then failed := true; end;
  res := res || E'\n' || case when failed then 'PASS ' else 'FAIL ' end || 'duplicate current publication refused';

  raise exception E'PHASE 3 TEST RESULTS (this error is intentional and rolls everything back):%', res;
end $$;
