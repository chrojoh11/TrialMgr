begin;

create or replace function public.sdda_assert_entry_capacity(target_entry_id uuid)
returns void
language plpgsql
security definer
set search_path=public
set row_security=off
as $capacity$
declare
  full_scent record;
  full_game record;
begin
  select td.day_number,o.level,o.component,o.stream,o.capacity,count(other_run.id) as accepted_count
  into full_scent
  from public.sdda_runs selected_run
  join public.sdda_trial_offerings o
    on o.trial_id=selected_run.trial_id
    and o.trial_day_id=selected_run.trial_day_id
    and o.level=selected_run.level
    and o.component=selected_run.component
    and o.stream=selected_run.stream
  join public.sdda_trial_days td on td.id=o.trial_day_id
  left join public.sdda_runs other_run
    on other_run.trial_id=o.trial_id
    and other_run.trial_day_id=o.trial_day_id
    and other_run.level=o.level
    and other_run.component=o.component
    and other_run.stream=o.stream
    and other_run.entry_id<>target_entry_id
  left join public.sdda_entries other_entry
    on other_entry.id=other_run.entry_id
    and other_entry.confirmation_status='accepted'
  where selected_run.entry_id=target_entry_id and o.capacity is not null
  group by td.day_number,o.level,o.component,o.stream,o.capacity
  having count(other_run.id) filter (where other_entry.id is not null)>=o.capacity
  order by td.day_number,o.level,o.component,o.stream
  limit 1;

  if full_scent.day_number is not null then
    raise exception 'Day % % % % is at capacity (% accepted). Choose Waitlisted or increase the offering capacity.',
      full_scent.day_number,full_scent.level,full_scent.component,full_scent.stream,full_scent.capacity;
  end if;

  select td.day_number,g.game_type,g.capacity,count(other_run.id) as accepted_count
  into full_game
  from public.sdda_game_runs selected_run
  join public.sdda_game_offerings g on g.id=selected_run.offering_id
  join public.sdda_trial_days td on td.id=g.trial_day_id
  left join public.sdda_game_runs other_run
    on other_run.offering_id=g.id and other_run.entry_id<>target_entry_id
  left join public.sdda_entries other_entry
    on other_entry.id=other_run.entry_id
    and other_entry.confirmation_status='accepted'
  where selected_run.entry_id=target_entry_id and g.capacity is not null
  group by td.day_number,g.game_type,g.capacity
  having count(other_run.id) filter (where other_entry.id is not null)>=g.capacity
  order by td.day_number,g.game_type
  limit 1;

  if full_game.day_number is not null then
    raise exception 'Day % % is at capacity (% accepted). Choose Waitlisted or increase the offering capacity.',
      full_game.day_number,full_game.game_type,full_game.capacity;
  end if;
end;
$capacity$;

do $preserve_status$
begin
  if to_regprocedure('public.sdda_set_entry_confirmation_status_base_v48(uuid,text)') is null then
    alter function public.sdda_set_entry_confirmation_status(uuid,text)
      rename to sdda_set_entry_confirmation_status_base_v48;
  end if;
end;
$preserve_status$;

create or replace function public.sdda_set_entry_confirmation_status(
  target_entry_id uuid,requested_status text
)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $status$
begin
  if requested_status='accepted' then
    perform public.sdda_assert_entry_capacity(target_entry_id);
  end if;
  perform public.sdda_set_entry_confirmation_status_base_v48(target_entry_id,requested_status);
end;
$status$;

do $preserve_update$
begin
  if to_regprocedure('public.sdda_apply_entry_update_base_v48(uuid,jsonb,uuid,text)') is null then
    alter function public.sdda_apply_entry_update(uuid,jsonb,uuid,text)
      rename to sdda_apply_entry_update_base_v48;
  end if;
end;
$preserve_update$;

create or replace function public.sdda_apply_entry_update(
  target_entry_id uuid,submission jsonb,audit_actor uuid,audit_action text
)
returns void
language plpgsql
security definer
set search_path=public
set row_security=off
as $update$
declare current_status text;
begin
  select confirmation_status into current_status
  from public.sdda_entries where id=target_entry_id;

  perform public.sdda_apply_entry_update_base_v48(
    target_entry_id,submission,audit_actor,audit_action
  );

  if current_status='accepted' then
    perform public.sdda_assert_entry_capacity(target_entry_id);
  end if;
end;
$update$;

revoke all on function public.sdda_assert_entry_capacity(uuid) from public,anon,authenticated;
revoke all on function public.sdda_set_entry_confirmation_status_base_v48(uuid,text) from public,anon,authenticated;
revoke all on function public.sdda_set_entry_confirmation_status(uuid,text) from public,anon,authenticated;
revoke all on function public.sdda_apply_entry_update_base_v48(uuid,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.sdda_apply_entry_update(uuid,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.sdda_set_entry_confirmation_status(uuid,text) to authenticated;

commit;
