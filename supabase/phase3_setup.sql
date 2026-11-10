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
