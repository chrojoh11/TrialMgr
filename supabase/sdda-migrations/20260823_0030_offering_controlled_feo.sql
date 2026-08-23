begin;

alter table public.sdda_trial_offerings add column if not exists feo_allowed boolean not null default false;
alter table public.sdda_game_offerings add column if not exists feo_allowed boolean not null default false;

update public.sdda_trial_offerings o set feo_allowed=true
where exists(select 1 from public.sdda_runs r where r.offering_id=o.id and r.run_group='FEO');
update public.sdda_game_offerings o set feo_allowed=true
where exists(select 1 from public.sdda_game_runs r where r.offering_id=o.id and r.entry_type='FEO');

create or replace function public.sdda_validate_feo_selection() returns trigger
language plpgsql set search_path=public as $validate_feo$
begin
  if tg_table_name='sdda_runs' and new.run_group='FEO'
    and not exists(select 1 from public.sdda_trial_offerings o where o.id=new.offering_id and o.feo_allowed)
  then raise exception 'FEO is not offered for this Scent component'; end if;
  if tg_table_name='sdda_game_runs' and new.entry_type='FEO'
    and not exists(select 1 from public.sdda_game_offerings o where o.id=new.offering_id and o.feo_allowed)
  then raise exception 'FEO is not offered for this Game'; end if;
  return new;
end;
$validate_feo$;

drop trigger if exists sdda_runs_validate_feo on public.sdda_runs;
create trigger sdda_runs_validate_feo before insert or update of offering_id,run_group on public.sdda_runs
for each row execute function public.sdda_validate_feo_selection();
drop trigger if exists sdda_game_runs_validate_feo on public.sdda_game_runs;
create trigger sdda_game_runs_validate_feo before insert or update of offering_id,entry_type on public.sdda_game_runs
for each row execute function public.sdda_validate_feo_selection();

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
    'days',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'day_number',d.day_number,'trial_date',d.trial_date,'sdda_trial_number',d.sdda_trial_number,'judge_name',d.judge_name) order by d.day_number) from public.sdda_trial_days d where d.trial_id=t.id),'[]'::jsonb),
    'offerings',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'trial_day_id',o.trial_day_id,'level',o.level,'component',o.component,'stream',o.stream,'capacity',o.capacity,'feo_allowed',o.feo_allowed)) from public.sdda_trial_offerings o where o.trial_id=t.id),'[]'::jsonb),
    'game_offerings',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'trial_day_id',g.trial_day_id,'game_type',g.game_type,'capacity',g.capacity,'entry_fee_cents',g.entry_fee_cents,'feo_fee_cents',g.feo_fee_cents,'feo_allowed',g.feo_allowed)) from public.sdda_game_offerings g where g.trial_id=t.id),'[]'::jsonb)
  ) into result from public.sdda_trials t where t.id=target_trial_id and t.status='entries_open'
    and (t.entry_open_at is null or now()>=t.entry_open_at) and (t.entry_close_at is null or now()<=t.entry_close_at);
  if result is null then raise exception 'This trial is not accepting online entries'; end if;
  return result;
end;
$entry_setup$;

revoke all on function public.sdda_public_trial_entry_setup(uuid) from public;
grant execute on function public.sdda_public_trial_entry_setup(uuid) to anon,authenticated;

commit;
