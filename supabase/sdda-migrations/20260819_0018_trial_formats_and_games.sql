begin;

alter table public.sdda_trials
  add column if not exists trial_format text not null default 'scent'
  check (trial_format in ('scent', 'games', 'combined'));

create table public.sdda_game_offerings (
  id uuid primary key default gen_random_uuid(),
  trial_id uuid not null,
  trial_day_id uuid not null,
  game_type text not null check (game_type in ('Aerial', 'Distance', 'Speed', 'Team')),
  judge_name text,
  capacity integer check (capacity is null or capacity > 0),
  entry_fee_cents integer not null default 0 check (entry_fee_cents >= 0),
  feo_fee_cents integer not null default 0 check (feo_fee_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (trial_day_id, trial_id)
    references public.sdda_trial_days(id, trial_id) on delete cascade,
  foreign key (trial_id)
    references public.sdda_trials(id) on delete cascade,
  unique (trial_day_id, game_type),
  unique (id, trial_id)
);

create table public.sdda_game_team_pairs (
  id uuid primary key default gen_random_uuid(),
  trial_id uuid not null,
  trial_day_id uuid not null,
  offering_id uuid not null,
  team_name text,
  running_position integer check (running_position is null or running_position > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (trial_day_id, trial_id)
    references public.sdda_trial_days(id, trial_id) on delete cascade,
  foreign key (offering_id, trial_id)
    references public.sdda_game_offerings(id, trial_id) on delete cascade,
  unique (id, trial_id),
  unique (offering_id, running_position)
);

create table public.sdda_game_runs (
  id uuid primary key default gen_random_uuid(),
  trial_id uuid not null,
  trial_day_id uuid not null,
  offering_id uuid not null,
  entry_id uuid not null,
  entry_type text not null default 'Regular' check (entry_type in ('Regular', 'FEO')),
  running_position integer check (running_position is null or running_position > 0),
  team_pair_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (trial_day_id, trial_id)
    references public.sdda_trial_days(id, trial_id) on delete cascade,
  foreign key (offering_id, trial_id)
    references public.sdda_game_offerings(id, trial_id) on delete cascade,
  foreign key (entry_id, trial_id)
    references public.sdda_entries(id, trial_id) on delete cascade,
  foreign key (team_pair_id, trial_id)
    references public.sdda_game_team_pairs(id, trial_id) on delete set null (team_pair_id),
  unique (entry_id, offering_id),
  unique (offering_id, running_position)
);

create table public.sdda_game_scores (
  id uuid primary key default gen_random_uuid(),
  game_run_id uuid not null unique references public.sdda_game_runs(id) on delete cascade,
  result text not null check (result in ('pass', 'fail', 'absent', 'withdrawn', 'excused')),
  time_seconds numeric(9, 3) check (time_seconds is null or time_seconds >= 0),
  judge_notes text,
  recorded_by uuid not null references public.sdda_profiles(user_id),
  recorded_at timestamptz not null default now(),
  amended_at timestamptz
);

alter table public.sdda_game_offerings enable row level security;
alter table public.sdda_game_team_pairs enable row level security;
alter table public.sdda_game_runs enable row level security;
alter table public.sdda_game_scores enable row level security;

create policy sdda_game_offerings_read on public.sdda_game_offerings
  for select to authenticated using (public.sdda_can_access_trial(trial_id));
create policy sdda_game_offerings_write on public.sdda_game_offerings
  for all to authenticated using (public.sdda_can_manage_trial(trial_id))
  with check (public.sdda_can_manage_trial(trial_id));

create policy sdda_game_team_pairs_read on public.sdda_game_team_pairs
  for select to authenticated using (public.sdda_can_access_trial(trial_id));
create policy sdda_game_team_pairs_write on public.sdda_game_team_pairs
  for all to authenticated using (public.sdda_can_manage_trial(trial_id))
  with check (public.sdda_can_manage_trial(trial_id));

create policy sdda_game_runs_read on public.sdda_game_runs
  for select to authenticated using (public.sdda_can_access_trial(trial_id));
create policy sdda_game_runs_write on public.sdda_game_runs
  for all to authenticated using (public.sdda_can_manage_trial(trial_id))
  with check (public.sdda_can_manage_trial(trial_id));

create policy sdda_game_scores_read on public.sdda_game_scores
  for select to authenticated using (
    exists (select 1 from public.sdda_game_runs r where r.id=game_run_id and public.sdda_can_access_trial(r.trial_id))
  );
create policy sdda_game_scores_write on public.sdda_game_scores
  for all to authenticated using (
    exists (select 1 from public.sdda_game_runs r where r.id=game_run_id and public.sdda_can_manage_trial(r.trial_id))
  ) with check (
    recorded_by=auth.uid() and
    exists (select 1 from public.sdda_game_runs r where r.id=game_run_id and public.sdda_can_manage_trial(r.trial_id))
  );

revoke all on table public.sdda_game_offerings, public.sdda_game_team_pairs,
  public.sdda_game_runs, public.sdda_game_scores from anon;
grant select, insert, update, delete on table public.sdda_game_offerings,
  public.sdda_game_team_pairs, public.sdda_game_runs, public.sdda_game_scores to authenticated;

drop function if exists public.sdda_create_trial(text, text, text, date[]);
create function public.sdda_create_trial(
  trial_name text,
  trial_host_club text,
  trial_venue text,
  trial_dates date[],
  requested_trial_format text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_trial_id uuid;
  trial_date date;
  day_number integer := 0;
  normalized_format text := lower(trim(requested_trial_format));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(trial_name)) not between 3 and 120 then raise exception 'Trial name must be between 3 and 120 characters'; end if;
  if length(trim(trial_host_club)) not between 2 and 120 then raise exception 'Host club must be between 2 and 120 characters'; end if;
  if normalized_format not in ('scent', 'games', 'combined') then raise exception 'Trial format must be Scent, Games, or Combined'; end if;
  if coalesce(cardinality(trial_dates), 0) not between 1 and 4 then raise exception 'An SDDA trial must have between one and four days'; end if;
  if (select count(distinct value) from unnest(trial_dates) as value) <> cardinality(trial_dates) then raise exception 'SDDA trial days must be unique'; end if;

  insert into public.sdda_trials (name, host_club, venue, owner_id, status, trial_format)
  values (trim(trial_name), trim(trial_host_club), nullif(trim(trial_venue), ''), auth.uid(), 'draft', normalized_format)
  returning id into new_trial_id;

  foreach trial_date in array trial_dates loop
    day_number := day_number + 1;
    insert into public.sdda_trial_days (trial_id, day_number, trial_date) values (new_trial_id, day_number, trial_date);
  end loop;

  insert into public.sdda_audit_records (trial_id, actor_id, action, entity_type, entity_id, after_state)
  values (new_trial_id, auth.uid(), 'trial.created', 'sdda_trial', new_trial_id::text,
    jsonb_build_object('name',trim(trial_name),'host_club',trim(trial_host_club),'venue',nullif(trim(trial_venue),''),
      'dates',to_jsonb(trial_dates),'status','draft','trial_format',normalized_format));
  return new_trial_id;
end;
$$;

revoke all on function public.sdda_create_trial(text,text,text,date[],text) from public, anon;
grant execute on function public.sdda_create_trial(text,text,text,date[],text) to authenticated;

commit;
