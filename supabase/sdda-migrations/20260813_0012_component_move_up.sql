begin;
alter table public.sdda_runs add column if not exists move_up_from_level text check(move_up_from_level in ('Started','Advanced'));
create or replace function public.sdda_set_run_move_up(target_run_id uuid,approve_move_up boolean,qualification_confirmed boolean,host_approved boolean)
returns void language plpgsql security invoker set search_path=public as $$
declare target_run public.sdda_runs%rowtype; source_run_id uuid; next_level text; offering_capacity integer;
begin
 select * into target_run from public.sdda_runs where id=target_run_id;
 if target_run.id is null or not public.sdda_can_manage_trial(target_run.trial_id) then raise exception 'Trial management permission required'; end if;
 if not approve_move_up then
  if target_run.move_up_approved_at is null or target_run.move_up_from_level is null then raise exception 'Run is not an approved move-up'; end if;
  update public.sdda_runs set level=target_run.move_up_from_level,move_up_from_run_id=null,move_up_from_level=null,move_up_approved_by=null,move_up_approved_at=null,running_position=null,updated_at=now() where id=target_run_id;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state) values(target_run.trial_id,auth.uid(),'run.move_up_undone','sdda_run',target_run_id::text,jsonb_build_object('level',target_run.level),jsonb_build_object('level',target_run.move_up_from_level)); return;
 end if;
 if not qualification_confirmed or not host_approved then raise exception 'Qualification and host approval must be confirmed'; end if;
 if target_run.move_up_approved_at is not null then raise exception 'Run is already an approved move-up'; end if;
 next_level=case target_run.level when 'Started' then 'Advanced' when 'Advanced' then 'Excellent' else null end;
 if next_level is null then raise exception 'Only Started to Advanced and Advanced to Excellent move-ups are supported'; end if;
 if exists(select 1 from public.sdda_runs r where r.id<>target_run.id and r.entry_id=target_run.entry_id and r.trial_day_id=target_run.trial_day_id and r.component=target_run.component and r.level=next_level) then raise exception 'Dog already has this next-level component run'; end if;
 select capacity into offering_capacity from public.sdda_trial_offerings where trial_day_id=target_run.trial_day_id and level=next_level and component=target_run.component and stream=target_run.stream;
 if not found then raise exception 'The next-level component and stream is not offered on this day'; end if;
 if offering_capacity is not null and (select count(*) from public.sdda_runs where trial_day_id=target_run.trial_day_id and level=next_level and component=target_run.component)>=offering_capacity then raise exception 'The next-level offering is at capacity'; end if;
 select r.id into source_run_id from public.sdda_runs r join public.sdda_trial_days d on d.id=r.trial_day_id join public.sdda_trial_days td on td.id=target_run.trial_day_id where r.entry_id=target_run.entry_id and r.component=target_run.component and r.level=target_run.level and (d.trial_date<td.trial_date or (d.trial_date=td.trial_date and d.day_number<td.day_number)) order by d.trial_date desc,d.day_number desc limit 1;
 update public.sdda_runs set level=next_level,move_up_from_run_id=source_run_id,move_up_from_level=target_run.level,move_up_approved_by=auth.uid(),move_up_approved_at=now(),running_position=null,updated_at=now() where id=target_run.id;
 insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state) values(target_run.trial_id,auth.uid(),'run.move_up_approved','sdda_run',target_run.id::text,jsonb_build_object('level',target_run.level,'component',target_run.component),jsonb_build_object('level',next_level,'component',target_run.component,'qualification_confirmed',true,'host_approved',true,'source_run_id',source_run_id));
end; $$;
revoke all on function public.sdda_set_run_move_up(uuid,boolean,boolean,boolean) from public;
revoke all on function public.sdda_set_run_move_up(uuid,boolean,boolean,boolean) from anon;
grant execute on function public.sdda_set_run_move_up(uuid,boolean,boolean,boolean) to authenticated;
commit;
