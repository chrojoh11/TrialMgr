begin;

alter table public.sdda_game_runs
  add column if not exists run_group text not null default 'Regular';

update public.sdda_game_runs
set run_group = 'FEO'
where entry_type = 'FEO' and run_group <> 'FEO';

alter table public.sdda_game_runs
  drop constraint if exists sdda_game_runs_run_group_check;
alter table public.sdda_game_runs
  add constraint sdda_game_runs_run_group_check
  check (run_group in ('Official','Regular','Second dog','FEO','BIS'));

create or replace function public.sdda_validate_game_run_group()
returns trigger
language plpgsql
set search_path=public
as $validate$
declare requested_game_type text;
begin
  select game_type into requested_game_type
  from public.sdda_game_offerings
  where id=new.offering_id and trial_id=new.trial_id;

  if requested_game_type is null then
    raise exception 'Games offering was not found for this trial';
  end if;

  if new.entry_type='FEO' then
    new.run_group:='FEO';
  elsif new.run_group='FEO' then
    raise exception 'Only an FEO entry may use the FEO running-order group';
  end if;

  if new.run_group='Second dog' and requested_game_type not in ('Aerial','Distance') then
    raise exception 'Second dogs are permitted only in Aerial and Distance';
  end if;

  return new;
end;
$validate$;

drop trigger if exists sdda_game_runs_validate_group on public.sdda_game_runs;
create trigger sdda_game_runs_validate_group
before insert or update of offering_id,trial_id,entry_type,run_group
on public.sdda_game_runs
for each row execute function public.sdda_validate_game_run_group();

commit;
