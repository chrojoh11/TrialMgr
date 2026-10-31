begin;

alter table public.sdda_trials
  add column if not exists volunteer_section_enabled boolean not null default false,
  add column if not exists volunteer_tasks text[] not null default '{}'::text[];

alter table public.sdda_entries
  add column if not exists volunteer_preferences text[] not null default '{}'::text[];

comment on column public.sdda_trials.volunteer_tasks is
  'Secretary-selected volunteer choices displayed on the public entry form.';
comment on column public.sdda_entries.volunteer_preferences is
  'Entrant volunteer availability retained even if the public choices later change.';

create or replace function public.sdda_clean_volunteer_tasks(requested_tasks text[])
returns text[] language sql immutable set search_path=public
as $clean$
  select coalesce(array_agg(task order by first_position),'{}'::text[])
  from (
    select distinct on (lower(task)) position as first_position,task
    from (
      select position, trim(value) as task
      from unnest(coalesce(requested_tasks,'{}'::text[])) with ordinality supplied(value,position)
      where length(trim(value)) between 1 and 60
    ) cleaned
    order by lower(task),position
  ) unique_tasks;
$clean$;

create or replace function public.sdda_update_trial_volunteer_options(
  target_trial_id uuid,
  requested_enabled boolean,
  requested_tasks text[]
)
returns void language plpgsql security definer set search_path=public,pg_temp set row_security=off
as $volunteers$
declare before_state jsonb; after_state jsonb; cleaned text[];
begin
  if auth.uid() is null or not public.sdda_can_manage_trial(target_trial_id) then
    raise exception 'Trial management permission required';
  end if;
  cleaned:=public.sdda_clean_volunteer_tasks(requested_tasks);
  if cardinality(cleaned)>30 then raise exception 'A trial may offer at most 30 volunteer tasks'; end if;
  select jsonb_build_object('enabled',volunteer_section_enabled,'tasks',volunteer_tasks)
    into before_state from public.sdda_trials where id=target_trial_id for update;
  if before_state is null then raise exception 'Trial not found'; end if;
  update public.sdda_trials set
    volunteer_section_enabled=coalesce(requested_enabled,false),
    volunteer_tasks=cleaned,
    updated_at=now()
  where id=target_trial_id;
  select jsonb_build_object('enabled',volunteer_section_enabled,'tasks',volunteer_tasks)
    into after_state from public.sdda_trials where id=target_trial_id;
  if before_state is distinct from after_state then
    insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
    values(target_trial_id,auth.uid(),'trial.volunteer_options_updated','sdda_trial',target_trial_id::text,before_state,after_state);
  end if;
end;
$volunteers$;

do $rename$
begin
  if to_regprocedure('public.sdda_apply_entry_update_base_v71(uuid,jsonb,uuid,text)') is null then
    alter function public.sdda_apply_entry_update(uuid,jsonb,uuid,text)
      rename to sdda_apply_entry_update_base_v71;
  end if;
end;
$rename$;

create or replace function public.sdda_apply_entry_update(
  target_entry_id uuid,submission jsonb,audit_actor uuid,audit_action text
)
returns void language plpgsql security definer set search_path=public set row_security=off
as $entry_update$
declare
  target_trial_id uuid; old_preferences text[]; configured_tasks text[];
  section_enabled boolean; requested text[]; preserved text[]; final_preferences text[];
begin
  select e.trial_id,e.volunteer_preferences,t.volunteer_section_enabled,t.volunteer_tasks
    into target_trial_id,old_preferences,section_enabled,configured_tasks
  from public.sdda_entries e join public.sdda_trials t on t.id=e.trial_id
  where e.id=target_entry_id;
  if target_trial_id is null then raise exception 'Entry not found'; end if;

  perform public.sdda_apply_entry_update_base_v71(target_entry_id,submission,audit_actor,audit_action);

  if section_enabled and submission ? 'volunteer_preferences' then
    select public.sdda_clean_volunteer_tasks(array_agg(value)) into requested
    from jsonb_array_elements_text(coalesce(submission->'volunteer_preferences','[]'::jsonb)) supplied(value);
    if exists(select 1 from unnest(coalesce(requested,'{}'::text[])) item
      where not (item=any(coalesce(configured_tasks,'{}'::text[])))) then
      raise exception 'One or more volunteer choices are no longer offered';
    end if;
    select coalesce(array_agg(item),'{}'::text[]) into preserved
    from unnest(coalesce(old_preferences,'{}'::text[])) item
    where not (item=any(coalesce(configured_tasks,'{}'::text[])));
    final_preferences:=public.sdda_clean_volunteer_tasks(coalesce(requested,'{}'::text[])||coalesce(preserved,'{}'::text[]));
    update public.sdda_entries set volunteer_preferences=final_preferences where id=target_entry_id;
    if coalesce(old_preferences,'{}'::text[]) is distinct from final_preferences then
      insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
      values(target_trial_id,audit_actor,'entry.volunteer_preferences_updated','sdda_entry',target_entry_id::text,
        jsonb_build_object('volunteer_preferences',coalesce(old_preferences,'{}'::text[])),
        jsonb_build_object('volunteer_preferences',final_preferences));
    end if;
  end if;
end;
$entry_update$;

do $rename$
begin
  if to_regprocedure('public.sdda_entry_edit_payload_base_v71(uuid)') is null then
    alter function public.sdda_entry_edit_payload(uuid) rename to sdda_entry_edit_payload_base_v71;
  end if;
end;
$rename$;

create or replace function public.sdda_entry_edit_payload(target_entry_id uuid)
returns jsonb language sql stable security definer set search_path=public set row_security=off
as $payload$
  select public.sdda_entry_edit_payload_base_v71(target_entry_id)
    || jsonb_build_object('volunteer_preferences',coalesce(e.volunteer_preferences,'{}'::text[]))
  from public.sdda_entries e where e.id=target_entry_id;
$payload$;

do $rename$
begin
  if to_regprocedure('public.sdda_public_trial_entry_setup_base_v71(uuid)') is null then
    alter function public.sdda_public_trial_entry_setup(uuid) rename to sdda_public_trial_entry_setup_base_v71;
  end if;
end;
$rename$;

create or replace function public.sdda_public_trial_entry_setup(target_trial_id uuid)
returns jsonb language sql stable security definer set search_path=public set row_security=off
as $setup$
  select public.sdda_public_trial_entry_setup_base_v71(target_trial_id)
    || jsonb_build_object(
      'volunteer_section_enabled',t.volunteer_section_enabled and cardinality(t.volunteer_tasks)>0,
      'volunteer_tasks',to_jsonb(t.volunteer_tasks)
    )
  from public.sdda_trials t where t.id=target_trial_id;
$setup$;

revoke all on function public.sdda_clean_volunteer_tasks(text[]) from public,anon,authenticated;
revoke all on function public.sdda_update_trial_volunteer_options(uuid,boolean,text[]) from public,anon,authenticated;
revoke all on function public.sdda_apply_entry_update_base_v71(uuid,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.sdda_apply_entry_update(uuid,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.sdda_entry_edit_payload_base_v71(uuid) from public,anon,authenticated;
revoke all on function public.sdda_entry_edit_payload(uuid) from public,anon,authenticated;
revoke all on function public.sdda_public_trial_entry_setup_base_v71(uuid) from public,anon,authenticated;
revoke all on function public.sdda_public_trial_entry_setup(uuid) from public,anon,authenticated;
grant execute on function public.sdda_update_trial_volunteer_options(uuid,boolean,text[]) to authenticated;
grant execute on function public.sdda_public_trial_entry_setup(uuid) to anon,authenticated;

commit;
