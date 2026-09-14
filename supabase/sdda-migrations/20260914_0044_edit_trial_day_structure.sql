begin;

create or replace function public.sdda_replace_trial_day_schedule(
  target_trial_id uuid,
  requested_days jsonb
) returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $schedule$
declare
  selected_trial public.sdda_trials%rowtype;
  requested_count integer;
  existing_count integer;
  day_index integer;
  requested_date date;
  before_days jsonb;
  after_days jsonb;
  removed_day public.sdda_trial_days%rowtype;
begin
  select * into selected_trial
  from public.sdda_trials
  where id=target_trial_id
  for update;

  if selected_trial.id is null or not public.sdda_can_manage_trial(target_trial_id) then
    raise exception 'Trial not found or access denied';
  end if;
  if selected_trial.status='completed' then
    raise exception 'Reopen the completed trial before changing its days';
  end if;
  if jsonb_typeof(requested_days)<>'array' then
    raise exception 'Trial days must be supplied as an array';
  end if;

  requested_count:=jsonb_array_length(requested_days);
  if requested_count<1 or requested_count>4 then
    raise exception 'An SDDA TrialDesk trial must contain between one and four days';
  end if;
  if exists(
    select 1
    from jsonb_array_elements_text(requested_days) value
    group by value
    having count(*)>1
  ) then
    raise exception 'Each trial day must have a different date';
  end if;
  for day_index in 0..requested_count-1 loop
    begin
      requested_date:=(requested_days->>day_index)::date;
    exception when others then
      raise exception 'Every trial day requires a valid date';
    end;
    if requested_date is null then
      raise exception 'Every trial day requires a valid date';
    end if;
    if day_index>0 and requested_date<=(requested_days->>(day_index-1))::date then
      raise exception 'Trial dates must be in chronological order';
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'day_number',day_number,'trial_date',trial_date,'sdda_trial_number',sdda_trial_number,
    'judge_name',judge_name,'entries_open',entries_open
  ) order by day_number),'[]'::jsonb),count(*)
  into before_days,existing_count
  from public.sdda_trial_days
  where trial_id=target_trial_id;

  if requested_count<existing_count then
    for day_index in reverse existing_count..requested_count+1 loop
      select * into removed_day
      from public.sdda_trial_days
      where trial_id=target_trial_id and day_number=day_index
      for update;

      if exists(select 1 from public.sdda_runs where trial_day_id=removed_day.id)
        or exists(select 1 from public.sdda_game_runs where trial_day_id=removed_day.id) then
        raise exception 'Day % cannot be removed because competitor runs exist',day_index;
      end if;
      if exists(select 1 from public.sdda_trial_offerings where trial_day_id=removed_day.id)
        or exists(select 1 from public.sdda_game_offerings where trial_day_id=removed_day.id) then
        raise exception 'Clear every offering from Day % before removing it',day_index;
      end if;
      delete from public.sdda_trial_days where id=removed_day.id;
    end loop;
  end if;

  -- Move existing dates out of the way so swaps remain atomic and never detach offerings.
  update public.sdda_trial_days
  set trial_date=date '1900-01-01'+day_number
  where trial_id=target_trial_id;

  for day_index in 1..least(existing_count,requested_count) loop
    update public.sdda_trial_days
    set trial_date=(requested_days->>(day_index-1))::date
    where trial_id=target_trial_id and day_number=day_index;
  end loop;
  if requested_count>existing_count then
    for day_index in existing_count+1..requested_count loop
      insert into public.sdda_trial_days(trial_id,day_number,trial_date)
      values(target_trial_id,day_index,(requested_days->>(day_index-1))::date);
    end loop;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'day_number',day_number,'trial_date',trial_date,'sdda_trial_number',sdda_trial_number,
    'judge_name',judge_name,'entries_open',entries_open
  ) order by day_number),'[]'::jsonb)
  into after_days
  from public.sdda_trial_days
  where trial_id=target_trial_id;

  if before_days is distinct from after_days then
    insert into public.sdda_audit_records(
      trial_id,actor_id,action,entity_type,entity_id,before_state,after_state
    ) values(
      target_trial_id,auth.uid(),'trial.days_updated','sdda_trial',target_trial_id::text,
      jsonb_build_object('days',before_days),jsonb_build_object('days',after_days)
    );
  end if;
end;
$schedule$;

revoke all on function public.sdda_replace_trial_day_schedule(uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.sdda_replace_trial_day_schedule(uuid,jsonb)
  to authenticated;

commit;
