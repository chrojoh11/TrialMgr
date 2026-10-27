begin;

-- Competitors need the assigned judge while choosing and reviewing offered
-- runs.  Keep the existing public-entry window intact and expose only the
-- judge names already intended for the Premium and public trial details.
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
      when t.general_entry_open_at is not null and now()<t.general_entry_open_at
        then 'registered_only'
      else 'general'
    end,
    'secretary_name',t.secretary_name,
    'secretary_email',t.secretary_email,
    'secretary_phone',t.secretary_phone,
    'payment_instructions',t.payment_instructions,
    'cancellation_policy',t.cancellation_policy,
    'scent_component_fee_cents',t.scent_component_fee_cents,
    'scent_three_component_fee_cents',t.scent_three_component_fee_cents,
    'elite_fee_cents',t.elite_fee_cents,
    'days',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',d.id,
        'day_number',d.day_number,
        'trial_date',d.trial_date,
        'sdda_trial_number',d.sdda_trial_number,
        'judge_name',d.judge_name,
        'entries_open',d.entries_open
      ) order by d.day_number)
      from public.sdda_trial_days d
      where d.trial_id=t.id
    ),'[]'::jsonb),
    'offerings',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',o.id,
        'trial_day_id',o.trial_day_id,
        'level',o.level,
        'component',o.component,
        'stream',o.stream,
        'capacity',o.capacity,
        'feo_allowed',o.feo_allowed,
        'judge_name',o.judge_name
      ))
      from public.sdda_trial_offerings o
      where o.trial_id=t.id
    ),'[]'::jsonb),
    'game_offerings',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',g.id,
        'trial_day_id',g.trial_day_id,
        'game_type',g.game_type,
        'capacity',g.capacity,
        'entry_fee_cents',g.entry_fee_cents,
        'feo_fee_cents',g.feo_fee_cents,
        'feo_allowed',g.feo_allowed,
        'judge_name',g.judge_name
      ))
      from public.sdda_game_offerings g
      where g.trial_id=t.id
    ),'[]'::jsonb)
  ) into result
  from public.sdda_trials t
  where t.id=target_trial_id
    and t.status='entries_open'
    and (t.entry_open_at is null or now()>=t.entry_open_at)
    and (t.entry_close_at is null or now()<=t.entry_close_at);

  if result is null then
    raise exception 'This trial is not accepting online entries';
  end if;
  return result;
end;
$entry_setup$;

revoke all on function public.sdda_public_trial_entry_setup(uuid) from public,anon,authenticated;
grant execute on function public.sdda_public_trial_entry_setup(uuid) to anon,authenticated;

commit;
