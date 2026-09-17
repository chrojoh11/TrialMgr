begin;

alter table public.sdda_runs add column if not exists selection_status text;
alter table public.sdda_game_runs add column if not exists selection_status text;

update public.sdda_runs r set selection_status=case e.confirmation_status when 'accepted' then 'accepted' when 'waitlisted' then 'waitlisted' when 'rejected' then 'withdrawn' else 'received' end
from public.sdda_entries e where e.id=r.entry_id and r.selection_status is null;
update public.sdda_game_runs r set selection_status=case e.confirmation_status when 'accepted' then 'accepted' when 'waitlisted' then 'waitlisted' when 'rejected' then 'withdrawn' else 'received' end
from public.sdda_entries e where e.id=r.entry_id and r.selection_status is null;

alter table public.sdda_runs alter column selection_status set default 'received';
alter table public.sdda_runs alter column selection_status set not null;
alter table public.sdda_runs drop constraint if exists sdda_runs_selection_status_check;
alter table public.sdda_runs add constraint sdda_runs_selection_status_check check(selection_status in ('received','accepted','waitlisted','withdrawn'));
alter table public.sdda_game_runs alter column selection_status set default 'received';
alter table public.sdda_game_runs alter column selection_status set not null;
alter table public.sdda_game_runs drop constraint if exists sdda_game_runs_selection_status_check;
alter table public.sdda_game_runs add constraint sdda_game_runs_selection_status_check check(selection_status in ('received','accepted','waitlisted','withdrawn'));

create or replace function public.sdda_scent_selection_has_space(target_run_id uuid)
returns boolean language sql stable security definer set search_path=public set row_security=off
as $space$
  select o.capacity is null or (
    select count(*) from public.sdda_runs used
    where used.trial_day_id=r.trial_day_id and used.level=r.level and used.component=r.component
      and used.selection_status='accepted' and used.id<>r.id
  ) < o.capacity
  from public.sdda_runs r join public.sdda_trial_offerings o
    on o.trial_id=r.trial_id and o.trial_day_id=r.trial_day_id and o.level=r.level and o.component=r.component and o.stream=r.stream
  where r.id=target_run_id;
$space$;

create or replace function public.sdda_game_selection_has_space(target_run_id uuid)
returns boolean language sql stable security definer set search_path=public set row_security=off
as $space$
  select g.capacity is null or (
    select count(*) from public.sdda_game_runs used where used.offering_id=r.offering_id and used.selection_status='accepted' and used.id<>r.id
  ) < g.capacity
  from public.sdda_game_runs r join public.sdda_game_offerings g on g.id=r.offering_id where r.id=target_run_id;
$space$;

create or replace function public.sdda_allocate_entry_selections(target_entry_id uuid)
returns text language plpgsql security definer set search_path=public set row_security=off
as $allocate$
declare item record; accepted_count integer; has_space boolean;
begin
  for item in select id from public.sdda_runs where entry_id=target_entry_id order by created_at,id loop
    has_space:=public.sdda_scent_selection_has_space(item.id);
    update public.sdda_runs
    set selection_status=case when has_space then 'accepted' else 'waitlisted' end,
        running_position=case when has_space then running_position else null end
    where id=item.id;
  end loop;
  for item in select id from public.sdda_game_runs where entry_id=target_entry_id order by created_at,id loop
    has_space:=public.sdda_game_selection_has_space(item.id);
    update public.sdda_game_runs
    set selection_status=case when has_space then 'accepted' else 'waitlisted' end,
        running_position=case when has_space then running_position else null end
    where id=item.id;
  end loop;
  select (select count(*) from public.sdda_runs where entry_id=target_entry_id and selection_status='accepted')+
         (select count(*) from public.sdda_game_runs where entry_id=target_entry_id and selection_status='accepted') into accepted_count;
  return case when accepted_count>0 then 'accepted' else 'waitlisted' end;
end;
$allocate$;

create or replace function public.sdda_set_entry_confirmation_status(target_entry_id uuid,requested_status text)
returns void language plpgsql security definer set search_path=public set row_security=off
as $status$
declare target_trial_id uuid;
begin
  if requested_status not in ('received','accepted','waitlisted','rejected') then raise exception 'Invalid entry confirmation status'; end if;
  select trial_id into target_trial_id from public.sdda_entries where id=target_entry_id for update;
  if target_trial_id is null or not public.sdda_can_manage_trial(target_trial_id) then raise exception 'Entry not found or access denied'; end if;

  if requested_status='accepted' then
    requested_status:=public.sdda_allocate_entry_selections(target_entry_id);
  elsif requested_status='waitlisted' then
    update public.sdda_runs set selection_status='waitlisted',running_position=null where entry_id=target_entry_id;
    update public.sdda_game_runs set selection_status='waitlisted',running_position=null where entry_id=target_entry_id;
  elsif requested_status='received' then
    update public.sdda_runs set selection_status='received',running_position=null where entry_id=target_entry_id;
    update public.sdda_game_runs set selection_status='received',running_position=null where entry_id=target_entry_id;
  else
    update public.sdda_runs set selection_status='withdrawn',running_position=null where entry_id=target_entry_id;
    update public.sdda_game_runs set selection_status='withdrawn',running_position=null where entry_id=target_entry_id;
  end if;
  perform public.sdda_set_entry_confirmation_status_base_v48(target_entry_id,requested_status);
end;
$status$;

create or replace function public.sdda_promote_waitlisted_selection(target_kind text,target_selection_id uuid,increase_capacity boolean default false)
returns void language plpgsql security definer set search_path=public set row_security=off
as $promote$
declare target_trial_id uuid; target_entry_id uuid; space_available boolean;
begin
  if target_kind='scent' then
    select trial_id,entry_id into target_trial_id,target_entry_id from public.sdda_runs where id=target_selection_id and selection_status='waitlisted' for update;
  elsif target_kind='game' then
    select trial_id,entry_id into target_trial_id,target_entry_id from public.sdda_game_runs where id=target_selection_id and selection_status='waitlisted' for update;
  else raise exception 'Invalid selection type'; end if;
  if target_trial_id is null or not public.sdda_can_manage_trial(target_trial_id) then raise exception 'Waitlisted selection not found or access denied'; end if;
  if target_kind='scent' then
    space_available:=public.sdda_scent_selection_has_space(target_selection_id);
    if not space_available and increase_capacity then
      update public.sdda_trial_offerings o set capacity=o.capacity+1 where o.trial_day_id=(select trial_day_id from public.sdda_runs where id=target_selection_id) and o.level=(select level from public.sdda_runs where id=target_selection_id) and o.component=(select component from public.sdda_runs where id=target_selection_id);
      space_available:=true;
    end if;
    if not space_available then raise exception 'This Scent offering is still at capacity'; end if;
    update public.sdda_runs set selection_status='accepted' where id=target_selection_id;
  else
    space_available:=public.sdda_game_selection_has_space(target_selection_id);
    if not space_available and increase_capacity then update public.sdda_game_offerings set capacity=capacity+1 where id=(select offering_id from public.sdda_game_runs where id=target_selection_id); space_available:=true; end if;
    if not space_available then raise exception 'This Game is still at capacity'; end if;
    update public.sdda_game_runs set selection_status='accepted' where id=target_selection_id;
  end if;
  update public.sdda_entries set confirmation_status='accepted' where id=target_entry_id;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,after_state)
  values(target_trial_id,auth.uid(),'entry.waitlist_promoted','sdda_selection',target_selection_id::text,jsonb_build_object('kind',target_kind,'status','accepted','capacity_increased',increase_capacity));
end;
$promote$;

create or replace function public.sdda_apply_entry_update(target_entry_id uuid,submission jsonb,audit_actor uuid,audit_action text)
returns void language plpgsql security definer set search_path=public set row_security=off
as $update$
declare current_status text; target_trial_id uuid;
begin
  select confirmation_status,trial_id into current_status,target_trial_id from public.sdda_entries where id=target_entry_id;
  if target_trial_id is null then raise exception 'Entry not found'; end if;
  perform public.sdda_apply_entry_update_base_v48(target_entry_id,submission,audit_actor,audit_action);
  if current_status='accepted' then
    update public.sdda_entries set confirmation_status=public.sdda_allocate_entry_selections(target_entry_id)
    where id=target_entry_id;
  end if;
end;
$update$;

revoke all on function public.sdda_scent_selection_has_space(uuid) from public,anon,authenticated;
revoke all on function public.sdda_game_selection_has_space(uuid) from public,anon,authenticated;
revoke all on function public.sdda_allocate_entry_selections(uuid) from public,anon,authenticated;
revoke all on function public.sdda_set_entry_confirmation_status(uuid,text) from public,anon,authenticated;
revoke all on function public.sdda_promote_waitlisted_selection(text,uuid,boolean) from public,anon,authenticated;
revoke all on function public.sdda_apply_entry_update(uuid,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.sdda_set_entry_confirmation_status(uuid,text) to authenticated;
grant execute on function public.sdda_promote_waitlisted_selection(text,uuid,boolean) to authenticated;
grant execute on function public.sdda_apply_entry_update(uuid,jsonb,uuid,text) to authenticated;

commit;
