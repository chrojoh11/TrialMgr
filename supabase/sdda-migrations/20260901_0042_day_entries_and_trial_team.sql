begin;

alter table public.sdda_trial_days
  add column if not exists entries_open boolean not null default true;

comment on column public.sdda_trial_days.entries_open is
  'Whether competitors may request offerings on this day while the parent trial is accepting entries.';

create or replace function public.sdda_set_trial_day_entries_open(
  target_trial_day_id uuid,
  requested_open boolean
)
returns void
language plpgsql
security definer
set search_path=public
set row_security=off
as $day_entries$
declare selected_day public.sdda_trial_days%rowtype;
begin
  select * into selected_day from public.sdda_trial_days where id=target_trial_day_id for update;
  if selected_day.id is null or not public.sdda_can_manage_trial(selected_day.trial_id) then
    raise exception 'Trial management access required';
  end if;
  if selected_day.entries_open is not distinct from requested_open then return; end if;
  update public.sdda_trial_days set entries_open=requested_open where id=target_trial_day_id;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
  values(selected_day.trial_id,auth.uid(),case when requested_open then 'trial_day.entries_opened' else 'trial_day.entries_closed' end,
    'sdda_trial_day',selected_day.id::text,
    jsonb_build_object('day_number',selected_day.day_number,'trial_date',selected_day.trial_date,'entries_open',selected_day.entries_open),
    jsonb_build_object('day_number',selected_day.day_number,'trial_date',selected_day.trial_date,'entries_open',requested_open));
end;
$day_entries$;

create or replace function public.sdda_list_trial_team(target_trial_id uuid)
returns table(user_id uuid,email text,display_name text,role text,is_owner boolean)
language sql
stable
security definer
set search_path=public
set row_security=off
as $trial_team$
  select team.user_id,team.email,team.display_name,team.role,team.is_owner
  from (
    select p.user_id,p.email,p.display_name,'owner'::text as role,true as is_owner
    from public.sdda_trials t join public.sdda_profiles p on p.user_id=t.owner_id
    where t.id=target_trial_id and public.sdda_can_access_trial(t.id)
    union all
    select p.user_id,p.email,p.display_name,m.role,false
    from public.sdda_trial_members m join public.sdda_profiles p on p.user_id=m.user_id
    join public.sdda_trials t on t.id=m.trial_id
    where m.trial_id=target_trial_id and m.user_id<>t.owner_id and public.sdda_can_access_trial(t.id)
  ) as team
  order by team.is_owner desc,team.display_name nulls last,team.email;
$trial_team$;

create or replace function public.sdda_add_trial_team_member(
  target_trial_id uuid,
  member_email text,
  requested_role text
)
returns uuid
language plpgsql
security definer
set search_path=public
set row_security=off
as $add_member$
declare member_user_id uuid; previous_role text; owner_user_id uuid;
begin
  if requested_role not in ('secretary','assistant','viewer') then raise exception 'Choose Secretary, Assistant, or Viewer'; end if;
  select owner_id into owner_user_id from public.sdda_trials where id=target_trial_id;
  if owner_user_id is null or not (owner_user_id=auth.uid() or public.sdda_is_administrator()) then
    raise exception 'Only the trial owner or an administrator can manage the trial team';
  end if;
  select p.user_id into member_user_id from public.sdda_profiles p
  where lower(trim(p.email))=lower(trim(member_email)) limit 1;
  if member_user_id is null then raise exception 'No registered TrialDesk user was found for that email'; end if;
  if member_user_id=owner_user_id then raise exception 'The trial owner already has full access'; end if;
  select m.role into previous_role from public.sdda_trial_members m
  where m.trial_id=target_trial_id and m.user_id=member_user_id;
  insert into public.sdda_trial_members(trial_id,user_id,role)
  values(target_trial_id,member_user_id,requested_role)
  on conflict(trial_id,user_id) do update set role=excluded.role;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
  values(target_trial_id,auth.uid(),case when previous_role is null then 'trial_team.member_added' else 'trial_team.role_changed' end,
    'sdda_trial_member',member_user_id::text,
    case when previous_role is null then null else jsonb_build_object('email',lower(trim(member_email)),'role',previous_role) end,
    jsonb_build_object('email',lower(trim(member_email)),'role',requested_role));
  return member_user_id;
end;
$add_member$;

create or replace function public.sdda_remove_trial_team_member(target_trial_id uuid,member_user_id uuid)
returns void
language plpgsql
security definer
set search_path=public
set row_security=off
as $remove_member$
declare owner_user_id uuid; removed_email text; removed_role text;
begin
  select owner_id into owner_user_id from public.sdda_trials where id=target_trial_id;
  if owner_user_id is null or not (owner_user_id=auth.uid() or public.sdda_is_administrator()) then
    raise exception 'Only the trial owner or an administrator can manage the trial team';
  end if;
  if member_user_id=owner_user_id then raise exception 'The trial owner cannot be removed'; end if;
  select p.email,m.role into removed_email,removed_role from public.sdda_trial_members m
  join public.sdda_profiles p on p.user_id=m.user_id
  where m.trial_id=target_trial_id and m.user_id=member_user_id;
  if removed_role is null then return; end if;
  delete from public.sdda_trial_members where trial_id=target_trial_id and user_id=member_user_id;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state)
  values(target_trial_id,auth.uid(),'trial_team.member_removed','sdda_trial_member',member_user_id::text,
    jsonb_build_object('email',removed_email,'role',removed_role));
end;
$remove_member$;

create or replace function public.sdda_public_trial_entry_setup(target_trial_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public set row_security=off
as $entry_setup$
declare result jsonb;
begin
  select jsonb_build_object(
    'id',t.id,'name',t.name,'host_club',t.host_club,'venue',t.venue,'timezone',t.timezone,
    'trial_format',t.trial_format,'entry_open_at',t.entry_open_at,'entry_close_at',t.entry_close_at,
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
  ) into result from public.sdda_trials t where t.id=target_trial_id and t.status='entries_open'
    and (t.entry_open_at is null or now()>=t.entry_open_at) and (t.entry_close_at is null or now()<=t.entry_close_at);
  if result is null then raise exception 'This trial is not accepting online entries'; end if;
  return result;
end;
$entry_setup$;

create or replace function public.sdda_assert_requested_days_open(target_trial_id uuid,submission jsonb)
returns void language plpgsql stable security definer set search_path=public set row_security=off
as $assert_days$
begin
  if exists(
    select 1 from jsonb_array_elements(coalesce(submission->'runs','[]'::jsonb)) request
    join public.sdda_trial_offerings o on o.id=(request->>'offering_id')::uuid
    join public.sdda_trial_days d on d.id=o.trial_day_id
    where o.trial_id=target_trial_id and not d.entries_open
  ) or exists(
    select 1 from jsonb_array_elements(coalesce(submission->'game_runs','[]'::jsonb)) request
    join public.sdda_game_offerings g on g.id=(request->>'offering_id')::uuid
    join public.sdda_trial_days d on d.id=g.trial_day_id
    where g.trial_id=target_trial_id and not d.entries_open
  ) then raise exception 'One or more selected trial days are closed for entries'; end if;
end;
$assert_days$;

create or replace function public.sdda_submit_public_entry_v5(target_trial_id uuid,submission jsonb)
returns jsonb language plpgsql security definer set search_path=public set row_security=off
as $submit_v5$
begin
  perform public.sdda_assert_requested_days_open(target_trial_id,submission);
  return public.sdda_submit_public_entry_v4(target_trial_id,submission);
end;
$submit_v5$;

revoke all on function public.sdda_set_trial_day_entries_open(uuid,boolean) from public,anon,authenticated;
revoke all on function public.sdda_list_trial_team(uuid) from public,anon,authenticated;
revoke all on function public.sdda_add_trial_team_member(uuid,text,text) from public,anon,authenticated;
revoke all on function public.sdda_remove_trial_team_member(uuid,uuid) from public,anon,authenticated;
revoke all on function public.sdda_assert_requested_days_open(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.sdda_submit_public_entry_v5(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.sdda_submit_public_entry_v4(uuid,jsonb) from anon,authenticated;
grant execute on function public.sdda_set_trial_day_entries_open(uuid,boolean) to authenticated;
grant execute on function public.sdda_list_trial_team(uuid) to authenticated;
grant execute on function public.sdda_add_trial_team_member(uuid,text,text) to authenticated;
grant execute on function public.sdda_remove_trial_team_member(uuid,uuid) to authenticated;
grant execute on function public.sdda_submit_public_entry_v5(uuid,jsonb) to anon,authenticated;

commit;
