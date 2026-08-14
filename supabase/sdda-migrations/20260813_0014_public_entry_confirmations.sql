begin;

alter table public.sdda_trials
  add column if not exists entry_open_at timestamptz,
  add column if not exists entry_close_at timestamptz,
  add column if not exists secretary_name text,
  add column if not exists secretary_email text,
  add column if not exists secretary_phone text,
  add column if not exists payment_instructions text,
  add column if not exists cancellation_policy text;

alter table public.sdda_entries
  add column if not exists handler_address text,
  add column if not exists reactivity text not null default 'None'
    check (reactivity in ('None', 'Dogs', 'People', 'Both')),
  add column if not exists title_watch_note text,
  add column if not exists waiver_accepted_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists confirmation_code text,
  add column if not exists confirmation_status text not null default 'accepted'
    check (confirmation_status in ('received', 'accepted', 'waitlisted', 'rejected')),
  add column if not exists receipt_token_hash text;

create unique index if not exists sdda_entries_confirmation_code_unique
  on public.sdda_entries (confirmation_code)
  where confirmation_code is not null;

alter table public.sdda_entries drop constraint if exists sdda_entries_source_check;
alter table public.sdda_entries add constraint sdda_entries_source_check
  check (source in ('manual', 'csv', 'google_form', 'backup', 'public_form'));

create or replace function public.sdda_public_trial_entry_setup(target_trial_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'host_club', t.host_club,
    'venue', t.venue,
    'timezone', t.timezone,
    'entry_open_at', t.entry_open_at,
    'entry_close_at', t.entry_close_at,
    'secretary_name', t.secretary_name,
    'secretary_email', t.secretary_email,
    'secretary_phone', t.secretary_phone,
    'payment_instructions', t.payment_instructions,
    'cancellation_policy', t.cancellation_policy,
    'days', coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'day_number', d.day_number, 'trial_date', d.trial_date,
      'sdda_trial_number', d.sdda_trial_number, 'judge_name', d.judge_name
    ) order by d.day_number) from public.sdda_trial_days d where d.trial_id=t.id), '[]'::jsonb),
    'offerings', coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'trial_day_id', o.trial_day_id, 'level', o.level,
      'component', o.component, 'stream', o.stream, 'capacity', o.capacity
    ) order by o.trial_day_id,o.level,o.stream,o.component)
      from public.sdda_trial_offerings o where o.trial_id=t.id), '[]'::jsonb)
  ) into result
  from public.sdda_trials t
  where t.id=target_trial_id
    and t.status='entries_open'
    and (t.entry_open_at is null or now() >= t.entry_open_at)
    and (t.entry_close_at is null or now() <= t.entry_close_at);
  if result is null then raise exception 'This trial is not accepting online entries'; end if;
  return result;
end;
$$;

create or replace function public.sdda_submit_public_entry(target_trial_id uuid, submission jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  trial_owner uuid; dog_record_id uuid; target_entry_id uuid;
  run_request jsonb; receipt_token text; code text; requested_stream text;
begin
  select owner_id into trial_owner from public.sdda_trials t
  where t.id=target_trial_id and t.status='entries_open'
    and (t.entry_open_at is null or now() >= t.entry_open_at)
    and (t.entry_close_at is null or now() <= t.entry_close_at);
  if trial_owner is null then raise exception 'This trial is not accepting online entries'; end if;
  if length(trim(coalesce(submission->>'handler_name',''))) < 2 then raise exception 'Handler name is required'; end if;
  if position('@' in coalesce(submission->>'handler_email','')) < 2 then raise exception 'A valid email is required'; end if;
  if length(trim(coalesce(submission->>'dog_call_name',''))) < 1 then raise exception 'Dog call name is required'; end if;
  if coalesce(jsonb_array_length(submission->'runs'),0) < 1 then raise exception 'Select at least one offered run'; end if;
  if coalesce((submission->>'waiver_accepted')::boolean,false) is not true then raise exception 'The acknowledgement must be accepted'; end if;
  requested_stream := submission->>'stream';
  if requested_stream not in ('Amateur','Working') then raise exception 'Select Amateur or Working stream'; end if;
  if coalesce(submission->>'reactivity','None') not in ('None','Dogs','People','Both') then raise exception 'Invalid reactivity selection'; end if;

  if nullif(trim(submission->>'dog_registration_number'),'') is not null then
    select id into dog_record_id from public.sdda_dogs
      where lower(trim(sdda_registration_number))=lower(trim(submission->>'dog_registration_number'));
  end if;
  if dog_record_id is null then
    insert into public.sdda_dogs(registered_name,call_name,sdda_registration_number,registration_pending,breed,created_by)
    values(nullif(trim(submission->>'dog_registered_name'),''),trim(submission->>'dog_call_name'),
      nullif(trim(submission->>'dog_registration_number'),''),coalesce((submission->>'registration_pending')::boolean,false),
      nullif(trim(submission->>'breed'),''),trial_owner) returning id into dog_record_id;
  end if;

  if exists(select 1 from public.sdda_entries e where e.trial_id=target_trial_id and e.dog_id=dog_record_id
    and lower(trim(e.handler_name))=lower(trim(submission->>'handler_name'))) then
    raise exception 'An entry for this handler and dog has already been received';
  end if;
  receipt_token := encode(gen_random_bytes(24),'hex');
  code := 'SDDA-' || to_char(current_date,'YYMMDD') || '-' || upper(substr(encode(gen_random_bytes(6),'hex'),1,8));
  insert into public.sdda_entries(trial_id,dog_id,handler_name,handler_email,handler_phone,handler_address,
    participant_number,stream,formal_alerts,reactivity,title_watch_note,source,entry_status,confirmation_status,
    confirmation_code,receipt_token_hash,waiver_accepted_at,submitted_at)
  values(target_trial_id,dog_record_id,trim(submission->>'handler_name'),trim(submission->>'handler_email'),
    nullif(trim(submission->>'handler_phone'),''),nullif(trim(submission->>'handler_address'),''),
    nullif(trim(submission->>'participant_number'),''),requested_stream,nullif(trim(submission->>'formal_alerts'),''),
    coalesce(submission->>'reactivity','None'),nullif(trim(submission->>'title_watch_note'),''),'public_form','entered',
    'received',code,encode(extensions.digest(receipt_token,'sha256'),'hex'),now(),now()) returning id into target_entry_id;

  for run_request in select value from jsonb_array_elements(submission->'runs') loop
    if not exists(select 1 from public.sdda_trial_offerings o where o.id=(run_request->>'offering_id')::uuid
      and o.trial_id=target_trial_id and o.stream=requested_stream) then
      raise exception 'A requested run is not offered for this trial and stream';
    end if;
    insert into public.sdda_runs(trial_id,entry_id,trial_day_id,level,component,stream)
    select target_trial_id,target_entry_id,o.trial_day_id,o.level,o.component,o.stream
      from public.sdda_trial_offerings o where o.id=(run_request->>'offering_id')::uuid;
  end loop;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,after_state)
    values(target_trial_id,null,'entry.public_received','sdda_entry',target_entry_id::text,
      jsonb_build_object('confirmation_code',code,'run_count',jsonb_array_length(submission->'runs')));
  return jsonb_build_object('confirmation_code',code,'receipt_token',receipt_token,'status','received');
end;
$$;

create or replace function public.sdda_public_entry_receipt(entry_code text, receipt_token text)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
  select jsonb_build_object('confirmation_code',e.confirmation_code,'status',e.confirmation_status,
    'submitted_at',e.submitted_at,'handler_name',e.handler_name,'handler_email',e.handler_email,
    'participant_number',e.participant_number,'formal_alerts',e.formal_alerts,'reactivity',e.reactivity,
    'title_watch_note',e.title_watch_note,'trial',jsonb_build_object('id',t.id,'name',t.name,'host_club',t.host_club,
      'venue',t.venue,'payment_instructions',t.payment_instructions,'secretary_email',t.secretary_email),
    'dog',jsonb_build_object('call_name',d.call_name,'registered_name',d.registered_name,
      'registration_number',d.sdda_registration_number,'registration_pending',d.registration_pending,'breed',d.breed),
    'runs',coalesce((select jsonb_agg(jsonb_build_object('date',td.trial_date,'day_number',td.day_number,
      'level',r.level,'component',r.component,'stream',r.stream) order by td.day_number,r.level,r.component)
      from public.sdda_runs r join public.sdda_trial_days td on td.id=r.trial_day_id where r.entry_id=e.id),'[]'::jsonb))
  from public.sdda_entries e join public.sdda_trials t on t.id=e.trial_id join public.sdda_dogs d on d.id=e.dog_id
  where e.confirmation_code=entry_code and e.receipt_token_hash=encode(extensions.digest(receipt_token,'sha256'),'hex');
$$;

revoke all on function public.sdda_public_trial_entry_setup(uuid) from public;
revoke all on function public.sdda_submit_public_entry(uuid,jsonb) from public;
revoke all on function public.sdda_public_entry_receipt(text,text) from public;
grant execute on function public.sdda_public_trial_entry_setup(uuid) to anon, authenticated;
grant execute on function public.sdda_submit_public_entry(uuid,jsonb) to anon, authenticated;
grant execute on function public.sdda_public_entry_receipt(text,text) to anon, authenticated;

commit;
