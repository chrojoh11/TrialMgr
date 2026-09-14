begin;

create or replace function public.sdda_mark_secretary_entry(
  target_confirmation_code text,
  target_receipt_token text
)
returns uuid
language plpgsql
security definer
set search_path=public,extensions
set row_security=off
as $secretary_entry$
declare
  selected_entry public.sdda_entries%rowtype;
begin
  select * into selected_entry
  from public.sdda_entries e
  where e.confirmation_code=target_confirmation_code
    and e.receipt_token_hash=encode(extensions.digest(target_receipt_token,'sha256'),'hex')
  for update;

  if selected_entry.id is null or not public.sdda_can_manage_trial(selected_entry.trial_id) then
    raise exception 'Secretary access required';
  end if;

  update public.sdda_entries
  set source='manual',updated_at=now()
  where id=selected_entry.id;

  update public.sdda_audit_records
  set actor_id=auth.uid(),action='entry.secretary_received'
  where trial_id=selected_entry.trial_id
    and entity_type='sdda_entry'
    and entity_id=selected_entry.id::text
    and action='entry.public_received';

  if not found then
    insert into public.sdda_audit_records(
      trial_id,actor_id,action,entity_type,entity_id,after_state
    ) values(
      selected_entry.trial_id,auth.uid(),'entry.secretary_received','sdda_entry',
      selected_entry.id::text,
      jsonb_build_object('confirmation_code',selected_entry.confirmation_code,'source','manual')
    );
  end if;

  return selected_entry.id;
end;
$secretary_entry$;

revoke all on function public.sdda_mark_secretary_entry(text,text) from public,anon,authenticated;
grant execute on function public.sdda_mark_secretary_entry(text,text) to authenticated;

commit;
