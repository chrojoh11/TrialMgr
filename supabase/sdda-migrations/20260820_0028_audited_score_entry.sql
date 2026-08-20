-- Audited secretary score entry for accepted SDDA Scent and Games runs.

create or replace function public.sdda_record_scent_score(
  target_run_id uuid,
  requested_result text,
  requested_score numeric default null,
  requested_time_seconds numeric default null,
  requested_faults integer default 0,
  requested_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $score_entry$
declare
  run_record record;
  before_record public.sdda_scores%rowtype;
  saved_record public.sdda_scores%rowtype;
begin
  if auth.uid() is null then raise exception 'Signed-in user required.'; end if;
  if requested_result not in ('qualifying','non_qualifying','absent','withdrawn','excused') then
    raise exception 'Invalid Scent result.';
  end if;
  if requested_score is not null and requested_score < 0 then raise exception 'Score cannot be negative.'; end if;
  if requested_time_seconds is not null and requested_time_seconds < 0 then raise exception 'Time cannot be negative.'; end if;
  if coalesce(requested_faults,0) < 0 then raise exception 'Faults cannot be negative.'; end if;

  select r.trial_id, e.confirmation_status into run_record
  from public.sdda_runs r join public.sdda_entries e on e.id=r.entry_id
  where r.id=target_run_id;
  if not found then raise exception 'Scent run not found.'; end if;
  if run_record.confirmation_status <> 'accepted' then raise exception 'Only accepted entries can be scored.'; end if;
  if not public.sdda_can_manage_trial(run_record.trial_id) then raise exception 'You cannot score this trial.'; end if;

  select * into before_record from public.sdda_scores where run_id=target_run_id;
  insert into public.sdda_scores(run_id,result,score,time_seconds,faults,judge_notes,recorded_by)
  values (
    target_run_id,
    requested_result,
    case when requested_result in ('absent','withdrawn','excused') then null else requested_score end,
    case when requested_result in ('absent','withdrawn','excused') then null else requested_time_seconds end,
    case when requested_result in ('absent','withdrawn','excused') then 0 else coalesce(requested_faults,0) end,
    nullif(btrim(requested_notes),'')::text,
    auth.uid()
  )
  on conflict(run_id) do update set
    result=excluded.result, score=excluded.score, time_seconds=excluded.time_seconds,
    faults=excluded.faults, judge_notes=excluded.judge_notes,
    recorded_by=auth.uid(), amended_at=now()
  returning * into saved_record;

  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
  values (run_record.trial_id,auth.uid(),case when before_record.id is null then 'score.recorded' else 'score.amended' end,
    'sdda_score',saved_record.id::text,case when before_record.id is null then null else to_jsonb(before_record) end,to_jsonb(saved_record));
  return saved_record.id;
end;
$score_entry$;

create or replace function public.sdda_record_game_score(
  target_game_run_id uuid,
  requested_result text,
  requested_time_seconds numeric default null,
  requested_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $game_score_entry$
declare
  run_record record;
  before_record public.sdda_game_scores%rowtype;
  saved_record public.sdda_game_scores%rowtype;
begin
  if auth.uid() is null then raise exception 'Signed-in user required.'; end if;
  if requested_result not in ('pass','fail','absent','withdrawn','excused') then raise exception 'Invalid Games result.'; end if;
  if requested_time_seconds is not null and requested_time_seconds < 0 then raise exception 'Time cannot be negative.'; end if;

  select r.trial_id, e.confirmation_status into run_record
  from public.sdda_game_runs r join public.sdda_entries e on e.id=r.entry_id
  where r.id=target_game_run_id;
  if not found then raise exception 'Games run not found.'; end if;
  if run_record.confirmation_status <> 'accepted' then raise exception 'Only accepted entries can be scored.'; end if;
  if not public.sdda_can_manage_trial(run_record.trial_id) then raise exception 'You cannot score this trial.'; end if;

  select * into before_record from public.sdda_game_scores where game_run_id=target_game_run_id;
  insert into public.sdda_game_scores(game_run_id,result,time_seconds,judge_notes,recorded_by)
  values (target_game_run_id,requested_result,
    case when requested_result in ('absent','withdrawn','excused') then null else requested_time_seconds end,
    nullif(btrim(requested_notes),''),auth.uid())
  on conflict(game_run_id) do update set
    result=excluded.result,time_seconds=excluded.time_seconds,judge_notes=excluded.judge_notes,
    recorded_by=auth.uid(),amended_at=now()
  returning * into saved_record;

  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
  values (run_record.trial_id,auth.uid(),case when before_record.id is null then 'game_score.recorded' else 'game_score.amended' end,
    'sdda_game_score',saved_record.id::text,case when before_record.id is null then null else to_jsonb(before_record) end,to_jsonb(saved_record));
  return saved_record.id;
end;
$game_score_entry$;

revoke all on function public.sdda_record_scent_score(uuid,text,numeric,numeric,integer,text) from public, anon;
revoke all on function public.sdda_record_game_score(uuid,text,numeric,text) from public, anon;
grant execute on function public.sdda_record_scent_score(uuid,text,numeric,numeric,integer,text) to authenticated;
grant execute on function public.sdda_record_game_score(uuid,text,numeric,text) to authenticated;

