begin;

create or replace function public.sdda_set_entry_confirmation_status(
  target_entry_id uuid,
  requested_status text
)
returns void
language plpgsql
security definer
set search_path=public
set row_security=off
as $status$
declare
  target_trial_id uuid;
begin
  if requested_status not in ('received','accepted','waitlisted','rejected') then
    raise exception 'Invalid entry confirmation status';
  end if;

  select trial_id into target_trial_id
  from public.sdda_entries
  where id=target_entry_id;

  if target_trial_id is null or not public.sdda_can_manage_trial(target_trial_id) then
    raise exception 'Entry not found or access denied';
  end if;

  if requested_status='accepted' then
    perform public.sdda_assert_entry_capacity(target_entry_id);
  end if;

  perform public.sdda_set_entry_confirmation_status_base_v48(target_entry_id,requested_status);
end;
$status$;

revoke all on function public.sdda_set_entry_confirmation_status(uuid,text) from public,anon,authenticated;
grant execute on function public.sdda_set_entry_confirmation_status(uuid,text) to authenticated;

commit;
