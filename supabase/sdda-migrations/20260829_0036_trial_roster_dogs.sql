begin;

create or replace function public.sdda_trial_roster_dogs(target_trial_id uuid)
returns table(
  id uuid,
  call_name text,
  registered_name text,
  sdda_registration_number text,
  registration_pending boolean,
  breed text
)
language plpgsql stable security definer set search_path=public set row_security=off
as $roster_dogs$
begin
  if not public.sdda_can_access_trial(target_trial_id) then
    raise exception 'You do not have access to this SDDA trial';
  end if;
  return query
    select distinct d.id,d.call_name,d.registered_name,d.sdda_registration_number,d.registration_pending,d.breed
    from public.sdda_entries e join public.sdda_dogs d on d.id=e.dog_id
    where e.trial_id=target_trial_id;
end;
$roster_dogs$;

revoke all on function public.sdda_trial_roster_dogs(uuid) from public,anon,authenticated;
grant execute on function public.sdda_trial_roster_dogs(uuid) to authenticated;

commit;
