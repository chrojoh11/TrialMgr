begin;

-- Selection waitlists mean a trial may retain non-accepted run records. Running
-- orders contain accepted selections only, so validate and renumber that same
-- set instead of requiring withdrawn or waitlisted records in the submitted list.
create or replace function public.sdda_save_running_order(
  target_trial_id uuid,
  target_trial_day_id uuid,
  target_level text,
  target_component text,
  ordered_run_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path=public
set row_security=off
as $scent_order$
declare expected_count integer; run_id uuid; next_position integer:=0;
begin
  if auth.uid() is null or not public.sdda_can_manage_trial(target_trial_id) then
    raise exception 'Trial management permission required';
  end if;
  if target_level not in ('Started','Advanced','Excellent','Elite') then raise exception 'Invalid SDDA level'; end if;
  if target_component not in ('Container','Interior','Exterior') then raise exception 'Invalid SDDA component'; end if;

  select count(*) into expected_count
  from public.sdda_runs r join public.sdda_entries e on e.id=r.entry_id
  where r.trial_id=target_trial_id and r.trial_day_id=target_trial_day_id
    and r.level=target_level and r.component=target_component
    and r.selection_status='accepted' and e.confirmation_status='accepted';

  if expected_count<>coalesce(cardinality(ordered_run_ids),0)
    or (select count(distinct value) from unnest(coalesce(ordered_run_ids,'{}'::uuid[])) value)<>expected_count
    or exists(select 1 from unnest(coalesce(ordered_run_ids,'{}'::uuid[])) value where not exists(
      select 1 from public.sdda_runs r join public.sdda_entries e on e.id=r.entry_id
      where r.id=value and r.trial_id=target_trial_id and r.trial_day_id=target_trial_day_id
        and r.level=target_level and r.component=target_component
        and r.selection_status='accepted' and e.confirmation_status='accepted'
    )) then raise exception 'The accepted Scent roster changed. Reload the page and reorder again.'; end if;

  update public.sdda_runs set running_position=null
  where trial_id=target_trial_id and trial_day_id=target_trial_day_id
    and level=target_level and component=target_component;
  foreach run_id in array coalesce(ordered_run_ids,'{}'::uuid[]) loop
    next_position:=next_position+1;
    update public.sdda_runs set running_position=next_position,updated_at=now() where id=run_id;
  end loop;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,after_state)
  values(target_trial_id,auth.uid(),'running_order.saved','sdda_running_order',target_trial_day_id::text,
    jsonb_build_object('level',target_level,'component',target_component,'run_ids',to_jsonb(ordered_run_ids)));
  return next_position;
end;
$scent_order$;

create or replace function public.sdda_save_game_running_order(
  target_trial_id uuid,
  target_offering_id uuid,
  ordered_run_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path=public
set row_security=off
as $game_order$
declare expected_count integer; run_id uuid; next_position integer:=0; selected_game text;
begin
  if auth.uid() is null or not public.sdda_can_manage_trial(target_trial_id) then
    raise exception 'Trial management permission required';
  end if;
  select game_type into selected_game from public.sdda_game_offerings
  where id=target_offering_id and trial_id=target_trial_id;
  if selected_game is null then raise exception 'Games offering was not found for this trial'; end if;

  select count(*) into expected_count
  from public.sdda_game_runs r join public.sdda_entries e on e.id=r.entry_id
  where r.trial_id=target_trial_id and r.offering_id=target_offering_id
    and r.selection_status='accepted' and e.confirmation_status='accepted';
  if expected_count<>coalesce(cardinality(ordered_run_ids),0)
    or (select count(distinct value) from unnest(coalesce(ordered_run_ids,'{}'::uuid[])) value)<>expected_count
    or exists(select 1 from unnest(coalesce(ordered_run_ids,'{}'::uuid[])) value where not exists(
      select 1 from public.sdda_game_runs r join public.sdda_entries e on e.id=r.entry_id
      where r.id=value and r.trial_id=target_trial_id and r.offering_id=target_offering_id
        and r.selection_status='accepted' and e.confirmation_status='accepted'
    )) then raise exception 'The accepted Games roster changed. Reload the page and reorder again.'; end if;

  update public.sdda_game_runs set running_position=null where offering_id=target_offering_id;
  foreach run_id in array coalesce(ordered_run_ids,'{}'::uuid[]) loop
    next_position:=next_position+1;
    update public.sdda_game_runs set running_position=next_position,updated_at=now() where id=run_id;
  end loop;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,after_state)
  values(target_trial_id,auth.uid(),'game_running_order.saved','sdda_game_running_order',target_offering_id::text,
    jsonb_build_object('game_type',selected_game,'run_ids',to_jsonb(ordered_run_ids)));
  return next_position;
end;
$game_order$;

revoke all on function public.sdda_save_running_order(uuid,uuid,text,text,uuid[]) from public,anon,authenticated;
revoke all on function public.sdda_save_game_running_order(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.sdda_save_running_order(uuid,uuid,text,text,uuid[]) to authenticated;
grant execute on function public.sdda_save_game_running_order(uuid,uuid,uuid[]) to authenticated;

commit;
