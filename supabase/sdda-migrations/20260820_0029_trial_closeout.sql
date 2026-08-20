-- Audited, database-enforced trial completion and reopening.

create or replace function public.sdda_guard_completed_trial_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $guard$
declare
  target_trial_id uuid;
  target_status text;
begin
  if current_setting('sdda.allow_completed_mutation', true) = 'on' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_table_name = 'sdda_trials' then
    target_trial_id := old.id;
  elsif tg_table_name = 'sdda_scores' then
    select r.trial_id into target_trial_id from public.sdda_runs r where r.id=coalesce(new.run_id,old.run_id);
  elsif tg_table_name = 'sdda_game_scores' then
    select r.trial_id into target_trial_id from public.sdda_game_runs r where r.id=coalesce(new.game_run_id,old.game_run_id);
  else
    target_trial_id := coalesce(new.trial_id,old.trial_id);
  end if;
  select status into target_status from public.sdda_trials where id=target_trial_id;
  if target_status = 'completed' then raise exception 'This trial is completed. Reopen it before making changes.'; end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$guard$;

do $triggers$
declare table_name text;
begin
  foreach table_name in array array[
    'sdda_trial_days','sdda_trial_members','sdda_trial_offerings','sdda_game_offerings',
    'sdda_entries','sdda_runs','sdda_game_runs','sdda_scores','sdda_game_scores',
    'sdda_financial_transactions'
  ] loop
    execute format('drop trigger if exists sdda_completed_trial_guard on public.%I',table_name);
    execute format('create trigger sdda_completed_trial_guard before insert or update or delete on public.%I for each row execute function public.sdda_guard_completed_trial_mutation()',table_name);
  end loop;
end;
$triggers$;

create or replace function public.sdda_set_trial_completion(target_trial_id uuid, complete boolean)
returns void
language plpgsql
security definer
set search_path = public
as $closeout$
declare trial_record public.sdda_trials%rowtype;
declare missing_scent integer;
declare missing_games integer;
declare incomplete_results integer;
begin
  if auth.uid() is null then raise exception 'Signed-in user required.'; end if;
  select * into trial_record from public.sdda_trials where id=target_trial_id for update;
  if not found then raise exception 'Trial not found.'; end if;
  if not public.sdda_can_manage_trial(target_trial_id) then raise exception 'You cannot close this trial.'; end if;

  if complete then
    if trial_record.status = 'completed' then return; end if;
    if not exists(select 1 from public.sdda_entries where trial_id=target_trial_id and confirmation_status='accepted') then
      raise exception 'At least one accepted entry is required before completion.';
    end if;
    if exists(select 1 from public.sdda_entries where trial_id=target_trial_id and confirmation_status='received') then
      raise exception 'Resolve every received entry before completion.';
    end if;
    if exists(select 1 from public.sdda_trial_days where trial_id=target_trial_id and nullif(btrim(sdda_trial_number),'') is null) then
      raise exception 'Every trial day requires an SDDA trial number.';
    end if;
    if exists(select 1 from public.sdda_trial_offerings o join public.sdda_trial_days d on d.id=o.trial_day_id
      where o.trial_id=target_trial_id and nullif(btrim(coalesce(o.judge_name,d.judge_name)),'') is null)
      or exists(select 1 from public.sdda_game_offerings o join public.sdda_trial_days d on d.id=o.trial_day_id
      where o.trial_id=target_trial_id and nullif(btrim(coalesce(o.judge_name,d.judge_name)),'') is null) then
      raise exception 'Every offering requires a component or day judge.';
    end if;
    select count(*) into missing_scent from public.sdda_runs r
      join public.sdda_entries e on e.id=r.entry_id
      left join public.sdda_scores s on s.run_id=r.id
      where r.trial_id=target_trial_id and e.confirmation_status='accepted'
        and r.run_group <> 'FEO' and s.id is null;
    select count(*) into missing_games from public.sdda_game_runs r
      join public.sdda_entries e on e.id=r.entry_id
      left join public.sdda_game_scores s on s.game_run_id=r.id
      where r.trial_id=target_trial_id and e.confirmation_status='accepted'
        and r.entry_type <> 'FEO' and s.id is null;
    if missing_scent + missing_games > 0 then
      raise exception '% accepted non-FEO runs remain unscored.',missing_scent + missing_games;
    end if;
    select
      (select count(*) from public.sdda_runs r join public.sdda_entries e on e.id=r.entry_id join public.sdda_scores s on s.run_id=r.id
       where r.trial_id=target_trial_id and e.confirmation_status='accepted' and r.run_group<>'FEO'
         and s.result in ('qualifying','non_qualifying') and (s.score is null or s.time_seconds is null))
      +
      (select count(*) from public.sdda_game_runs r join public.sdda_entries e on e.id=r.entry_id join public.sdda_game_scores s on s.game_run_id=r.id
       where r.trial_id=target_trial_id and e.confirmation_status='accepted' and r.entry_type<>'FEO'
         and s.result in ('pass','fail') and s.time_seconds is null)
      into incomplete_results;
    if incomplete_results > 0 then raise exception '% scored runs are missing required score or time details.',incomplete_results; end if;
    perform set_config('sdda.allow_completed_mutation','on',true);
    insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
      values(target_trial_id,auth.uid(),'trial.completed','sdda_trial',target_trial_id::text,
        jsonb_build_object('status',trial_record.status),jsonb_build_object('status','completed'));
    update public.sdda_trials set status='completed',updated_at=now() where id=target_trial_id;
  else
    if trial_record.status <> 'completed' then raise exception 'Only a completed trial can be reopened.'; end if;
    perform set_config('sdda.allow_completed_mutation','on',true);
    update public.sdda_trials set status='entries_closed',updated_at=now() where id=target_trial_id;
    insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
      values(target_trial_id,auth.uid(),'trial.reopened','sdda_trial',target_trial_id::text,
        jsonb_build_object('status','completed'),jsonb_build_object('status','entries_closed'));
  end if;
end;
$closeout$;

drop trigger if exists sdda_completed_trial_update_guard on public.sdda_trials;
create trigger sdda_completed_trial_update_guard before update or delete on public.sdda_trials
for each row when (old.status = 'completed') execute function public.sdda_guard_completed_trial_mutation();

revoke all on function public.sdda_guard_completed_trial_mutation() from public, anon, authenticated;
revoke all on function public.sdda_set_trial_completion(uuid,boolean) from public, anon;
grant execute on function public.sdda_set_trial_completion(uuid,boolean) to authenticated;
