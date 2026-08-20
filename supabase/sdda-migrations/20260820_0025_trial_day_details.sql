begin;

create or replace function public.sdda_update_trial_day_details(
  target_trial_day_id uuid,
  requested_trial_number text,
  requested_judge_name text
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $trial_day_details$
declare
  day_record public.sdda_trial_days%rowtype;
  before_record jsonb;
  after_record jsonb;
begin
  select * into day_record
  from public.sdda_trial_days
  where id = target_trial_day_id
  for update;

  if day_record.id is null or not public.sdda_can_manage_trial(day_record.trial_id) then
    raise exception 'Trial day not found or access denied';
  end if;

  before_record := jsonb_build_object(
    'sdda_trial_number', day_record.sdda_trial_number,
    'judge_name', day_record.judge_name
  );

  update public.sdda_trial_days set
    sdda_trial_number = nullif(btrim(requested_trial_number), ''),
    judge_name = nullif(btrim(requested_judge_name), '')
  where id = target_trial_day_id;

  select jsonb_build_object(
    'sdda_trial_number', sdda_trial_number,
    'judge_name', judge_name
  ) into after_record
  from public.sdda_trial_days
  where id = target_trial_day_id;

  insert into public.sdda_audit_records(
    trial_id, actor_id, action, entity_type, entity_id, before_state, after_state
  ) values (
    day_record.trial_id, auth.uid(), 'trial_day.details_updated', 'sdda_trial_day',
    target_trial_day_id::text, before_record, after_record
  );
end;
$trial_day_details$;

revoke all on function public.sdda_update_trial_day_details(uuid,text,text) from public, anon;
grant execute on function public.sdda_update_trial_day_details(uuid,text,text) to authenticated;

commit;
