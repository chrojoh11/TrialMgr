begin;

create or replace function public.sdda_public_entry_by_registration(target_trial_id uuid,registration_number text,verification_email text)
returns jsonb language plpgsql stable security definer set search_path=public set row_security=off
as $lookup$
declare target_entry_id uuid; result jsonb;
begin
  if length(trim(coalesce(registration_number,'')))<1 or position('@' in trim(coalesce(verification_email,'')))<2 then
    raise exception 'Enter the SDDA registration or confirmation number and entry email';
  end if;
  select e.id into target_entry_id from public.sdda_entries e join public.sdda_dogs d on d.id=e.dog_id
  where e.trial_id=target_trial_id
    and (lower(trim(d.sdda_registration_number))=lower(trim(registration_number)) or lower(trim(e.confirmation_code))=lower(trim(registration_number)))
    and lower(trim(e.handler_email))=lower(trim(verification_email))
  order by e.submitted_at desc nulls last limit 1;
  if target_entry_id is null then raise exception 'The number and email could not be verified for this trial'; end if;
  result:=public.sdda_entry_edit_payload(target_entry_id);
  return result||jsonb_build_object('can_edit',exists(
    select 1 from public.sdda_entries e join public.sdda_trials t on t.id=e.trial_id
    where e.id=target_entry_id and e.confirmation_status='received' and t.status='entries_open'
      and (t.entry_close_at is null or now()<=t.entry_close_at)
      and not exists(select 1 from public.sdda_runs r left join public.sdda_scores s on s.run_id=r.id where r.entry_id=e.id and (r.running_position is not null or s.id is not null))
      and not exists(select 1 from public.sdda_game_runs gr left join public.sdda_game_scores gs on gs.game_run_id=gr.id where gr.entry_id=e.id and (gr.running_position is not null or gs.id is not null))
  ));
end;
$lookup$;

create or replace function public.sdda_update_public_entry_by_registration(target_trial_id uuid,registration_number text,verification_email text,submission jsonb)
returns jsonb language plpgsql security definer set search_path=public set row_security=off
as $update$
declare target_entry_id uuid;
begin
  select e.id into target_entry_id from public.sdda_entries e join public.sdda_dogs d on d.id=e.dog_id join public.sdda_trials t on t.id=e.trial_id
  where e.trial_id=target_trial_id
    and (lower(trim(d.sdda_registration_number))=lower(trim(registration_number)) or lower(trim(e.confirmation_code))=lower(trim(registration_number)))
    and lower(trim(e.handler_email))=lower(trim(verification_email))
    and e.confirmation_status='received' and t.status='entries_open' and (t.entry_close_at is null or now()<=t.entry_close_at)
  order by e.submitted_at desc nulls last limit 1 for update of e;
  if target_entry_id is null then raise exception 'This entry could not be verified or can no longer be edited online'; end if;
  perform public.sdda_apply_entry_update(target_entry_id,submission,null,'entry.public_updated');
  return public.sdda_entry_edit_payload(target_entry_id)||jsonb_build_object('can_edit',true);
end;
$update$;

create or replace function public.sdda_submit_public_entry_v3(target_trial_id uuid,submission jsonb)
returns jsonb language plpgsql security definer set search_path=public set row_security=off
as $submit$
declare requested_number text:=nullif(trim(submission->>'dog_registration_number'),''); requested_name text:=trim(coalesce(submission->>'dog_call_name','')); existing_name text;
begin
  if requested_number is not null then
    select d.call_name into existing_name from public.sdda_dogs d where lower(trim(d.sdda_registration_number))=lower(requested_number);
    if existing_name is not null and regexp_replace(lower(existing_name),'[^a-z0-9]','','g')<>regexp_replace(lower(requested_name),'[^a-z0-9]','','g') then
      raise exception 'That SDDA registration number is already recorded for a different dog name. Check the number and name or contact the trial secretary.';
    end if;
  end if;
  return public.sdda_submit_public_entry_v2(target_trial_id,submission);
end;
$submit$;

revoke all on function public.sdda_submit_public_entry_v3(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sdda_submit_public_entry_v3(uuid,jsonb) to anon,authenticated;

commit;
