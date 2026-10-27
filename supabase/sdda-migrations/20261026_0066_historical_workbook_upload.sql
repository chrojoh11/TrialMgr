begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'sdda-workbooks',
  'sdda-workbooks',
  false,
  20971520,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]
)
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists sdda_workbooks_manager_read on storage.objects;
create policy sdda_workbooks_manager_read on storage.objects
for select to authenticated
using (
  bucket_id='sdda-workbooks'
  and exists(
    select 1 from public.sdda_trials t
    where t.id::text=split_part(name,'/',1)
      and public.sdda_can_manage_trial(t.id)
  )
);

drop policy if exists sdda_workbooks_manager_insert on storage.objects;
create policy sdda_workbooks_manager_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='sdda-workbooks'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.xlsx$'
  and exists(
    select 1 from public.sdda_trials t
    where t.id::text=split_part(name,'/',1)
      and public.sdda_can_manage_trial(t.id)
  )
);

drop policy if exists sdda_workbooks_manager_update on storage.objects;
create policy sdda_workbooks_manager_update on storage.objects
for update to authenticated
using (
  bucket_id='sdda-workbooks'
  and exists(
    select 1 from public.sdda_trials t
    where t.id::text=split_part(name,'/',1)
      and public.sdda_can_manage_trial(t.id)
  )
)
with check (
  bucket_id='sdda-workbooks'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.xlsx$'
  and exists(
    select 1 from public.sdda_trials t
    where t.id::text=split_part(name,'/',1)
      and public.sdda_can_manage_trial(t.id)
  )
);

drop policy if exists sdda_workbooks_manager_delete on storage.objects;
create policy sdda_workbooks_manager_delete on storage.objects
for delete to authenticated
using (
  bucket_id='sdda-workbooks'
  and exists(
    select 1 from public.sdda_trials t
    where t.id::text=split_part(name,'/',1)
      and public.sdda_can_manage_trial(t.id)
  )
);

alter table public.sdda_trials
  add column if not exists workbook_storage_path text;

create or replace function public.sdda_pin_workbook(
  target_trial_id uuid,
  requested_source_url text,
  requested_filename text,
  requested_sha256 text,
  mark_proofed boolean default false
)
returns void
language plpgsql
security definer
set search_path=public
as $workbook$
declare before_record jsonb; after_record jsonb;
begin
  if auth.uid() is null or not public.sdda_can_manage_trial(target_trial_id) then
    raise exception 'You cannot manage the workbook for this trial.';
  end if;
  if requested_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Invalid workbook checksum.'; end if;
  select jsonb_build_object('source_url',workbook_source_url,'filename',workbook_filename,
    'sha256',workbook_sha256,'storage_path',workbook_storage_path,'pinned_at',workbook_pinned_at,
    'proofed_at',workbook_proofed_at) into before_record
    from public.sdda_trials where id=target_trial_id;
  update public.sdda_trials set
    workbook_source_url=requested_source_url,workbook_filename=requested_filename,
    workbook_sha256=requested_sha256,workbook_storage_path=null,workbook_pinned_at=now(),
    workbook_proofed_at=case when mark_proofed then now() else null end,
    workbook_proofed_by=case when mark_proofed then auth.uid() else null end,
    updated_at=now()
  where id=target_trial_id;
  select jsonb_build_object('source_url',workbook_source_url,'filename',workbook_filename,
    'sha256',workbook_sha256,'storage_path',workbook_storage_path,'pinned_at',workbook_pinned_at,
    'proofed_at',workbook_proofed_at) into after_record
    from public.sdda_trials where id=target_trial_id;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
  values(target_trial_id,auth.uid(),case when mark_proofed then 'workbook.proofed' else 'workbook.pinned' end,
    'sdda_workbook',target_trial_id::text,before_record,after_record);
end;
$workbook$;

create or replace function public.sdda_pin_uploaded_workbook(
  target_trial_id uuid,
  requested_filename text,
  requested_sha256 text,
  requested_storage_path text
)
returns void
language plpgsql
security definer
set search_path=public,storage
as $uploaded_workbook$
declare before_record jsonb; after_record jsonb;
begin
  if auth.uid() is null or not public.sdda_can_manage_trial(target_trial_id) then
    raise exception 'You cannot manage the workbook for this trial.';
  end if;
  if requested_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Invalid workbook checksum.'; end if;
  if requested_filename is null or requested_filename !~* '\.xlsx$' then
    raise exception 'An SDDA Excel workbook is required.';
  end if;
  if requested_storage_path <> target_trial_id::text||'/'||requested_sha256||'.xlsx' then
    raise exception 'The workbook storage path is invalid.';
  end if;
  if not exists(
    select 1 from storage.objects
    where bucket_id='sdda-workbooks' and name=requested_storage_path
  ) then raise exception 'The uploaded workbook was not found.'; end if;
  select jsonb_build_object('source_url',workbook_source_url,'filename',workbook_filename,
    'sha256',workbook_sha256,'storage_path',workbook_storage_path,'pinned_at',workbook_pinned_at,
    'proofed_at',workbook_proofed_at) into before_record
    from public.sdda_trials where id=target_trial_id;
  update public.sdda_trials set
    workbook_source_url='private:sdda-workbooks/'||requested_storage_path,
    workbook_filename=left(requested_filename,240),
    workbook_sha256=requested_sha256,
    workbook_storage_path=requested_storage_path,
    workbook_pinned_at=now(),workbook_proofed_at=null,workbook_proofed_by=null,updated_at=now()
  where id=target_trial_id;
  select jsonb_build_object('source_url',workbook_source_url,'filename',workbook_filename,
    'sha256',workbook_sha256,'storage_path',workbook_storage_path,'pinned_at',workbook_pinned_at,
    'proofed_at',workbook_proofed_at) into after_record
    from public.sdda_trials where id=target_trial_id;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
  values(target_trial_id,auth.uid(),'workbook.uploaded_and_pinned','sdda_workbook',
    target_trial_id::text,before_record,after_record);
end;
$uploaded_workbook$;

revoke all on function public.sdda_pin_uploaded_workbook(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.sdda_pin_uploaded_workbook(uuid,text,text,text) to authenticated;

commit;
