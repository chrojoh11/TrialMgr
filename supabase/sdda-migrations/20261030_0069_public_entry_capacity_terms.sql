begin;

alter table public.sdda_trials
  add column if not exists additional_entry_terms text;

create or replace function public.sdda_update_trial_additional_entry_terms(
  target_trial_id uuid,
  requested_additional_entry_terms text
) returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $terms$
declare before_value text; after_value text;
begin
  if not public.sdda_can_manage_trial(target_trial_id) then
    raise exception 'Trial details access denied';
  end if;

  select additional_entry_terms into before_value
  from public.sdda_trials where id=target_trial_id;

  update public.sdda_trials
  set additional_entry_terms=nullif(btrim(requested_additional_entry_terms),'')
  where id=target_trial_id;

  select additional_entry_terms into after_value
  from public.sdda_trials where id=target_trial_id;

  if before_value is distinct from after_value then
    insert into public.sdda_audit_records(
      trial_id,actor_id,action,entity_type,entity_id,before_state,after_state
    ) values(
      target_trial_id,auth.uid(),'trial.additional_entry_terms_updated','sdda_trial',target_trial_id::text,
      jsonb_build_object('additional_entry_terms',before_value),
      jsonb_build_object('additional_entry_terms',after_value)
    );
  end if;
end;
$terms$;

revoke all on function public.sdda_update_trial_additional_entry_terms(uuid,text) from public,anon,authenticated;
grant execute on function public.sdda_update_trial_additional_entry_terms(uuid,text) to authenticated;

create or replace function public.sdda_public_trial_entry_setup(target_trial_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
set row_security=off
as $entry_setup$
declare result jsonb;
begin
  select jsonb_build_object(
    'id',t.id,
    'name',t.name,
    'host_club',t.host_club,
    'venue',t.venue,
    'timezone',t.timezone,
    'trial_format',t.trial_format,
    'entry_open_at',t.entry_open_at,
    'general_entry_open_at',t.general_entry_open_at,
    'entry_close_at',t.entry_close_at,
    'entry_phase',case
      when t.general_entry_open_at is not null and now()<t.general_entry_open_at then 'registered_only'
      else 'general'
    end,
    'secretary_name',t.secretary_name,
    'secretary_email',t.secretary_email,
    'secretary_phone',t.secretary_phone,
    'payment_instructions',t.payment_instructions,
    'cancellation_policy',t.cancellation_policy,
    'additional_entry_terms',t.additional_entry_terms,
    'scent_component_fee_cents',t.scent_component_fee_cents,
    'scent_three_component_fee_cents',t.scent_three_component_fee_cents,
    'elite_fee_cents',t.elite_fee_cents,
    'days',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',d.id,'day_number',d.day_number,'trial_date',d.trial_date,
        'sdda_trial_number',d.sdda_trial_number,'judge_name',d.judge_name,'entries_open',d.entries_open
      ) order by d.day_number)
      from public.sdda_trial_days d where d.trial_id=t.id
    ),'[]'::jsonb),
    'offerings',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',o.id,'trial_day_id',o.trial_day_id,'level',o.level,'component',o.component,
        'stream',o.stream,'capacity',o.capacity,'feo_allowed',o.feo_allowed,'judge_name',o.judge_name,
        'accepted_count',(
          select count(*)
          from public.sdda_runs accepted_run
          where accepted_run.trial_id=t.id
            and accepted_run.trial_day_id=o.trial_day_id
            and accepted_run.level=o.level
            and accepted_run.component=o.component
            and accepted_run.selection_status='accepted'
        )
      ))
      from public.sdda_trial_offerings o where o.trial_id=t.id
    ),'[]'::jsonb),
    'game_offerings',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',g.id,'trial_day_id',g.trial_day_id,'game_type',g.game_type,'capacity',g.capacity,
        'entry_fee_cents',g.entry_fee_cents,'feo_fee_cents',g.feo_fee_cents,
        'feo_allowed',g.feo_allowed,'judge_name',g.judge_name,
        'accepted_count',(
          select count(*)
          from public.sdda_game_runs accepted_game
          where accepted_game.offering_id=g.id and accepted_game.selection_status='accepted'
        )
      ))
      from public.sdda_game_offerings g where g.trial_id=t.id
    ),'[]'::jsonb)
  ) into result
  from public.sdda_trials t
  where t.id=target_trial_id
    and t.status='entries_open'
    and (t.entry_open_at is null or now()>=t.entry_open_at)
    and (t.entry_close_at is null or now()<=t.entry_close_at);

  if result is null then raise exception 'This trial is not accepting online entries'; end if;
  return result;
end;
$entry_setup$;

revoke all on function public.sdda_public_trial_entry_setup(uuid) from public,anon,authenticated;
grant execute on function public.sdda_public_trial_entry_setup(uuid) to anon,authenticated;

commit;
