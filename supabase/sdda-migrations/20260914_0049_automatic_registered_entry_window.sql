begin;

alter table public.sdda_trials
  add column if not exists general_entry_open_at timestamptz;

-- Existing scheduled trials treated entry_open_at as the general opening. Preserve
-- that moment while moving the established gate to the registered-only opening.
update public.sdda_trials
set general_entry_open_at=entry_open_at,
    entry_open_at=entry_open_at-interval '3 days'
where entry_open_at is not null and general_entry_open_at is null;

create or replace function public.sdda_set_entry_schedule(
  target_trial_id uuid,
  requested_general_open_at timestamptz,
  requested_close_at timestamptz
) returns void
language plpgsql security definer set search_path=public set row_security=off
as $schedule$
declare before_record jsonb; after_record jsonb;
begin
  if not public.sdda_can_manage_trial(target_trial_id) then raise exception 'Trial setup access denied'; end if;
  if requested_general_open_at is null or requested_close_at is null then
    raise exception 'General opening and closing date/time are required';
  end if;
  if requested_close_at<=requested_general_open_at then raise exception 'Entry closing must be after general opening'; end if;
  select jsonb_build_object('registered_open_at',entry_open_at,'general_open_at',general_entry_open_at,'close_at',entry_close_at,'status',status)
    into before_record from public.sdda_trials where id=target_trial_id for update;
  update public.sdda_trials set
    entry_open_at=requested_general_open_at-interval '3 days',
    general_entry_open_at=requested_general_open_at,
    entry_close_at=requested_close_at,
    status='entries_open'
  where id=target_trial_id;
  select jsonb_build_object('registered_open_at',entry_open_at,'general_open_at',general_entry_open_at,'close_at',entry_close_at,'status',status)
    into after_record from public.sdda_trials where id=target_trial_id;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
  values(target_trial_id,auth.uid(),'trial.entry_schedule_updated','sdda_trial',target_trial_id::text,before_record,after_record);
end;
$schedule$;

create or replace function public.sdda_public_trial_entry_setup(target_trial_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public set row_security=off
as $entry_setup$
declare result jsonb;
begin
  select jsonb_build_object(
    'id',t.id,'name',t.name,'host_club',t.host_club,'venue',t.venue,'timezone',t.timezone,
    'trial_format',t.trial_format,'entry_open_at',t.entry_open_at,'general_entry_open_at',t.general_entry_open_at,
    'entry_close_at',t.entry_close_at,'entry_phase',case when t.general_entry_open_at is not null and now()<t.general_entry_open_at then 'registered_only' else 'general' end,
    'secretary_name',t.secretary_name,'secretary_email',t.secretary_email,'secretary_phone',t.secretary_phone,
    'payment_instructions',t.payment_instructions,'cancellation_policy',t.cancellation_policy,
    'scent_component_fee_cents',t.scent_component_fee_cents,'scent_three_component_fee_cents',t.scent_three_component_fee_cents,'elite_fee_cents',t.elite_fee_cents,
    'days',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'day_number',d.day_number,'trial_date',d.trial_date,
      'sdda_trial_number',d.sdda_trial_number,'judge_name',d.judge_name,'entries_open',d.entries_open) order by d.day_number)
      from public.sdda_trial_days d where d.trial_id=t.id),'[]'::jsonb),
    'offerings',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'trial_day_id',o.trial_day_id,'level',o.level,'component',o.component,'stream',o.stream,'capacity',o.capacity,'feo_allowed',o.feo_allowed))
      from public.sdda_trial_offerings o where o.trial_id=t.id),'[]'::jsonb),
    'game_offerings',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'trial_day_id',g.trial_day_id,'game_type',g.game_type,'capacity',g.capacity,'entry_fee_cents',g.entry_fee_cents,'feo_fee_cents',g.feo_fee_cents,'feo_allowed',g.feo_allowed))
      from public.sdda_game_offerings g where g.trial_id=t.id),'[]'::jsonb)
  ) into result from public.sdda_trials t
  where t.id=target_trial_id and t.status='entries_open'
    and (t.entry_open_at is null or now()>=t.entry_open_at)
    and (t.entry_close_at is null or now()<=t.entry_close_at);
  if result is null then raise exception 'This trial is not accepting online entries'; end if;
  return result;
end;
$entry_setup$;

create or replace function public.sdda_assert_public_entry_window(target_trial_id uuid,submission jsonb)
returns void language plpgsql stable security definer set search_path=public set row_security=off
as $window$
declare trial_record record; requested_participant text;
begin
  select status,entry_open_at,general_entry_open_at,entry_close_at into trial_record
  from public.sdda_trials where id=target_trial_id;
  if trial_record.status<>'entries_open'
    or (trial_record.entry_open_at is not null and now()<trial_record.entry_open_at)
    or (trial_record.entry_close_at is not null and now()>trial_record.entry_close_at) then
    raise exception 'This trial is not accepting online entries';
  end if;
  if trial_record.general_entry_open_at is not null and now()<trial_record.general_entry_open_at then
    requested_participant:=nullif(trim(submission->>'participant_number'),'');
    if requested_participant is null or not exists(
      select 1 from public.sdda_registry_snapshots s
      join public.sdda_registry_dogs d on d.snapshot_id=s.id
      where s.is_active and lower(trim(d.owner_number))=lower(requested_participant)
    ) then
      raise exception 'Entries are currently open only to registered participants. Enter the registered participant number shown in the SDDA registry, or return when general entries open.';
    end if;
  end if;
end;
$window$;

create or replace function public.sdda_submit_public_entry_v6(target_trial_id uuid,submission jsonb)
returns jsonb language plpgsql security definer set search_path=public set row_security=off
as $submit$
begin
  perform public.sdda_assert_public_entry_window(target_trial_id,submission);
  return public.sdda_submit_public_entry_v5(target_trial_id,submission);
end;
$submit$;

-- Secretary-created entries intentionally bypass the public dates. The existing
-- submission chain still supplies receipts, selections, validation and audit data.
create or replace function public.sdda_submit_secretary_entry(target_trial_id uuid,submission jsonb)
returns jsonb language plpgsql security definer set search_path=public set row_security=off
as $secretary$
declare saved_status text; saved_open timestamptz; saved_close timestamptz; result jsonb;
begin
  if not public.sdda_can_manage_trial(target_trial_id) then raise exception 'Secretary access required'; end if;
  select status,entry_open_at,entry_close_at into saved_status,saved_open,saved_close
  from public.sdda_trials where id=target_trial_id for update;
  update public.sdda_trials set status='entries_open',entry_open_at=null,entry_close_at=null where id=target_trial_id;
  result:=public.sdda_submit_public_entry_v5(target_trial_id,submission);
  update public.sdda_trials set status=saved_status,entry_open_at=saved_open,entry_close_at=saved_close where id=target_trial_id;
  return result;
end;
$secretary$;

-- Public edits follow the complete public window; secretary editing uses its own
-- authorized RPC and remains available before or after these dates.
create or replace function public.sdda_public_entry_is_editable(target_entry_id uuid)
returns boolean language sql stable security definer set search_path=public set row_security=off
as $editable$
  select exists(
    select 1 from public.sdda_entries e join public.sdda_trials t on t.id=e.trial_id
    where e.id=target_entry_id and e.confirmation_status in ('received','accepted')
      and t.status='entries_open'
      and (t.entry_open_at is null or now()>=t.entry_open_at)
      and (t.entry_close_at is null or now()<=t.entry_close_at)
      and not exists(select 1 from public.sdda_runs r join public.sdda_scores s on s.run_id=r.id where r.entry_id=e.id)
      and not exists(select 1 from public.sdda_game_runs gr join public.sdda_game_scores gs on gs.game_run_id=gr.id where gr.entry_id=e.id)
  );
$editable$;

revoke all on function public.sdda_set_entry_schedule(uuid,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.sdda_assert_public_entry_window(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.sdda_submit_public_entry_v6(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.sdda_submit_secretary_entry(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.sdda_submit_public_entry_v5(uuid,jsonb) from anon,authenticated;
grant execute on function public.sdda_set_entry_schedule(uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.sdda_submit_public_entry_v6(uuid,jsonb) to anon,authenticated;
grant execute on function public.sdda_submit_secretary_entry(uuid,jsonb) to authenticated;

commit;
