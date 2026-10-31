begin;

create or replace function public.sdda_scent_selection_has_space(target_run_id uuid)
returns boolean language sql stable security definer set search_path=public set row_security=off
as $space$
  select o.capacity is null or (
    select count(*) from public.sdda_runs used
    where used.trial_day_id=r.trial_day_id and used.level=r.level and used.component=r.component
      and used.selection_status in ('received','accepted') and used.id<>r.id
  ) < o.capacity
  from public.sdda_runs r join public.sdda_trial_offerings o
    on o.trial_id=r.trial_id and o.trial_day_id=r.trial_day_id and o.level=r.level
    and o.component=r.component and o.stream=r.stream
  where r.id=target_run_id;
$space$;

create or replace function public.sdda_game_selection_has_space(target_run_id uuid)
returns boolean language sql stable security definer set search_path=public set row_security=off
as $space$
  select g.capacity is null or (
    select count(*) from public.sdda_game_runs used
    where used.offering_id=r.offering_id
      and used.selection_status in ('received','accepted') and used.id<>r.id
  ) < g.capacity
  from public.sdda_game_runs r join public.sdda_game_offerings g on g.id=r.offering_id
  where r.id=target_run_id;
$space$;

create or replace function public.sdda_reserve_entry_selections(target_entry_id uuid)
returns jsonb language plpgsql security definer set search_path=public set row_security=off
as $reserve$
declare target_trial_id uuid; item record; has_space boolean;
begin
  select trial_id into target_trial_id from public.sdda_entries where id=target_entry_id;
  if target_trial_id is null then raise exception 'Entry not found'; end if;
  perform 1 from public.sdda_trials where id=target_trial_id for update;

  for item in select id from public.sdda_runs where entry_id=target_entry_id order by created_at,id loop
    has_space:=public.sdda_scent_selection_has_space(item.id);
    update public.sdda_runs
    set selection_status=case when has_space then 'received' else 'waitlisted' end,
        running_position=case when has_space then running_position else null end
    where id=item.id;
  end loop;
  for item in select id from public.sdda_game_runs where entry_id=target_entry_id order by created_at,id loop
    has_space:=public.sdda_game_selection_has_space(item.id);
    update public.sdda_game_runs
    set selection_status=case when has_space then 'received' else 'waitlisted' end,
        running_position=case when has_space then running_position else null end
    where id=item.id;
  end loop;

  return jsonb_build_object(
    'reserved_count',(select count(*) from public.sdda_runs where entry_id=target_entry_id and selection_status='received')+
      (select count(*) from public.sdda_game_runs where entry_id=target_entry_id and selection_status='received'),
    'waitlisted_count',(select count(*) from public.sdda_runs where entry_id=target_entry_id and selection_status='waitlisted')+
      (select count(*) from public.sdda_game_runs where entry_id=target_entry_id and selection_status='waitlisted')
  );
end;
$reserve$;

create or replace function public.sdda_allocate_entry_selections(target_entry_id uuid)
returns text language plpgsql security definer set search_path=public set row_security=off
as $allocate$
declare accepted_count integer;
begin
  update public.sdda_runs set selection_status='accepted'
  where entry_id=target_entry_id and selection_status='received';
  update public.sdda_game_runs set selection_status='accepted'
  where entry_id=target_entry_id and selection_status='received';
  select (select count(*) from public.sdda_runs where entry_id=target_entry_id and selection_status='accepted')+
         (select count(*) from public.sdda_game_runs where entry_id=target_entry_id and selection_status='accepted')
    into accepted_count;
  return case when accepted_count>0 then 'accepted' else 'waitlisted' end;
end;
$allocate$;

create or replace function public.sdda_apply_entry_update(
  target_entry_id uuid,submission jsonb,audit_actor uuid,audit_action text
)
returns void language plpgsql security definer set search_path=public set row_security=off
as $update$
declare current_status text; target_trial_id uuid; resulting_status text;
begin
  select confirmation_status,trial_id into current_status,target_trial_id
  from public.sdda_entries where id=target_entry_id;
  if target_trial_id is null then raise exception 'Entry not found'; end if;
  perform 1 from public.sdda_trials where id=target_trial_id for update;

  perform public.sdda_apply_entry_update_base_v48(
    target_entry_id,submission,audit_actor,audit_action
  );

  if current_status in ('received','accepted') then
    perform public.sdda_reserve_entry_selections(target_entry_id);
    if current_status='accepted' then
      resulting_status:=public.sdda_allocate_entry_selections(target_entry_id);
      update public.sdda_entries set confirmation_status=resulting_status where id=target_entry_id;
    end if;
  elsif current_status='waitlisted' then
    update public.sdda_runs set selection_status='waitlisted',running_position=null where entry_id=target_entry_id;
    update public.sdda_game_runs set selection_status='waitlisted',running_position=null where entry_id=target_entry_id;
  else
    update public.sdda_runs set selection_status='withdrawn',running_position=null where entry_id=target_entry_id;
    update public.sdda_game_runs set selection_status='withdrawn',running_position=null where entry_id=target_entry_id;
  end if;
end;
$update$;

create or replace function public.sdda_set_entry_confirmation_status(target_entry_id uuid,requested_status text)
returns void language plpgsql security definer set search_path=public set row_security=off
as $status$
declare target_trial_id uuid; resulting_status text;
begin
  if requested_status not in ('received','accepted','waitlisted','rejected') then
    raise exception 'Invalid entry confirmation status';
  end if;
  select trial_id into target_trial_id from public.sdda_entries where id=target_entry_id;
  if target_trial_id is null or not public.sdda_can_manage_trial(target_trial_id) then
    raise exception 'Entry not found or access denied';
  end if;
  perform 1 from public.sdda_trials where id=target_trial_id for update;
  perform 1 from public.sdda_entries where id=target_entry_id for update;

  if requested_status='accepted' then
    resulting_status:=public.sdda_allocate_entry_selections(target_entry_id);
  elsif requested_status='waitlisted' then
    update public.sdda_runs set selection_status='waitlisted',running_position=null where entry_id=target_entry_id;
    update public.sdda_game_runs set selection_status='waitlisted',running_position=null where entry_id=target_entry_id;
    resulting_status:='waitlisted';
  elsif requested_status='received' then
    update public.sdda_runs set selection_status='received',running_position=null
      where entry_id=target_entry_id and selection_status='accepted';
    update public.sdda_game_runs set selection_status='received',running_position=null
      where entry_id=target_entry_id and selection_status='accepted';
    resulting_status:='received';
  else
    update public.sdda_runs set selection_status='withdrawn',running_position=null where entry_id=target_entry_id;
    update public.sdda_game_runs set selection_status='withdrawn',running_position=null where entry_id=target_entry_id;
    resulting_status:='rejected';
  end if;
  perform public.sdda_set_entry_confirmation_status_base_v48(target_entry_id,resulting_status);
end;
$status$;

create or replace function public.sdda_submit_public_entry_v6(target_trial_id uuid,submission jsonb)
returns jsonb language plpgsql security definer set search_path=public set row_security=off
as $submit$
declare result jsonb; target_entry_id uuid; reservation jsonb;
begin
  perform 1 from public.sdda_trials where id=target_trial_id for update;
  perform public.sdda_assert_public_entry_window(target_trial_id,submission);
  result:=public.sdda_submit_public_entry_v5(target_trial_id,submission);
  select id into target_entry_id from public.sdda_entries
    where trial_id=target_trial_id and confirmation_code=result->>'confirmation_code';
  reservation:=public.sdda_reserve_entry_selections(target_entry_id);
  return result||reservation;
end;
$submit$;

create or replace function public.sdda_public_trial_entry_setup(target_trial_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public set row_security=off
as $entry_setup$
declare result jsonb;
begin
  select jsonb_build_object(
    'id',t.id,'name',t.name,'host_club',t.host_club,'venue',t.venue,'timezone',t.timezone,
    'trial_format',t.trial_format,'entry_open_at',t.entry_open_at,
    'general_entry_open_at',t.general_entry_open_at,'entry_close_at',t.entry_close_at,
    'entry_phase',case when t.general_entry_open_at is not null and now()<t.general_entry_open_at then 'registered_only' else 'general' end,
    'secretary_name',t.secretary_name,'secretary_email',t.secretary_email,'secretary_phone',t.secretary_phone,
    'payment_instructions',t.payment_instructions,'cancellation_policy',t.cancellation_policy,
    'additional_entry_terms',t.additional_entry_terms,
    'scent_component_fee_cents',t.scent_component_fee_cents,
    'scent_three_component_fee_cents',t.scent_three_component_fee_cents,'elite_fee_cents',t.elite_fee_cents,
    'days',coalesce((select jsonb_agg(jsonb_build_object(
      'id',d.id,'day_number',d.day_number,'trial_date',d.trial_date,'sdda_trial_number',d.sdda_trial_number,
      'judge_name',d.judge_name,'entries_open',d.entries_open) order by d.day_number)
      from public.sdda_trial_days d where d.trial_id=t.id),'[]'::jsonb),
    'offerings',coalesce((select jsonb_agg(jsonb_build_object(
      'id',o.id,'trial_day_id',o.trial_day_id,'level',o.level,'component',o.component,'stream',o.stream,
      'capacity',o.capacity,'feo_allowed',o.feo_allowed,'judge_name',o.judge_name,
      'accepted_count',(select count(*) from public.sdda_runs occupied
        where occupied.trial_id=t.id and occupied.trial_day_id=o.trial_day_id and occupied.level=o.level
          and occupied.component=o.component and occupied.selection_status in ('received','accepted')),
      'occupied_count',(select count(*) from public.sdda_runs occupied
        where occupied.trial_id=t.id and occupied.trial_day_id=o.trial_day_id and occupied.level=o.level
          and occupied.component=o.component and occupied.selection_status in ('received','accepted'))))
      from public.sdda_trial_offerings o where o.trial_id=t.id),'[]'::jsonb),
    'game_offerings',coalesce((select jsonb_agg(jsonb_build_object(
      'id',g.id,'trial_day_id',g.trial_day_id,'game_type',g.game_type,'capacity',g.capacity,
      'entry_fee_cents',g.entry_fee_cents,'feo_fee_cents',g.feo_fee_cents,'feo_allowed',g.feo_allowed,
      'judge_name',g.judge_name,'accepted_count',(select count(*) from public.sdda_game_runs occupied
        where occupied.offering_id=g.id and occupied.selection_status in ('received','accepted')),
      'occupied_count',(select count(*) from public.sdda_game_runs occupied
        where occupied.offering_id=g.id and occupied.selection_status in ('received','accepted'))))
      from public.sdda_game_offerings g where g.trial_id=t.id),'[]'::jsonb)
  ) into result from public.sdda_trials t
  where t.id=target_trial_id and t.status='entries_open'
    and (t.entry_open_at is null or now()>=t.entry_open_at)
    and (t.entry_close_at is null or now()<=t.entry_close_at);
  if result is null then raise exception 'This trial is not accepting online entries'; end if;
  return result;
end;
$entry_setup$;

revoke all on function public.sdda_scent_selection_has_space(uuid) from public,anon,authenticated;
revoke all on function public.sdda_game_selection_has_space(uuid) from public,anon,authenticated;
revoke all on function public.sdda_reserve_entry_selections(uuid) from public,anon,authenticated;
revoke all on function public.sdda_allocate_entry_selections(uuid) from public,anon,authenticated;
revoke all on function public.sdda_apply_entry_update(uuid,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.sdda_set_entry_confirmation_status(uuid,text) from public,anon,authenticated;
revoke all on function public.sdda_submit_public_entry_v6(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.sdda_public_trial_entry_setup(uuid) from public,anon,authenticated;
grant execute on function public.sdda_set_entry_confirmation_status(uuid,text) to authenticated;
grant execute on function public.sdda_submit_public_entry_v6(uuid,jsonb) to anon,authenticated;
grant execute on function public.sdda_public_trial_entry_setup(uuid) to anon,authenticated;

commit;
