begin;

create or replace function public.sdda_public_trial_entry_timing(target_trial_id uuid)
returns jsonb
language sql stable security definer set search_path=public set row_security=off
as $timing$
  select jsonb_build_object(
    'name',name,
    'host_club',host_club,
    'venue',venue,
    'timezone',timezone,
    'entry_open_at',entry_open_at,
    'general_entry_open_at',general_entry_open_at,
    'entry_close_at',entry_close_at
  )
  from public.sdda_trials
  where id=target_trial_id and status in ('draft','entries_open');
$timing$;

revoke all on function public.sdda_public_trial_entry_timing(uuid) from public,authenticated;
grant execute on function public.sdda_public_trial_entry_timing(uuid) to anon,authenticated;

commit;
