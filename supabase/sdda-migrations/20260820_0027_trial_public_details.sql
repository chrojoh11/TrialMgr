begin;

alter table public.sdda_trials
  add column if not exists secretary_name text,
  add column if not exists secretary_email text,
  add column if not exists secretary_phone text,
  add column if not exists payment_instructions text,
  add column if not exists cancellation_policy text;

create or replace function public.sdda_update_trial_public_details(
  target_trial_id uuid,
  requested_secretary_name text,
  requested_secretary_email text,
  requested_secretary_phone text,
  requested_payment_instructions text,
  requested_cancellation_policy text
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $public_details$
declare before_record jsonb; after_record jsonb;
begin
  if not public.sdda_can_manage_trial(target_trial_id) then raise exception 'Trial details access denied'; end if;
  if btrim(requested_secretary_email) <> '' and btrim(requested_secretary_email) not like '%@%' then
    raise exception 'Enter a valid secretary email address';
  end if;
  select jsonb_build_object('secretary_name',secretary_name,'secretary_email',secretary_email,'secretary_phone',secretary_phone,'payment_instructions',payment_instructions,'cancellation_policy',cancellation_policy)
    into before_record from public.sdda_trials where id=target_trial_id;
  update public.sdda_trials set
    secretary_name=nullif(btrim(requested_secretary_name),''),
    secretary_email=nullif(btrim(requested_secretary_email),''),
    secretary_phone=nullif(btrim(requested_secretary_phone),''),
    payment_instructions=nullif(btrim(requested_payment_instructions),''),
    cancellation_policy=nullif(btrim(requested_cancellation_policy),'')
  where id=target_trial_id;
  select jsonb_build_object('secretary_name',secretary_name,'secretary_email',secretary_email,'secretary_phone',secretary_phone,'payment_instructions',payment_instructions,'cancellation_policy',cancellation_policy)
    into after_record from public.sdda_trials where id=target_trial_id;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
    values(target_trial_id,auth.uid(),'trial.public_details_updated','sdda_trial',target_trial_id::text,before_record,after_record);
end;
$public_details$;

revoke all on function public.sdda_update_trial_public_details(uuid,text,text,text,text,text) from public, anon;
grant execute on function public.sdda_update_trial_public_details(uuid,text,text,text,text,text) to authenticated;

create or replace function public.sdda_public_trial_entry_setup(target_trial_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
set row_security = off
as $entry_setup$
declare result jsonb;
begin
  select jsonb_build_object(
    'id',t.id,'name',t.name,'host_club',t.host_club,'venue',t.venue,'timezone',t.timezone,
    'trial_format',t.trial_format,'entry_open_at',t.entry_open_at,'entry_close_at',t.entry_close_at,
    'secretary_name',t.secretary_name,'secretary_email',t.secretary_email,'secretary_phone',t.secretary_phone,
    'payment_instructions',t.payment_instructions,'cancellation_policy',t.cancellation_policy,
    'scent_component_fee_cents',t.scent_component_fee_cents,
    'scent_three_component_fee_cents',t.scent_three_component_fee_cents,
    'elite_fee_cents',t.elite_fee_cents,
    'days',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'day_number',d.day_number,
      'trial_date',d.trial_date,'sdda_trial_number',d.sdda_trial_number,'judge_name',d.judge_name) order by d.day_number)
      from public.sdda_trial_days d where d.trial_id=t.id),'[]'::jsonb),
    'offerings',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'trial_day_id',o.trial_day_id,
      'level',o.level,'component',o.component,'stream',o.stream,'capacity',o.capacity))
      from public.sdda_trial_offerings o where o.trial_id=t.id),'[]'::jsonb),
    'game_offerings',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'trial_day_id',g.trial_day_id,
      'game_type',g.game_type,'capacity',g.capacity,'entry_fee_cents',g.entry_fee_cents,'feo_fee_cents',g.feo_fee_cents))
      from public.sdda_game_offerings g where g.trial_id=t.id),'[]'::jsonb)
  ) into result from public.sdda_trials t where t.id=target_trial_id and t.status='entries_open'
    and (t.entry_open_at is null or now()>=t.entry_open_at) and (t.entry_close_at is null or now()<=t.entry_close_at);
  if result is null then raise exception 'This trial is not accepting online entries'; end if;
  return result;
end;
$entry_setup$;

revoke all on function public.sdda_public_trial_entry_setup(uuid) from public;
grant execute on function public.sdda_public_trial_entry_setup(uuid) to anon, authenticated;

commit;
