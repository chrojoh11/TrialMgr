begin;

alter function public.sdda_submit_public_entry(uuid,jsonb)
  rename to sdda_submit_public_entry_core;

revoke all on function public.sdda_submit_public_entry_core(uuid,jsonb) from public, anon, authenticated;

create function public.sdda_submit_public_entry(target_trial_id uuid, submission jsonb)
returns jsonb
language plpgsql
security definer
set search_path to public, extensions
set row_security=off
as $$
declare result jsonb; run_request jsonb; requested_group text; target_entry_id uuid;
begin
  result := public.sdda_submit_public_entry_core(target_trial_id,submission);
  select id into target_entry_id from public.sdda_entries where confirmation_code=result->>'confirmation_code';
  for run_request in select value from jsonb_array_elements(submission->'runs') loop
    requested_group := coalesce(nullif(run_request->>'run_group',''),'Regular');
    if requested_group not in ('Official','Regular','Second dog','FEO','BIS') then
      raise exception 'Invalid running-order request';
    end if;
    update public.sdda_runs r set run_group=requested_group,updated_at=now()
      from public.sdda_trial_offerings o
      where o.id=(run_request->>'offering_id')::uuid and r.entry_id=target_entry_id
        and r.trial_day_id=o.trial_day_id and r.level=o.level and r.component=o.component;
  end loop;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,after_state)
    values(target_trial_id,null,'entry.public_run_groups_requested','sdda_entry',target_entry_id::text,
      jsonb_build_object('runs',submission->'runs'));
  return result;
end;
$$;

revoke all on function public.sdda_submit_public_entry(uuid,jsonb) from public;
grant execute on function public.sdda_submit_public_entry(uuid,jsonb) to anon, authenticated;

commit;
