begin;

drop function if exists public.sdda_set_entry_schedule(uuid,timestamptz,timestamptz);

create function public.sdda_set_entry_schedule(
  target_trial_id uuid,
  requested_general_open_local text,
  requested_close_local text,
  requested_timezone text
) returns void
language plpgsql security definer set search_path=public set row_security=off
as $schedule$
declare
  before_record jsonb;
  after_record jsonb;
  trial_timezone text;
  general_open_at timestamptz;
  close_at timestamptz;
begin
  if not public.sdda_can_manage_trial(target_trial_id) then raise exception 'Trial setup access denied'; end if;
  if nullif(trim(requested_general_open_local),'') is null or nullif(trim(requested_close_local),'') is null then
    raise exception 'General opening and closing date/time are required';
  end if;
  perform 1 from public.sdda_trials where id=target_trial_id for update;
  trial_timezone:=nullif(trim(requested_timezone),'');
  if trial_timezone is null or trial_timezone not in ('America/St_Johns','America/Halifax','America/Toronto','America/Winnipeg','America/Edmonton','America/Vancouver') then
    raise exception 'Choose a supported Canadian trial timezone';
  end if;
  begin
    general_open_at:=(requested_general_open_local::timestamp at time zone trial_timezone);
    close_at:=(requested_close_local::timestamp at time zone trial_timezone);
  exception when others then
    raise exception 'Enter valid opening and closing dates and times for timezone %',trial_timezone;
  end;
  if close_at<=general_open_at then raise exception 'Entry closing must be after general opening'; end if;
  select jsonb_build_object('registered_open_at',entry_open_at,'general_open_at',general_entry_open_at,'close_at',entry_close_at,'timezone',timezone,'status',status)
    into before_record from public.sdda_trials where id=target_trial_id;
  update public.sdda_trials set
    entry_open_at=general_open_at-interval '3 days',
    general_entry_open_at=general_open_at,
    entry_close_at=close_at,
    timezone=trial_timezone,
    status='entries_open'
  where id=target_trial_id;
  select jsonb_build_object('registered_open_at',entry_open_at,'general_open_at',general_entry_open_at,'close_at',entry_close_at,'timezone',timezone,'status',status)
    into after_record from public.sdda_trials where id=target_trial_id;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
  values(target_trial_id,auth.uid(),'trial.entry_schedule_updated','sdda_trial',target_trial_id::text,before_record,after_record);
end;
$schedule$;

revoke all on function public.sdda_set_entry_schedule(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.sdda_set_entry_schedule(uuid,text,text,text) to authenticated;

commit;
