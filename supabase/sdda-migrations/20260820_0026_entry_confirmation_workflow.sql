begin;

create or replace function public.sdda_set_entry_confirmation_status(
  target_entry_id uuid,
  requested_status text
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $entry_confirmation$
declare
  entry_record public.sdda_entries%rowtype;
begin
  if requested_status not in ('received', 'accepted', 'waitlisted', 'rejected') then
    raise exception 'Invalid entry confirmation status';
  end if;

  select * into entry_record from public.sdda_entries
  where id = target_entry_id for update;
  if entry_record.id is null or not public.sdda_can_manage_trial(entry_record.trial_id) then
    raise exception 'Entry not found or access denied';
  end if;

  update public.sdda_entries set confirmation_status = requested_status
  where id = target_entry_id;

  insert into public.sdda_audit_records(
    trial_id, actor_id, action, entity_type, entity_id, before_state, after_state
  ) values (
    entry_record.trial_id, auth.uid(), 'entry.confirmation_status_changed', 'sdda_entry',
    target_entry_id::text,
    jsonb_build_object('confirmation_status', entry_record.confirmation_status),
    jsonb_build_object('confirmation_status', requested_status)
  );
end;
$entry_confirmation$;

revoke all on function public.sdda_set_entry_confirmation_status(uuid,text) from public, anon;
grant execute on function public.sdda_set_entry_confirmation_status(uuid,text) to authenticated;

commit;
