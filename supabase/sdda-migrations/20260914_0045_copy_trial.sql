begin;

create or replace function public.sdda_copy_trial(
  source_trial_id uuid,
  requested_name text,
  requested_dates jsonb
) returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $copy$
declare
  source_trial public.sdda_trials%rowtype;
  source_day_count integer;
  requested_count integer;
  new_trial_id uuid;
  day_index integer;
  requested_date date;
begin
  select * into source_trial
  from public.sdda_trials
  where id=source_trial_id;

  if source_trial.id is null or not public.sdda_can_manage_trial(source_trial_id) then
    raise exception 'Source trial not found or access denied';
  end if;
  if length(btrim(coalesce(requested_name,''))) not between 3 and 120 then
    raise exception 'Trial name must be between 3 and 120 characters';
  end if;
  if jsonb_typeof(requested_dates)<>'array' then
    raise exception 'New trial dates must be supplied as an array';
  end if;

  select count(*) into source_day_count
  from public.sdda_trial_days where trial_id=source_trial_id;
  requested_count:=jsonb_array_length(requested_dates);
  if requested_count<>source_day_count then
    raise exception 'Provide one new date for each of the source trial''s % days',source_day_count;
  end if;
  if requested_count<1 or requested_count>4 then
    raise exception 'An SDDA TrialDesk trial must contain between one and four days';
  end if;
  if exists(
    select 1 from jsonb_array_elements_text(requested_dates) value
    group by value having count(*)>1
  ) then
    raise exception 'Each copied trial day must have a different date';
  end if;
  for day_index in 0..requested_count-1 loop
    begin
      requested_date:=(requested_dates->>day_index)::date;
    exception when others then
      raise exception 'Every copied trial day requires a valid date';
    end;
    if requested_date is null then
      raise exception 'Every copied trial day requires a valid date';
    end if;
    if day_index>0 and requested_date<=(requested_dates->>(day_index-1))::date then
      raise exception 'Copied trial dates must be in chronological order';
    end if;
  end loop;

  insert into public.sdda_trials(
    name,host_club,venue,timezone,status,owner_id,trial_format,
    scent_component_fee_cents,scent_three_component_fee_cents,elite_fee_cents,
    secretary_name,secretary_email,secretary_phone,payment_instructions,cancellation_policy
  ) values(
    btrim(requested_name),source_trial.host_club,source_trial.venue,source_trial.timezone,
    'draft',auth.uid(),source_trial.trial_format,
    source_trial.scent_component_fee_cents,source_trial.scent_three_component_fee_cents,
    source_trial.elite_fee_cents,source_trial.secretary_name,source_trial.secretary_email,
    source_trial.secretary_phone,source_trial.payment_instructions,source_trial.cancellation_policy
  ) returning id into new_trial_id;

  for day_index in 1..requested_count loop
    insert into public.sdda_trial_days(trial_id,day_number,trial_date,entries_open)
    values(new_trial_id,day_index,(requested_dates->>(day_index-1))::date,true);
  end loop;

  insert into public.sdda_trial_offerings(
    trial_id,trial_day_id,level,component,stream,judge_name,capacity,feo_allowed
  )
  select new_trial_id,new_day.id,o.level,o.component,o.stream,null,o.capacity,o.feo_allowed
  from public.sdda_trial_offerings o
  join public.sdda_trial_days old_day on old_day.id=o.trial_day_id
  join public.sdda_trial_days new_day
    on new_day.trial_id=new_trial_id and new_day.day_number=old_day.day_number
  where o.trial_id=source_trial_id;

  insert into public.sdda_game_offerings(
    trial_id,trial_day_id,game_type,judge_name,capacity,entry_fee_cents,feo_fee_cents,feo_allowed
  )
  select new_trial_id,new_day.id,g.game_type,null,g.capacity,g.entry_fee_cents,g.feo_fee_cents,g.feo_allowed
  from public.sdda_game_offerings g
  join public.sdda_trial_days old_day on old_day.id=g.trial_day_id
  join public.sdda_trial_days new_day
    on new_day.trial_id=new_trial_id and new_day.day_number=old_day.day_number
  where g.trial_id=source_trial_id;

  insert into public.sdda_audit_records(
    trial_id,actor_id,action,entity_type,entity_id,before_state,after_state
  ) values(
    new_trial_id,auth.uid(),'trial.copied','sdda_trial',new_trial_id::text,null,
    jsonb_build_object(
      'name',btrim(requested_name),'source_trial_name',source_trial.name,
      'day_count',requested_count,'entries_copied',false,'judges_copied',false,
      'trial_numbers_copied',false
    )
  );

  return new_trial_id;
end;
$copy$;

revoke all on function public.sdda_copy_trial(uuid,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.sdda_copy_trial(uuid,text,jsonb)
  to authenticated;

commit;
