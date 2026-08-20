begin;

alter table public.sdda_game_runs
  add column if not exists aerial_division text
  check (aerial_division is null or aerial_division in ('High','Highfly'));

create or replace function public.sdda_entry_edit_payload(target_entry_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public
set row_security=off
as $payload$
  select jsonb_build_object(
    'entry_id',e.id,'trial_id',e.trial_id,'confirmation_code',e.confirmation_code,
    'confirmation_status',e.confirmation_status,'handler_name',e.handler_name,
    'handler_email',e.handler_email,'handler_phone',e.handler_phone,
    'handler_address',e.handler_address,'participant_number',e.participant_number,
    'formal_alerts',e.formal_alerts,'reactivity',e.reactivity,
    'title_watch_note',e.title_watch_note,
    'dog_call_name',d.call_name,'dog_registered_name',d.registered_name,
    'dog_registration_number',d.sdda_registration_number,
    'registration_pending',d.registration_pending,'breed',d.breed,
    'runs',coalesce((select jsonb_agg(jsonb_build_object(
      'offering_id',o.id,'run_group',r.run_group
    ) order by td.day_number,o.level,o.component)
      from public.sdda_runs r
      join public.sdda_trial_offerings o on o.trial_id=r.trial_id
        and o.trial_day_id=r.trial_day_id and o.level=r.level
        and o.component=r.component and o.stream=r.stream
      join public.sdda_trial_days td on td.id=r.trial_day_id
      where r.entry_id=e.id),'[]'::jsonb),
    'game_runs',coalesce((select jsonb_agg(jsonb_build_object(
      'offering_id',gr.offering_id,'entry_type',gr.entry_type,
      'team_partner_name',gr.requested_team_partner,'aerial_division',gr.aerial_division
    ) order by td.day_number,g.game_type)
      from public.sdda_game_runs gr
      join public.sdda_game_offerings g on g.id=gr.offering_id
      join public.sdda_trial_days td on td.id=gr.trial_day_id
      where gr.entry_id=e.id),'[]'::jsonb)
  )
  from public.sdda_entries e join public.sdda_dogs d on d.id=e.dog_id
  where e.id=target_entry_id;
$payload$;

create or replace function public.sdda_apply_entry_update(
  target_entry_id uuid, submission jsonb, audit_actor uuid, audit_action text
)
returns void
language plpgsql
security definer
set search_path=public
set row_security=off
as $apply$
declare
  target_trial_id uuid; target_dog_id uuid; request jsonb;
  requested_group text; requested_type text; requested_division text;
  entry_stream text; before_state jsonb; scent_offering public.sdda_trial_offerings%rowtype;
  game_offering public.sdda_game_offerings%rowtype;
begin
  select trial_id,dog_id into target_trial_id,target_dog_id
    from public.sdda_entries where id=target_entry_id for update;
  if target_trial_id is null then raise exception 'Entry not found'; end if;
  if exists(select 1 from public.sdda_runs r left join public.sdda_scores s on s.run_id=r.id
      where r.entry_id=target_entry_id and (r.running_position is not null or s.id is not null))
    or exists(select 1 from public.sdda_game_runs gr left join public.sdda_game_scores gs on gs.game_run_id=gr.id
      where gr.entry_id=target_entry_id and (gr.running_position is not null or gs.id is not null)) then
    raise exception 'Entry selections cannot be replaced after a running order or score exists';
  end if;
  if length(trim(coalesce(submission->>'handler_name','')))<2 then raise exception 'Handler name is required'; end if;
  if position('@' in coalesce(submission->>'handler_email',''))<2 then raise exception 'A valid email is required'; end if;
  if length(trim(coalesce(submission->>'dog_call_name','')))<1 then raise exception 'Dog call name is required'; end if;
  if length(trim(coalesce(submission->>'breed','')))<1 then raise exception 'Breed is required'; end if;
  if coalesce(jsonb_array_length(submission->'runs'),0)+coalesce(jsonb_array_length(submission->'game_runs'),0)<1
    then raise exception 'Select at least one offered run'; end if;
  if coalesce(submission->>'reactivity','None') not in ('None','Dogs','People','Both')
    then raise exception 'Invalid reactivity selection'; end if;

  for request in select value from jsonb_array_elements(coalesce(submission->'runs','[]'::jsonb)) loop
    select * into scent_offering from public.sdda_trial_offerings o
      where o.id=(request->>'offering_id')::uuid and o.trial_id=target_trial_id;
    if not found then raise exception 'A requested scent run is not offered for this trial'; end if;
    requested_group:=coalesce(nullif(request->>'run_group',''),'Regular');
    if requested_group not in ('Official','Regular','Second dog','FEO','BIS')
      then raise exception 'Invalid running-order request'; end if;
  end loop;
  for request in select value from jsonb_array_elements(coalesce(submission->'game_runs','[]'::jsonb)) loop
    select * into game_offering from public.sdda_game_offerings g
      where g.id=(request->>'offering_id')::uuid and g.trial_id=target_trial_id;
    if not found then raise exception 'A requested Game is not offered for this trial'; end if;
    requested_type:=coalesce(nullif(request->>'entry_type',''),'Regular');
    if requested_type not in ('Regular','FEO') then raise exception 'A Game entry must be Regular or FEO'; end if;
    if game_offering.game_type='Team' and length(trim(coalesce(request->>'team_partner_name','')))<2
      then raise exception 'Team partner name is required for Team'; end if;
    requested_division:=nullif(request->>'aerial_division','');
    if game_offering.game_type='Aerial' and requested_division not in ('High','Highfly')
      then raise exception 'Choose High or Highfly for Aerial'; end if;
  end loop;

  before_state:=public.sdda_entry_edit_payload(target_entry_id);
  select case when count(distinct o.stream)=1 then min(o.stream) else 'Mixed' end into entry_stream
    from jsonb_array_elements(coalesce(submission->'runs','[]'::jsonb)) r
    join public.sdda_trial_offerings o on o.id=(r->>'offering_id')::uuid
    where o.trial_id=target_trial_id and o.level<>'Elite';
  entry_stream:=coalesce(entry_stream,'Amateur');

  update public.sdda_dogs set
    call_name=trim(submission->>'dog_call_name'),registered_name=nullif(trim(submission->>'dog_registered_name'),''),
    sdda_registration_number=nullif(trim(submission->>'dog_registration_number'),''),
    registration_pending=coalesce((submission->>'registration_pending')::boolean,false),
    breed=trim(submission->>'breed'),updated_at=now()
    where id=target_dog_id;
  update public.sdda_entries set
    handler_name=trim(submission->>'handler_name'),handler_email=trim(submission->>'handler_email'),
    handler_phone=nullif(trim(submission->>'handler_phone'),''),handler_address=nullif(trim(submission->>'handler_address'),''),
    participant_number=nullif(trim(submission->>'participant_number'),''),stream=entry_stream,
    formal_alerts=nullif(trim(submission->>'formal_alerts'),''),reactivity=coalesce(submission->>'reactivity','None'),
    title_watch_note=nullif(trim(submission->>'title_watch_note'),''),updated_at=now()
    where id=target_entry_id;

  delete from public.sdda_runs where entry_id=target_entry_id;
  delete from public.sdda_game_runs where entry_id=target_entry_id;
  for request in select value from jsonb_array_elements(coalesce(submission->'runs','[]'::jsonb)) loop
    requested_group:=coalesce(nullif(request->>'run_group',''),'Regular');
    insert into public.sdda_runs(trial_id,entry_id,trial_day_id,level,component,stream,run_group)
      select target_trial_id,target_entry_id,o.trial_day_id,o.level,o.component,o.stream,requested_group
      from public.sdda_trial_offerings o where o.id=(request->>'offering_id')::uuid and o.trial_id=target_trial_id;
  end loop;
  for request in select value from jsonb_array_elements(coalesce(submission->'game_runs','[]'::jsonb)) loop
    requested_type:=coalesce(nullif(request->>'entry_type',''),'Regular');
    insert into public.sdda_game_runs(trial_id,entry_id,trial_day_id,offering_id,entry_type,requested_team_partner,aerial_division)
      select target_trial_id,target_entry_id,g.trial_day_id,g.id,requested_type,
        case when g.game_type='Team' then trim(request->>'team_partner_name') else null end,
        case when g.game_type='Aerial' then request->>'aerial_division' else null end
      from public.sdda_game_offerings g where g.id=(request->>'offering_id')::uuid and g.trial_id=target_trial_id;
  end loop;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
    values(target_trial_id,audit_actor,audit_action,'sdda_entry',target_entry_id::text,before_state,
      public.sdda_entry_edit_payload(target_entry_id));
end;
$apply$;

create or replace function public.sdda_public_entry_for_edit(entry_code text, receipt_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,extensions
set row_security=off
as $public_read$
declare target_entry_id uuid; result jsonb;
begin
  select e.id into target_entry_id from public.sdda_entries e
    join public.sdda_trials t on t.id=e.trial_id
    where e.confirmation_code=entry_code
      and e.receipt_token_hash=encode(extensions.digest(receipt_token,'sha256'),'hex');
  if target_entry_id is null then raise exception 'Entry link is invalid'; end if;
  result:=public.sdda_entry_edit_payload(target_entry_id);
  return result||jsonb_build_object(
    'setup',(select jsonb_build_object(
      'name',t.name,'host_club',t.host_club,'venue',t.venue,'trial_format',t.trial_format,
      'payment_instructions',t.payment_instructions,'cancellation_policy',t.cancellation_policy,
      'days',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'day_number',d.day_number,'trial_date',d.trial_date) order by d.day_number)
        from public.sdda_trial_days d where d.trial_id=t.id),'[]'::jsonb),
      'offerings',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'trial_day_id',o.trial_day_id,'level',o.level,'component',o.component,'stream',o.stream))
        from public.sdda_trial_offerings o where o.trial_id=t.id),'[]'::jsonb),
      'game_offerings',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'trial_day_id',g.trial_day_id,'game_type',g.game_type,
        'entry_fee_cents',g.entry_fee_cents,'feo_fee_cents',g.feo_fee_cents)) from public.sdda_game_offerings g where g.trial_id=t.id),'[]'::jsonb)
    ) from public.sdda_trials t join public.sdda_entries e on e.trial_id=t.id where e.id=target_entry_id),
    'can_edit',exists(select 1 from public.sdda_entries e join public.sdda_trials t on t.id=e.trial_id
    where e.id=target_entry_id and e.confirmation_status='received' and t.status='entries_open'
      and (t.entry_close_at is null or now()<=t.entry_close_at)));
end;
$public_read$;

create or replace function public.sdda_update_public_entry(entry_code text, receipt_token text, submission jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
set row_security=off
as $public_update$
declare target_entry_id uuid;
begin
  select e.id into target_entry_id from public.sdda_entries e join public.sdda_trials t on t.id=e.trial_id
    where e.confirmation_code=entry_code
      and e.receipt_token_hash=encode(extensions.digest(receipt_token,'sha256'),'hex')
      and e.confirmation_status='received' and t.status='entries_open'
      and (t.entry_close_at is null or now()<=t.entry_close_at) for update of e;
  if target_entry_id is null then raise exception 'This entry can no longer be edited online'; end if;
  perform public.sdda_apply_entry_update(target_entry_id,submission,null,'entry.public_updated');
  return public.sdda_entry_edit_payload(target_entry_id)||jsonb_build_object('can_edit',true);
end;
$public_update$;

create or replace function public.sdda_secretary_entry_for_edit(target_entry_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
set row_security=off
as $secretary_read$
declare target_trial_id uuid;
begin
  select trial_id into target_trial_id from public.sdda_entries where id=target_entry_id;
  if target_trial_id is null or not public.sdda_can_manage_trial(target_trial_id)
    then raise exception 'Secretary access required'; end if;
  return public.sdda_entry_edit_payload(target_entry_id)||jsonb_build_object('can_edit',true);
end;
$secretary_read$;

create or replace function public.sdda_update_entry_as_secretary(target_entry_id uuid, submission jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
set row_security=off
as $secretary_update$
declare target_trial_id uuid;
begin
  select trial_id into target_trial_id from public.sdda_entries where id=target_entry_id for update;
  if target_trial_id is null or not public.sdda_can_manage_trial(target_trial_id)
    then raise exception 'Secretary access required'; end if;
  perform public.sdda_apply_entry_update(target_entry_id,submission,auth.uid(),'entry.secretary_updated');
  return public.sdda_entry_edit_payload(target_entry_id)||jsonb_build_object('can_edit',true);
end;
$secretary_update$;

create or replace function public.sdda_submit_public_entry_v2(target_trial_id uuid, submission jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
set row_security=off
as $submit_v2$
declare result jsonb;
begin
  -- The established submission function creates the entry and private receipt token.
  -- The atomic update applies the extended Games details, including Aerial category.
  result:=public.sdda_submit_public_entry(target_trial_id,submission);
  perform public.sdda_update_public_entry(result->>'confirmation_code',result->>'receipt_token',submission);
  return result;
end;
$submit_v2$;

revoke all on function public.sdda_entry_edit_payload(uuid) from public,anon,authenticated;
revoke all on function public.sdda_apply_entry_update(uuid,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.sdda_public_entry_for_edit(text,text) from public;
revoke all on function public.sdda_update_public_entry(text,text,jsonb) from public;
revoke all on function public.sdda_secretary_entry_for_edit(uuid) from public;
revoke all on function public.sdda_update_entry_as_secretary(uuid,jsonb) from public;
revoke all on function public.sdda_submit_public_entry_v2(uuid,jsonb) from public;
grant execute on function public.sdda_public_entry_for_edit(text,text) to anon,authenticated;
grant execute on function public.sdda_update_public_entry(text,text,jsonb) to anon,authenticated;
grant execute on function public.sdda_secretary_entry_for_edit(uuid) to authenticated;
grant execute on function public.sdda_update_entry_as_secretary(uuid,jsonb) to authenticated;
grant execute on function public.sdda_submit_public_entry_v2(uuid,jsonb) to anon,authenticated;

commit;
