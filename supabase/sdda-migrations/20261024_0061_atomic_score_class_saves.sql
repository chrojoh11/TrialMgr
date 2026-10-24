-- Save a secretary's changed Scent and Games score cards as one transaction.
-- Every existing score carries an optimistic-lock token so a second secretary
-- cannot silently overwrite a newer save. Amendments and clears require a reason.

create or replace function public.sdda_save_score_class(
  target_trial_id uuid,
  scent_changes jsonb default '[]'::jsonb,
  game_changes jsonb default '[]'::jsonb,
  amendment_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $score_class$
declare
  item jsonb;
  run_trial_id uuid;
  current_version timestamptz;
  expected_version timestamptz;
  amendment_count integer := 0;
  scent_count integer := 0;
  game_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Signed-in user required.'; end if;
  if not public.sdda_can_manage_trial(target_trial_id) then
    raise exception 'You cannot score this trial.';
  end if;
  if jsonb_typeof(coalesce(scent_changes,'[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(game_changes,'[]'::jsonb)) <> 'array' then
    raise exception 'Score changes must be arrays.';
  end if;

  -- Validate every row and every lock token before writing anything.
  for item in select value from jsonb_array_elements(coalesce(scent_changes,'[]'::jsonb)) loop
    select r.trial_id into run_trial_id from public.sdda_runs r where r.id=(item->>'run_id')::uuid;
    if run_trial_id is distinct from target_trial_id then raise exception 'A Scent run is not part of this trial.'; end if;
    select coalesce(s.amended_at,s.recorded_at) into current_version from public.sdda_scores s where s.run_id=(item->>'run_id')::uuid;
    expected_version := nullif(item->>'expected_version','')::timestamptz;
    if current_version is distinct from expected_version then
      raise exception 'A Scent score changed after you opened this page. Reload before saving.';
    end if;
    if current_version is not null then amendment_count := amendment_count + 1; end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(game_changes,'[]'::jsonb)) loop
    select r.trial_id into run_trial_id from public.sdda_game_runs r where r.id=(item->>'run_id')::uuid;
    if run_trial_id is distinct from target_trial_id then raise exception 'A Games run is not part of this trial.'; end if;
    select coalesce(s.amended_at,s.recorded_at) into current_version from public.sdda_game_scores s where s.game_run_id=(item->>'run_id')::uuid;
    expected_version := nullif(item->>'expected_version','')::timestamptz;
    if current_version is distinct from expected_version then
      raise exception 'A Games score changed after you opened this page. Reload before saving.';
    end if;
    if current_version is not null then amendment_count := amendment_count + 1; end if;
  end loop;

  if amendment_count > 0 and nullif(btrim(amendment_reason),'') is null then
    raise exception 'Enter a reason for changing a previously saved score.';
  end if;

  for item in select value from jsonb_array_elements(coalesce(scent_changes,'[]'::jsonb)) loop
    if coalesce(item->>'action','save') = 'clear' then
      perform public.sdda_clear_scent_score((item->>'run_id')::uuid);
    else
      perform public.sdda_record_scent_score(
        (item->>'run_id')::uuid,
        item->>'result',
        nullif(item->>'score','')::numeric,
        nullif(item->>'time_seconds','')::numeric,
        coalesce(nullif(item->>'faults','')::integer,0),
        item->>'notes'
      );
    end if;
    scent_count := scent_count + 1;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(game_changes,'[]'::jsonb)) loop
    if coalesce(item->>'action','save') = 'clear' then
      perform public.sdda_clear_game_score((item->>'run_id')::uuid);
    else
      perform public.sdda_record_game_score(
        (item->>'run_id')::uuid,
        item->>'result',
        nullif(item->>'time_seconds','')::numeric,
        item->>'notes'
      );
    end if;
    game_count := game_count + 1;
  end loop;

  insert into public.sdda_audit_records(
    trial_id,actor_id,action,entity_type,entity_id,before_state,after_state
  ) values (
    target_trial_id,auth.uid(),'scores.class_saved','sdda_score_class',target_trial_id::text,null,
    jsonb_build_object(
      'scent_changes',scent_count,
      'game_changes',game_count,
      'amendments',amendment_count,
      'reason',nullif(btrim(amendment_reason),'')
    )
  );

  return jsonb_build_object('scent_saved',scent_count,'games_saved',game_count,'amendments',amendment_count);
end;
$score_class$;

revoke all on function public.sdda_save_score_class(uuid,jsonb,jsonb,text) from public, anon;
grant execute on function public.sdda_save_score_class(uuid,jsonb,jsonb,text) to authenticated;

