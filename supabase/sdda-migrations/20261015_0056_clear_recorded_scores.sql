-- Allow a trial secretary to return an incorrectly scored run to Not recorded.
-- The entry, run, and running-order position are preserved and the removal is audited.

create or replace function public.sdda_clear_scent_score(target_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $clear_scent_score$
declare
  run_record record;
  before_record public.sdda_scores%rowtype;
begin
  if auth.uid() is null then raise exception 'Signed-in user required.'; end if;

  select r.trial_id into run_record from public.sdda_runs r where r.id=target_run_id;
  if not found then raise exception 'Scent run not found.'; end if;
  if not public.sdda_can_manage_trial(run_record.trial_id) then raise exception 'You cannot clear scores for this trial.'; end if;

  select * into before_record from public.sdda_scores where run_id=target_run_id;
  if before_record.id is null then return null; end if;

  delete from public.sdda_scores where id=before_record.id;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
  values (run_record.trial_id,auth.uid(),'score.cleared','sdda_score',before_record.id::text,to_jsonb(before_record),null);
  return before_record.id;
end;
$clear_scent_score$;

create or replace function public.sdda_clear_game_score(target_game_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $clear_game_score$
declare
  run_record record;
  before_record public.sdda_game_scores%rowtype;
begin
  if auth.uid() is null then raise exception 'Signed-in user required.'; end if;

  select r.trial_id into run_record from public.sdda_game_runs r where r.id=target_game_run_id;
  if not found then raise exception 'Games run not found.'; end if;
  if not public.sdda_can_manage_trial(run_record.trial_id) then raise exception 'You cannot clear scores for this trial.'; end if;

  select * into before_record from public.sdda_game_scores where game_run_id=target_game_run_id;
  if before_record.id is null then return null; end if;

  delete from public.sdda_game_scores where id=before_record.id;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
  values (run_record.trial_id,auth.uid(),'game_score.cleared','sdda_game_score',before_record.id::text,to_jsonb(before_record),null);
  return before_record.id;
end;
$clear_game_score$;

revoke all on function public.sdda_clear_scent_score(uuid) from public, anon;
revoke all on function public.sdda_clear_game_score(uuid) from public, anon;
grant execute on function public.sdda_clear_scent_score(uuid) to authenticated;
grant execute on function public.sdda_clear_game_score(uuid) to authenticated;
