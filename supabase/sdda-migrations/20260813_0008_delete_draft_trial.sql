begin;

create or replace function public.sdda_delete_draft_trial(target_trial_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select name into target_name
  from public.sdda_trials
  where id = target_trial_id
    and owner_id = auth.uid()
    and status = 'draft'
  for update;

  if target_name is null then
    raise exception 'Only the owner can delete a draft SDDA trial';
  end if;

  insert into public.sdda_audit_records
    (trial_id, actor_id, action, entity_type, entity_id, before_state)
  values
    (null, auth.uid(), 'trial.deleted', 'sdda_trial', target_trial_id::text,
     jsonb_build_object('id', target_trial_id, 'name', target_name, 'status', 'draft'));

  delete from public.sdda_trials where id = target_trial_id;
end;
$$;

revoke all on function public.sdda_delete_draft_trial(uuid) from public;
revoke all on function public.sdda_delete_draft_trial(uuid) from anon;
grant execute on function public.sdda_delete_draft_trial(uuid) to authenticated;

commit;
