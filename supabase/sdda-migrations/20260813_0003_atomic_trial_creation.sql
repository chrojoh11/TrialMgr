begin;

create or replace function public.sdda_create_trial(
  trial_name text,
  trial_host_club text,
  trial_venue text,
  trial_dates date[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_trial_id uuid;
  trial_date date;
  day_number integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(trial_name)) not between 3 and 120 then
    raise exception 'Trial name must be between 3 and 120 characters';
  end if;
  if length(trim(trial_host_club)) not between 2 and 120 then
    raise exception 'Host club must be between 2 and 120 characters';
  end if;
  if coalesce(cardinality(trial_dates), 0) not between 1 and 4 then
    raise exception 'An SDDA trial must have between one and four days';
  end if;
  if (select count(distinct value) from unnest(trial_dates) as value) <> cardinality(trial_dates) then
    raise exception 'SDDA trial days must be unique';
  end if;

  insert into public.sdda_trials (name, host_club, venue, owner_id, status)
  values (trim(trial_name), trim(trial_host_club), nullif(trim(trial_venue), ''), auth.uid(), 'draft')
  returning id into new_trial_id;

  foreach trial_date in array trial_dates loop
    day_number := day_number + 1;
    insert into public.sdda_trial_days (trial_id, day_number, trial_date)
    values (new_trial_id, day_number, trial_date);
  end loop;

  insert into public.sdda_audit_records (trial_id, actor_id, action, entity_type, entity_id, after_state)
  values (
    new_trial_id, auth.uid(), 'trial.created', 'sdda_trial', new_trial_id::text,
    jsonb_build_object('name', trim(trial_name), 'host_club', trim(trial_host_club),
      'venue', nullif(trim(trial_venue), ''), 'dates', to_jsonb(trial_dates), 'status', 'draft')
  );

  return new_trial_id;
end;
$$;

revoke all on function public.sdda_create_trial(text, text, text, date[]) from public;
revoke all on function public.sdda_create_trial(text, text, text, date[]) from anon;
grant execute on function public.sdda_create_trial(text, text, text, date[]) to authenticated;

commit;
