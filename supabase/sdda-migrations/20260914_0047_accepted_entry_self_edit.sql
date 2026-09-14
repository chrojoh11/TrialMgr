begin;

create or replace function public.sdda_public_entry_is_editable(target_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
set row_security=off
as $editable$
  select exists(
    select 1
    from public.sdda_entries e
    join public.sdda_trials t on t.id=e.trial_id
    where e.id=target_entry_id
      and e.confirmation_status in ('received','accepted')
      and t.status='entries_open'
      and (t.entry_open_at is null or now()>=t.entry_open_at)
      and (t.entry_close_at is null or now()<=t.entry_close_at)
      and not exists(
        select 1 from public.sdda_runs r
        join public.sdda_scores s on s.run_id=r.id
        where r.entry_id=e.id
      )
      and not exists(
        select 1 from public.sdda_game_runs gr
        join public.sdda_game_scores gs on gs.game_run_id=gr.id
        where gr.entry_id=e.id
      )
  );
$editable$;

-- Running positions are working-day logistics and may be regenerated after an
-- amendment. A recorded score is the definitive boundary for replacing runs.
create or replace function public.sdda_entry_has_recorded_score(target_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
set row_security=off
as $has_score$
  select
    exists(
      select 1 from public.sdda_runs r
      join public.sdda_scores s on s.run_id=r.id
      where r.entry_id=target_entry_id
    )
    or exists(
      select 1 from public.sdda_game_runs gr
      join public.sdda_game_scores gs on gs.game_run_id=gr.id
      where gr.entry_id=target_entry_id
    );
$has_score$;

do $preserve_apply$
begin
  if to_regprocedure('public.sdda_apply_entry_update_base_v47(uuid,jsonb,uuid,text)') is null then
    alter function public.sdda_apply_entry_update(uuid,jsonb,uuid,text)
      rename to sdda_apply_entry_update_base_v47;
  end if;
end;
$preserve_apply$;

create or replace function public.sdda_apply_entry_update(
  target_entry_id uuid,submission jsonb,audit_actor uuid,audit_action text
)
returns void
language plpgsql
security definer
set search_path=public
set row_security=off
as $apply$
declare
  scent_positions jsonb;
  game_positions jsonb;
begin
  if public.sdda_entry_has_recorded_score(target_entry_id) then
    raise exception 'Entry selections cannot be replaced after a score exists';
  end if;

  -- The established updater validates and replaces the complete entry. Its old
  -- running-position guard is bypassed only while this transaction temporarily
  -- clears positions on the affected runs; scores have already been excluded.
  select coalesce(jsonb_agg(jsonb_build_object(
    'offering_id',o.id,'running_position',r.running_position
  )),'[]'::jsonb) into scent_positions
  from public.sdda_runs r
  join public.sdda_trial_offerings o
    on o.trial_id=r.trial_id and o.trial_day_id=r.trial_day_id
    and o.level=r.level and o.component=r.component and o.stream=r.stream
  where r.entry_id=target_entry_id and r.running_position is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'offering_id',gr.offering_id,'running_position',gr.running_position
  )),'[]'::jsonb) into game_positions
  from public.sdda_game_runs gr
  where gr.entry_id=target_entry_id and gr.running_position is not null;

  update public.sdda_runs set running_position=null
  where entry_id=target_entry_id and running_position is not null;
  update public.sdda_game_runs set running_position=null
  where entry_id=target_entry_id and running_position is not null;

  perform public.sdda_apply_entry_update_base_v47(
    target_entry_id,submission,audit_actor,audit_action
  );

  update public.sdda_runs r set running_position=(saved.item->>'running_position')::integer
  from public.sdda_trial_offerings o,
    lateral jsonb_array_elements(scent_positions) saved(item)
  where r.entry_id=target_entry_id
    and o.trial_id=r.trial_id and o.trial_day_id=r.trial_day_id
    and o.level=r.level and o.component=r.component and o.stream=r.stream
    and o.id=(saved.item->>'offering_id')::uuid;

  update public.sdda_game_runs gr set running_position=(saved.item->>'running_position')::integer
  from lateral jsonb_array_elements(game_positions) saved(item)
  where gr.entry_id=target_entry_id
    and gr.offering_id=(saved.item->>'offering_id')::uuid;
end;
$apply$;

do $preserve_read$
begin
  if to_regprocedure('public.sdda_public_entry_for_edit_base_v47(text,text)') is null then
    alter function public.sdda_public_entry_for_edit(text,text)
      rename to sdda_public_entry_for_edit_base_v47;
  end if;
end;
$preserve_read$;

create or replace function public.sdda_public_entry_for_edit(entry_code text,receipt_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
set row_security=off
as $public_read$
declare
  result jsonb;
  target_entry_id uuid;
begin
  result:=public.sdda_public_entry_for_edit_base_v47(entry_code,receipt_token);
  target_entry_id:=(result->>'entry_id')::uuid;
  return result||jsonb_build_object('can_edit',public.sdda_public_entry_is_editable(target_entry_id));
end;
$public_read$;

create or replace function public.sdda_update_public_entry(entry_code text,receipt_token text,submission jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
set row_security=off
as $public_update$
declare target_entry_id uuid;
begin
  select e.id into target_entry_id
  from public.sdda_entries e
  where e.confirmation_code=entry_code
    and e.receipt_token_hash=encode(extensions.digest(receipt_token,'sha256'),'hex')
  for update;
  if target_entry_id is null or not public.sdda_public_entry_is_editable(target_entry_id) then
    raise exception 'This entry can no longer be edited online. Contact the trial secretary.';
  end if;
  perform public.sdda_apply_entry_update(target_entry_id,submission,null,'entry.public_updated');
  return public.sdda_entry_edit_payload(target_entry_id)||jsonb_build_object('can_edit',true);
end;
$public_update$;

create or replace function public.sdda_public_entry_by_registration(target_trial_id uuid,registration_number text,verification_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
set row_security=off
as $lookup$
declare target_entry_id uuid; result jsonb;
begin
  if length(trim(coalesce(registration_number,'')))<1 or position('@' in trim(coalesce(verification_email,'')))<2 then
    raise exception 'Enter the SDDA registration or confirmation number and entry email';
  end if;
  select e.id into target_entry_id
  from public.sdda_entries e
  join public.sdda_dogs d on d.id=e.dog_id
  where e.trial_id=target_trial_id
    and (lower(trim(d.sdda_registration_number))=lower(trim(registration_number))
      or lower(trim(e.confirmation_code))=lower(trim(registration_number)))
    and lower(trim(e.handler_email))=lower(trim(verification_email))
  order by e.submitted_at desc nulls last limit 1;
  if target_entry_id is null then
    raise exception 'The number and email could not be verified for this trial';
  end if;
  result:=public.sdda_entry_edit_payload(target_entry_id);
  return result||jsonb_build_object('can_edit',public.sdda_public_entry_is_editable(target_entry_id));
end;
$lookup$;

create or replace function public.sdda_update_public_entry_by_registration(
  target_trial_id uuid,registration_number text,verification_email text,submission jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
set row_security=off
as $update_by_registration$
declare target_entry_id uuid;
begin
  select e.id into target_entry_id
  from public.sdda_entries e
  join public.sdda_dogs d on d.id=e.dog_id
  where e.trial_id=target_trial_id
    and (lower(trim(d.sdda_registration_number))=lower(trim(registration_number))
      or lower(trim(e.confirmation_code))=lower(trim(registration_number)))
    and lower(trim(e.handler_email))=lower(trim(verification_email))
  order by e.submitted_at desc nulls last limit 1
  for update of e;
  if target_entry_id is null or not public.sdda_public_entry_is_editable(target_entry_id) then
    raise exception 'This entry could not be verified or can no longer be edited online. Contact the trial secretary.';
  end if;
  perform public.sdda_apply_entry_update(target_entry_id,submission,null,'entry.public_updated');
  return public.sdda_entry_edit_payload(target_entry_id)||jsonb_build_object('can_edit',true);
end;
$update_by_registration$;

revoke all on function public.sdda_public_entry_is_editable(uuid) from public,anon,authenticated;
revoke all on function public.sdda_entry_has_recorded_score(uuid) from public,anon,authenticated;
revoke all on function public.sdda_apply_entry_update_base_v47(uuid,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.sdda_apply_entry_update(uuid,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.sdda_public_entry_for_edit_base_v47(text,text) from public,anon,authenticated;
revoke all on function public.sdda_public_entry_for_edit(text,text) from public,anon,authenticated;
revoke all on function public.sdda_update_public_entry(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.sdda_public_entry_by_registration(uuid,text,text) from public,anon,authenticated;
revoke all on function public.sdda_update_public_entry_by_registration(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.sdda_public_entry_for_edit(text,text) to anon,authenticated;
grant execute on function public.sdda_update_public_entry(text,text,jsonb) to anon,authenticated;
grant execute on function public.sdda_public_entry_by_registration(uuid,text,text) to anon,authenticated;
grant execute on function public.sdda_update_public_entry_by_registration(uuid,text,text,jsonb) to anon,authenticated;

commit;
