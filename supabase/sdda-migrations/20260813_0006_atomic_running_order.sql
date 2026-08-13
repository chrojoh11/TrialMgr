begin;

create or replace function public.sdda_save_running_order(
  target_trial_id uuid,
  target_trial_day_id uuid,
  target_level text,
  target_component text,
  ordered_run_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  expected_count integer;
  run_id uuid;
  next_position integer := 0;
begin
  if auth.uid() is null or not public.sdda_can_manage_trial(target_trial_id) then
    raise exception 'Trial management permission required';
  end if;
  if target_level not in ('Started', 'Advanced', 'Excellent', 'Elite') then raise exception 'Invalid SDDA level'; end if;
  if target_component not in ('Container', 'Interior', 'Exterior') then raise exception 'Invalid SDDA component'; end if;
  select count(*) into expected_count from public.sdda_runs
  where trial_id=target_trial_id and trial_day_id=target_trial_day_id
    and level=target_level and component=target_component;
  if expected_count <> coalesce(cardinality(ordered_run_ids), 0)
    or (select count(distinct value) from unnest(ordered_run_ids) as value) <> expected_count
    or exists (select 1 from unnest(ordered_run_ids) value where not exists (
      select 1 from public.sdda_runs r where r.id=value and r.trial_id=target_trial_id
        and r.trial_day_id=target_trial_day_id and r.level=target_level and r.component=target_component
    )) then raise exception 'Running order must contain every run exactly once'; end if;
  update public.sdda_runs set running_position=null
  where trial_id=target_trial_id and trial_day_id=target_trial_day_id
    and level=target_level and component=target_component;
  foreach run_id in array ordered_run_ids loop
    next_position := next_position + 1;
    update public.sdda_runs set running_position=next_position where id=run_id;
  end loop;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,after_state)
  values(target_trial_id,auth.uid(),'running_order.saved','sdda_running_order',target_trial_day_id::text,
    jsonb_build_object('level',target_level,'component',target_component,'run_ids',to_jsonb(ordered_run_ids)));
  return next_position;
end;
$$;

revoke all on function public.sdda_save_running_order(uuid,uuid,text,text,uuid[]) from public;
revoke all on function public.sdda_save_running_order(uuid,uuid,text,text,uuid[]) from anon;
grant execute on function public.sdda_save_running_order(uuid,uuid,text,text,uuid[]) to authenticated;
commit;
