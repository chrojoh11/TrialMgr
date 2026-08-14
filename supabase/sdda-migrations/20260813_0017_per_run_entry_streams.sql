begin;

alter table public.sdda_entries drop constraint if exists sdda_entries_stream_check;
alter table public.sdda_entries add constraint sdda_entries_stream_check
  check (stream in ('Amateur','Working','Mixed'));

drop function public.sdda_submit_public_entry(uuid,jsonb);

create function public.sdda_submit_public_entry(target_trial_id uuid, submission jsonb)
returns jsonb
language plpgsql
security definer
set search_path to public, extensions
set row_security=off
as $$
declare
  trial_owner uuid; dog_record_id uuid; target_entry_id uuid;
  run_request jsonb; receipt_token text; code text; entry_stream text;
  requested_group text; offered_record public.sdda_trial_offerings%rowtype;
begin
  select owner_id into trial_owner from public.sdda_trials t
  where t.id=target_trial_id and t.status='entries_open'
    and (t.entry_open_at is null or now() >= t.entry_open_at)
    and (t.entry_close_at is null or now() <= t.entry_close_at);
  if trial_owner is null then raise exception 'This trial is not accepting online entries'; end if;
  if length(trim(coalesce(submission->>'handler_name',''))) < 2 then raise exception 'Handler name is required'; end if;
  if position('@' in coalesce(submission->>'handler_email','')) < 2 then raise exception 'A valid email is required'; end if;
  if length(trim(coalesce(submission->>'dog_call_name',''))) < 1 then raise exception 'Dog call name is required'; end if;
  if length(trim(coalesce(submission->>'breed',''))) < 1 then raise exception 'Breed is required'; end if;
  if coalesce(jsonb_array_length(submission->'runs'),0) < 1 then raise exception 'Select at least one offered run'; end if;
  if coalesce((submission->>'waiver_accepted')::boolean,false) is not true then raise exception 'The acknowledgement must be accepted'; end if;
  if coalesce(submission->>'reactivity','None') not in ('None','Dogs','People','Both') then raise exception 'Invalid reactivity selection'; end if;

  for run_request in select value from jsonb_array_elements(submission->'runs') loop
    select * into offered_record from public.sdda_trial_offerings o
      where o.id=(run_request->>'offering_id')::uuid and o.trial_id=target_trial_id;
    if not found then raise exception 'A requested run is not offered for this trial'; end if;
    requested_group := coalesce(nullif(run_request->>'run_group',''),'Regular');
    if requested_group not in ('Official','Regular','Second dog','FEO','BIS') then
      raise exception 'Invalid running-order request';
    end if;
  end loop;

  select case when count(distinct o.stream)=1 then min(o.stream) else 'Mixed' end into entry_stream
    from jsonb_array_elements(submission->'runs') r
    join public.sdda_trial_offerings o on o.id=(r->>'offering_id')::uuid
    where o.trial_id=target_trial_id and o.level <> 'Elite';
  entry_stream := coalesce(entry_stream,'Amateur');

  if nullif(trim(submission->>'dog_registration_number'),'') is not null then
    select id into dog_record_id from public.sdda_dogs
      where lower(trim(sdda_registration_number))=lower(trim(submission->>'dog_registration_number'));
  end if;
  if dog_record_id is null then
    insert into public.sdda_dogs(registered_name,call_name,sdda_registration_number,registration_pending,breed,created_by)
    values(nullif(trim(submission->>'dog_registered_name'),''),trim(submission->>'dog_call_name'),
      nullif(trim(submission->>'dog_registration_number'),''),coalesce((submission->>'registration_pending')::boolean,false),
      trim(submission->>'breed'),trial_owner) returning id into dog_record_id;
  end if;
  if exists(select 1 from public.sdda_entries e where e.trial_id=target_trial_id and e.dog_id=dog_record_id
    and lower(trim(e.handler_name))=lower(trim(submission->>'handler_name'))) then
    raise exception 'An entry for this handler and dog has already been received';
  end if;

  receipt_token := encode(extensions.gen_random_bytes(24),'hex');
  code := 'SDDA-' || to_char(current_date,'YYMMDD') || '-' || upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,8));
  insert into public.sdda_entries(trial_id,dog_id,handler_name,handler_email,handler_phone,handler_address,
    participant_number,stream,formal_alerts,reactivity,title_watch_note,source,entry_status,confirmation_status,
    confirmation_code,receipt_token_hash,waiver_accepted_at,submitted_at)
  values(target_trial_id,dog_record_id,trim(submission->>'handler_name'),trim(submission->>'handler_email'),
    nullif(trim(submission->>'handler_phone'),''),nullif(trim(submission->>'handler_address'),''),
    nullif(trim(submission->>'participant_number'),''),entry_stream,nullif(trim(submission->>'formal_alerts'),''),
    coalesce(submission->>'reactivity','None'),nullif(trim(submission->>'title_watch_note'),''),'public_form','entered',
    'received',code,encode(extensions.digest(receipt_token,'sha256'),'hex'),now(),now()) returning id into target_entry_id;

  for run_request in select value from jsonb_array_elements(submission->'runs') loop
    requested_group := coalesce(nullif(run_request->>'run_group',''),'Regular');
    insert into public.sdda_runs(trial_id,entry_id,trial_day_id,level,component,stream,run_group)
      select target_trial_id,target_entry_id,o.trial_day_id,o.level,o.component,o.stream,requested_group
      from public.sdda_trial_offerings o
      where o.id=(run_request->>'offering_id')::uuid and o.trial_id=target_trial_id;
  end loop;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,after_state)
    values(target_trial_id,null,'entry.public_received','sdda_entry',target_entry_id::text,
      jsonb_build_object('confirmation_code',code,'entry_stream_summary',entry_stream,'runs',submission->'runs'));
  return jsonb_build_object('confirmation_code',code,'receipt_token',receipt_token,'status','received');
end;
$$;

revoke all on function public.sdda_submit_public_entry(uuid,jsonb) from public;
grant execute on function public.sdda_submit_public_entry(uuid,jsonb) to anon, authenticated;

commit;
