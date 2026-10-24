-- Add permanent post-2026 Mountain and Pacific offsets without rewriting any
-- existing trial schedules. The UI uses these for newly selected schedules.
alter table public.sdda_trials alter column timezone set default 'Etc/GMT+6';

create or replace function public.sdda_set_entry_schedule(
  target_trial_id uuid,
  requested_general_open_local timestamp without time zone,
  requested_close_local timestamp without time zone,
  requested_timezone text
)
returns void
language plpgsql
security invoker
set search_path=public
as $$
declare
  trial_timezone text:=nullif(btrim(requested_timezone),'');
  general_open_at timestamptz;
  registered_open_at timestamptz;
  close_at timestamptz;
begin
  if auth.uid() is null or not public.sdda_can_manage_trial(target_trial_id) then
    raise exception 'Not authorized to manage this trial';
  end if;
  if trial_timezone is null or trial_timezone not in (
    'America/St_Johns','America/Halifax','America/Toronto','America/Winnipeg',
    'America/Edmonton','America/Vancouver','Etc/GMT+6','Etc/GMT+7'
  ) then
    raise exception 'Choose a supported Canadian trial time zone';
  end if;
  if requested_general_open_local is null or requested_close_local is null then
    raise exception 'General opening and closing date/time are required';
  end if;
  general_open_at:=requested_general_open_local at time zone trial_timezone;
  registered_open_at:=general_open_at-interval '3 days';
  close_at:=requested_close_local at time zone trial_timezone;
  if close_at<=general_open_at then raise exception 'Entry closing must be after general opening'; end if;
  update public.sdda_trials
  set timezone=trial_timezone,entry_open_at=registered_open_at,
      general_entry_open_at=general_open_at,entry_close_at=close_at,updated_at=now()
  where id=target_trial_id;
end;
$$;

revoke all on function public.sdda_set_entry_schedule(uuid,timestamp without time zone,timestamp without time zone,text) from public,anon;
grant execute on function public.sdda_set_entry_schedule(uuid,timestamp without time zone,timestamp without time zone,text) to authenticated;


