begin;

create or replace function public.sdda_import_entry(
  target_trial_id uuid,
  target_trial_day_id uuid,
  dog_call_name text,
  dog_registered_name text,
  dog_registration_number text,
  dog_registration_pending boolean,
  dog_breed text,
  entry_handler_name text,
  entry_handler_email text,
  entry_handler_phone text,
  entry_stream text,
  entry_level text,
  entry_components text[],
  import_source text,
  import_source_row text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  dog_id uuid;
  new_entry_id uuid;
  requested_component text;
begin
  if auth.uid() is null or not public.sdda_can_manage_trial(target_trial_id) then
    raise exception 'Trial management permission required';
  end if;
  if entry_stream not in ('Amateur', 'Working') then raise exception 'Invalid SDDA stream'; end if;
  if entry_level not in ('Started', 'Advanced', 'Excellent', 'Elite') then raise exception 'Invalid SDDA level'; end if;
  if coalesce(cardinality(entry_components), 0) not between 1 and 3 then raise exception 'Select one to three SDDA components'; end if;
  if not dog_registration_pending and nullif(trim(dog_registration_number), '') is null then
    raise exception 'SDDA registration number is required unless registration is pending';
  end if;

  foreach requested_component in array entry_components loop
    if requested_component not in ('Container', 'Interior', 'Exterior') then raise exception 'Invalid SDDA component'; end if;
    if not exists (
      select 1 from public.sdda_trial_offerings o
      where o.trial_id = target_trial_id and o.trial_day_id = target_trial_day_id
        and o.level = entry_level and o.component = requested_component and o.stream = entry_stream
    ) then raise exception 'Requested component is not offered for this trial day, level, and stream'; end if;
  end loop;

  if nullif(trim(dog_registration_number), '') is not null then
    select id into dog_id from public.sdda_dogs
    where lower(trim(sdda_registration_number)) = lower(trim(dog_registration_number));
  end if;
  if dog_id is null then
    insert into public.sdda_dogs (registered_name, call_name, sdda_registration_number, registration_pending, breed, created_by)
    values (nullif(trim(dog_registered_name), ''), trim(dog_call_name), nullif(trim(dog_registration_number), ''), dog_registration_pending, nullif(trim(dog_breed), ''), auth.uid())
    returning id into dog_id;
  end if;

  insert into public.sdda_entries (trial_id, dog_id, handler_name, handler_email, handler_phone, stream, source, source_row)
  values (target_trial_id, dog_id, trim(entry_handler_name), nullif(trim(entry_handler_email), ''), nullif(trim(entry_handler_phone), ''), entry_stream, import_source, import_source_row)
  returning id into new_entry_id;

  foreach requested_component in array entry_components loop
    insert into public.sdda_runs (trial_id, entry_id, trial_day_id, level, component)
    values (target_trial_id, new_entry_id, target_trial_day_id, entry_level, requested_component);
  end loop;

  insert into public.sdda_audit_records (trial_id, actor_id, action, entity_type, entity_id, after_state)
  values (target_trial_id, auth.uid(), 'entry.imported', 'sdda_entry', new_entry_id::text,
    jsonb_build_object('source', import_source, 'source_row', import_source_row, 'level', entry_level,
      'components', to_jsonb(entry_components), 'stream', entry_stream));
  return new_entry_id;
end;
$$;

revoke all on function public.sdda_import_entry(uuid, uuid, text, text, text, boolean, text, text, text, text, text, text, text[], text, text) from public;
revoke all on function public.sdda_import_entry(uuid, uuid, text, text, text, boolean, text, text, text, text, text, text, text[], text, text) from anon;
grant execute on function public.sdda_import_entry(uuid, uuid, text, text, text, boolean, text, text, text, text, text, text, text[], text, text) to authenticated;

commit;
