-- Secretary-only, audited day-of run withdrawals. These selections are excluded
-- from trial operations while retaining the original entry fee obligation.
begin;

alter table public.sdda_runs drop constraint if exists sdda_runs_selection_status_check;
alter table public.sdda_runs add constraint sdda_runs_selection_status_check
  check(selection_status in ('received','accepted','waitlisted','withdrawn','day_of_withdrawn'));
alter table public.sdda_game_runs drop constraint if exists sdda_game_runs_selection_status_check;
alter table public.sdda_game_runs add constraint sdda_game_runs_selection_status_check
  check(selection_status in ('received','accepted','waitlisted','withdrawn','day_of_withdrawn'));

create or replace function public.sdda_set_selection_day_of_status(
  target_kind text,
  target_selection_id uuid,
  requested_action text,
  requested_reason text
)
returns void language plpgsql security definer set search_path=public set row_security=off
as $day_of_status$
declare
  selected_record record;
  target_trial_id uuid;
  current_status text;
  has_score boolean;
  has_space boolean;
  before_snapshot jsonb;
  after_snapshot jsonb;
begin
  requested_reason:=trim(coalesce(requested_reason,''));
  if requested_action not in ('withdraw','restore') then raise exception 'Invalid day-of action'; end if;
  if requested_reason='' then raise exception 'A reason is required for this change'; end if;
  if length(requested_reason)>500 then raise exception 'Reason must be 500 characters or fewer'; end if;

  if target_kind='scent' then
    select r.*,e.handler_name,d.call_name into selected_record
      from public.sdda_runs r join public.sdda_entries e on e.id=r.entry_id
      join public.sdda_dogs d on d.id=e.dog_id
      where r.id=target_selection_id for update of r;
    target_trial_id:=selected_record.trial_id;
    current_status:=selected_record.selection_status;
    select exists(select 1 from public.sdda_scores where run_id=target_selection_id) into has_score;
  elsif target_kind='game' then
    select r.*,e.handler_name,d.call_name,o.game_type into selected_record
      from public.sdda_game_runs r join public.sdda_entries e on e.id=r.entry_id
      join public.sdda_dogs d on d.id=e.dog_id
      join public.sdda_game_offerings o on o.id=r.offering_id
      where r.id=target_selection_id for update of r;
    target_trial_id:=selected_record.trial_id;
    current_status:=selected_record.selection_status;
    select exists(select 1 from public.sdda_game_scores where game_run_id=target_selection_id) into has_score;
  else
    raise exception 'Invalid selection type';
  end if;

  if target_trial_id is null or auth.uid() is null or not public.sdda_can_manage_trial(target_trial_id) then
    raise exception 'Run not found or secretary access denied';
  end if;
  before_snapshot:=to_jsonb(selected_record);

  if requested_action='withdraw' then
    if current_status<>'accepted' then raise exception 'Only an accepted run can be withdrawn day-of'; end if;
    if has_score then raise exception 'Clear the recorded score before withdrawing this run'; end if;
    if target_kind='scent' then
      update public.sdda_runs set selection_status='day_of_withdrawn',running_position=null where id=target_selection_id;
      select to_jsonb(r) into after_snapshot from public.sdda_runs r where r.id=target_selection_id;
    else
      update public.sdda_game_runs set selection_status='day_of_withdrawn',running_position=null where id=target_selection_id;
      select to_jsonb(r) into after_snapshot from public.sdda_game_runs r where r.id=target_selection_id;
    end if;
  else
    if current_status<>'day_of_withdrawn' then raise exception 'Only a day-of withdrawn run can be restored'; end if;
    has_space:=case when target_kind='scent'
      then public.sdda_scent_selection_has_space(target_selection_id)
      else public.sdda_game_selection_has_space(target_selection_id) end;
    if not coalesce(has_space,false) then raise exception 'This offering is at capacity; increase capacity before restoring the run'; end if;
    if target_kind='scent' then
      update public.sdda_runs set selection_status='accepted',running_position=null where id=target_selection_id;
      select to_jsonb(r) into after_snapshot from public.sdda_runs r where r.id=target_selection_id;
    else
      update public.sdda_game_runs set selection_status='accepted',running_position=null where id=target_selection_id;
      select to_jsonb(r) into after_snapshot from public.sdda_game_runs r where r.id=target_selection_id;
    end if;
  end if;

  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
  values(target_trial_id,auth.uid(),'selection.day_of_'||case when requested_action='withdraw' then 'withdrawn' else 'restored' end,
    case when target_kind='scent' then 'sdda_run' else 'sdda_game_run' end,target_selection_id::text,
    before_snapshot,after_snapshot||jsonb_build_object('secretary_reason',requested_reason));
end;
$day_of_status$;

create or replace function public.sdda_entry_charge_cents(target_entry_id uuid)
returns bigint language sql stable security definer set search_path=public
as $charges$
  select case when e.confirmation_status <> 'accepted' then 0 else
    coalesce((select sum(case when grouped.level='Elite' then t.elite_fee_cents
      when grouped.n=3 and t.scent_three_component_fee_cents>0 then t.scent_three_component_fee_cents
      else grouped.n*t.scent_component_fee_cents end)
      from (select r.trial_day_id,r.level,count(*) n from public.sdda_runs r
        where r.entry_id=e.id and coalesce(r.selection_status,'accepted') in ('accepted','day_of_withdrawn')
        group by r.trial_day_id,r.level) grouped),0)
    +coalesce((select sum(case when r.entry_type='FEO' then o.feo_fee_cents else o.entry_fee_cents end)
      from public.sdda_game_runs r join public.sdda_game_offerings o on o.id=r.offering_id
      where r.entry_id=e.id and coalesce(r.selection_status,'accepted') in ('accepted','day_of_withdrawn')),0) end
  from public.sdda_entries e join public.sdda_trials t on t.id=e.trial_id where e.id=target_entry_id;
$charges$;

revoke all on function public.sdda_set_selection_day_of_status(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.sdda_set_selection_day_of_status(text,uuid,text,text) to authenticated;
revoke all on function public.sdda_entry_charge_cents(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';

commit;
