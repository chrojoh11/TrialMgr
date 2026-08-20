begin;

alter table public.sdda_trials
  add column if not exists scent_component_fee_cents integer not null default 0
    check (scent_component_fee_cents >= 0),
  add column if not exists scent_three_component_fee_cents integer not null default 0
    check (scent_three_component_fee_cents >= 0),
  add column if not exists elite_fee_cents integer not null default 0
    check (elite_fee_cents >= 0);

create or replace function public.sdda_set_trial_pricing(
  target_trial_id uuid,
  requested_component_fee_cents integer,
  requested_three_component_fee_cents integer,
  requested_elite_fee_cents integer
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $trial_pricing$
declare
  before_record jsonb;
  after_record jsonb;
begin
  if not public.sdda_can_manage_trial(target_trial_id) then
    raise exception 'Trial pricing access denied';
  end if;
  if requested_component_fee_cents < 0
    or requested_three_component_fee_cents < 0
    or requested_elite_fee_cents < 0 then
    raise exception 'Trial prices cannot be negative';
  end if;

  select jsonb_build_object(
    'scent_component_fee_cents', scent_component_fee_cents,
    'scent_three_component_fee_cents', scent_three_component_fee_cents,
    'elite_fee_cents', elite_fee_cents
  ) into before_record
  from public.sdda_trials where id = target_trial_id;

  update public.sdda_trials set
    scent_component_fee_cents = requested_component_fee_cents,
    scent_three_component_fee_cents = requested_three_component_fee_cents,
    elite_fee_cents = requested_elite_fee_cents
  where id = target_trial_id;

  select jsonb_build_object(
    'scent_component_fee_cents', scent_component_fee_cents,
    'scent_three_component_fee_cents', scent_three_component_fee_cents,
    'elite_fee_cents', elite_fee_cents
  ) into after_record
  from public.sdda_trials where id = target_trial_id;

  insert into public.sdda_audit_records(
    trial_id, actor_id, action, entity_type, entity_id, before_state, after_state
  ) values (
    target_trial_id, auth.uid(), 'trial.pricing_updated', 'sdda_trial',
    target_trial_id::text, before_record, after_record
  );
end;
$trial_pricing$;

revoke all on function public.sdda_set_trial_pricing(uuid,integer,integer,integer) from public, anon;
grant execute on function public.sdda_set_trial_pricing(uuid,integer,integer,integer) to authenticated;

commit;
