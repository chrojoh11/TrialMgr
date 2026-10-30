begin;

create or replace function public.sdda_public_trial_entry_timing(target_trial_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public
set row_security=off
as $timing$
  select jsonb_build_object(
    'name',name,
    'host_club',host_club,
    'venue',venue,
    'timezone',timezone,
    'status',status,
    'entry_open_at',entry_open_at,
    'general_entry_open_at',general_entry_open_at,
    'entry_close_at',entry_close_at
  )
  from public.sdda_trials
  where id=target_trial_id;
$timing$;

revoke all on function public.sdda_public_trial_entry_timing(uuid) from public,anon,authenticated;
grant execute on function public.sdda_public_trial_entry_timing(uuid) to anon,authenticated;

commit;
