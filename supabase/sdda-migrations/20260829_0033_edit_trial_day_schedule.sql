begin;

create or replace function public.sdda_update_trial_day_schedule(
  target_trial_day_id uuid,
  requested_trial_date date,
  requested_trial_number text,
  requested_judge_name text
) returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $schedule$
declare
  day_record public.sdda_trial_days%rowtype;
  previous_date date;
  next_date date;
  before_record jsonb;
  after_record jsonb;
begin
  select * into day_record
  from public.sdda_trial_days
  where id=target_trial_day_id
  for update;

  if day_record.id is null or not public.sdda_can_manage_trial(day_record.trial_id) then
    raise exception 'Trial day not found or access denied';
  end if;
  if requested_trial_date is null then
    raise exception 'Trial date is required';
  end if;
  if exists(
    select 1 from public.sdda_trial_days d
    where d.trial_id=day_record.trial_id
      and d.id<>day_record.id
      and d.trial_date=requested_trial_date
  ) then
    raise exception 'Each trial day must have a different date';
  end if;

  select max(d.trial_date) into previous_date
  from public.sdda_trial_days d
  where d.trial_id=day_record.trial_id and d.day_number<day_record.day_number;
  select min(d.trial_date) into next_date
  from public.sdda_trial_days d
  where d.trial_id=day_record.trial_id and d.day_number>day_record.day_number;
  if previous_date is not null and requested_trial_date<=previous_date then
    raise exception 'Day % must be after the preceding trial day',day_record.day_number;
  end if;
  if next_date is not null and requested_trial_date>=next_date then
    raise exception 'Day % must be before the following trial day',day_record.day_number;
  end if;

  before_record:=jsonb_build_object(
    'trial_date',day_record.trial_date,
    'sdda_trial_number',day_record.sdda_trial_number,
    'judge_name',day_record.judge_name
  );

  update public.sdda_trial_days set
    trial_date=requested_trial_date,
    sdda_trial_number=nullif(btrim(requested_trial_number),''),
    judge_name=nullif(btrim(requested_judge_name),'')
  where id=target_trial_day_id;

  select jsonb_build_object(
    'trial_date',d.trial_date,
    'sdda_trial_number',d.sdda_trial_number,
    'judge_name',d.judge_name
  ) into after_record
  from public.sdda_trial_days d
  where d.id=target_trial_day_id;

  if before_record is distinct from after_record then
    insert into public.sdda_audit_records(
      trial_id,actor_id,action,entity_type,entity_id,before_state,after_state
    ) values(
      day_record.trial_id,auth.uid(),'trial_day.schedule_updated','sdda_trial_day',
      target_trial_day_id::text,before_record,after_record
    );
  end if;
end;
$schedule$;

revoke all on function public.sdda_update_trial_day_schedule(uuid,date,text,text)
  from public,anon;
grant execute on function public.sdda_update_trial_day_schedule(uuid,date,text,text)
  to authenticated;

commit;
