begin;

create extension if not exists pgcrypto;

create table public.sdda_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sdda_trials (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 3 and 120),
  host_club text not null check (length(trim(host_club)) between 2 and 120),
  venue text,
  timezone text not null default 'America/Edmonton',
  status text not null default 'draft'
    check (status in ('draft', 'entries_open', 'entries_closed', 'in_progress', 'completed', 'cancelled')),
  owner_id uuid not null references public.sdda_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sdda_trial_days (
  id uuid primary key default gen_random_uuid(),
  trial_id uuid not null references public.sdda_trials(id) on delete cascade,
  day_number smallint not null check (day_number between 1 and 4),
  trial_date date not null,
  sdda_trial_number text,
  judge_name text,
  unique (trial_id, day_number),
  unique (trial_id, trial_date),
  unique (id, trial_id)
);

create table public.sdda_trial_members (
  trial_id uuid not null references public.sdda_trials(id) on delete cascade,
  user_id uuid not null references public.sdda_profiles(user_id) on delete cascade,
  role text not null check (role in ('owner', 'secretary', 'assistant', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (trial_id, user_id)
);

create table public.sdda_dogs (
  id uuid primary key default gen_random_uuid(),
  registered_name text,
  call_name text not null check (length(trim(call_name)) between 1 and 80),
  sdda_registration_number text,
  registration_pending boolean not null default false,
  breed text,
  created_by uuid not null references public.sdda_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (registration_pending or nullif(trim(sdda_registration_number), '') is not null)
);

create unique index sdda_dogs_registration_unique
  on public.sdda_dogs (lower(trim(sdda_registration_number)))
  where nullif(trim(sdda_registration_number), '') is not null;

create table public.sdda_entries (
  id uuid primary key default gen_random_uuid(),
  trial_id uuid not null references public.sdda_trials(id) on delete cascade,
  dog_id uuid not null references public.sdda_dogs(id),
  handler_name text not null check (length(trim(handler_name)) between 2 and 120),
  handler_email text,
  handler_phone text,
  participant_number text,
  stream text not null check (stream in ('Amateur', 'Working')),
  entry_status text not null default 'entered'
    check (entry_status in ('entered', 'waitlisted', 'withdrawn', 'cancelled')),
  source text not null default 'manual'
    check (source in ('manual', 'csv', 'google_form', 'backup')),
  source_row text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trial_id, dog_id, handler_name),
  unique (id, trial_id)
);

create table public.sdda_runs (
  id uuid primary key default gen_random_uuid(),
  trial_id uuid not null references public.sdda_trials(id) on delete cascade,
  entry_id uuid not null,
  trial_day_id uuid not null,
  level text not null check (level in ('Started', 'Advanced', 'Excellent', 'Elite')),
  component text not null check (component in ('Container', 'Interior', 'Exterior')),
  run_group text not null default 'Regular'
    check (run_group in ('Official', 'Regular', 'Second dog', 'FEO', 'BIS')),
  running_position integer check (running_position is null or running_position > 0),
  feo boolean not null default false,
  move_up_from_run_id uuid references public.sdda_runs(id),
  move_up_approved_by uuid references public.sdda_profiles(user_id),
  move_up_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (entry_id, trial_id)
    references public.sdda_entries(id, trial_id) on delete cascade,
  foreign key (trial_day_id, trial_id)
    references public.sdda_trial_days(id, trial_id) on delete cascade,
  unique (entry_id, trial_day_id, component)
);

create unique index sdda_runs_position_unique
  on public.sdda_runs (trial_day_id, level, component, running_position)
  where running_position is not null;

create table public.sdda_scores (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.sdda_runs(id) on delete cascade,
  result text not null check (result in ('qualifying', 'non_qualifying', 'absent', 'withdrawn', 'excused')),
  score numeric(8, 2),
  time_seconds numeric(9, 3) check (time_seconds is null or time_seconds >= 0),
  faults integer not null default 0 check (faults >= 0),
  judge_notes text,
  recorded_by uuid not null references public.sdda_profiles(user_id),
  recorded_at timestamptz not null default now(),
  amended_at timestamptz
);

create table public.sdda_financial_transactions (
  id uuid primary key default gen_random_uuid(),
  trial_id uuid not null references public.sdda_trials(id) on delete cascade,
  entry_id uuid references public.sdda_entries(id) on delete set null,
  transaction_type text not null
    check (transaction_type in ('entry_fee', 'payment', 'refund', 'expense', 'judge', 'volunteer', 'adjustment')),
  amount_cents integer not null,
  payment_method text,
  reference text,
  notes text,
  occurred_on date not null default current_date,
  created_by uuid not null references public.sdda_profiles(user_id),
  created_at timestamptz not null default now()
);

create table public.sdda_audit_records (
  id bigint generated always as identity primary key,
  trial_id uuid references public.sdda_trials(id) on delete cascade,
  actor_id uuid references public.sdda_profiles(user_id),
  action text not null,
  entity_type text not null,
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index sdda_trial_days_trial_idx on public.sdda_trial_days (trial_id);
create index sdda_entries_trial_idx on public.sdda_entries (trial_id);
create index sdda_runs_day_idx on public.sdda_runs (trial_day_id, level, component);
create index sdda_financial_trial_idx on public.sdda_financial_transactions (trial_id, occurred_on);
create index sdda_audit_trial_idx on public.sdda_audit_records (trial_id, created_at desc);

create or replace function public.sdda_can_access_trial(target_trial_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.sdda_trials t
    where t.id = target_trial_id
      and (t.owner_id = auth.uid() or exists (
        select 1 from public.sdda_trial_members m
        where m.trial_id = t.id and m.user_id = auth.uid()
      ))
  );
$$;

create or replace function public.sdda_can_manage_trial(target_trial_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.sdda_trials t
    where t.id = target_trial_id
      and (t.owner_id = auth.uid() or exists (
        select 1 from public.sdda_trial_members m
        where m.trial_id = t.id and m.user_id = auth.uid()
          and m.role in ('owner', 'secretary', 'assistant')
      ))
  );
$$;

create or replace function public.sdda_can_manage_finances(target_trial_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.sdda_trials t
    where t.id = target_trial_id
      and (t.owner_id = auth.uid() or exists (
        select 1 from public.sdda_trial_members m
        where m.trial_id = t.id and m.user_id = auth.uid()
          and m.role in ('owner', 'secretary')
      ))
  );
$$;

revoke all on function public.sdda_can_access_trial(uuid) from public;
revoke all on function public.sdda_can_manage_trial(uuid) from public;
revoke all on function public.sdda_can_manage_finances(uuid) from public;
grant execute on function public.sdda_can_access_trial(uuid) to authenticated;
grant execute on function public.sdda_can_manage_trial(uuid) to authenticated;
grant execute on function public.sdda_can_manage_finances(uuid) to authenticated;

alter table public.sdda_profiles enable row level security;
alter table public.sdda_trials enable row level security;
alter table public.sdda_trial_days enable row level security;
alter table public.sdda_trial_members enable row level security;
alter table public.sdda_dogs enable row level security;
alter table public.sdda_entries enable row level security;
alter table public.sdda_runs enable row level security;
alter table public.sdda_scores enable row level security;
alter table public.sdda_financial_transactions enable row level security;
alter table public.sdda_audit_records enable row level security;

create policy sdda_profiles_self_read on public.sdda_profiles
  for select to authenticated using (user_id = auth.uid());
create policy sdda_profiles_self_insert on public.sdda_profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy sdda_profiles_self_update on public.sdda_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy sdda_trials_read on public.sdda_trials
  for select to authenticated using (public.sdda_can_access_trial(id));
create policy sdda_trials_insert on public.sdda_trials
  for insert to authenticated with check (owner_id = auth.uid());
create policy sdda_trials_update on public.sdda_trials
  for update to authenticated using (public.sdda_can_manage_trial(id))
  with check (public.sdda_can_manage_trial(id));

create policy sdda_trial_days_read on public.sdda_trial_days
  for select to authenticated using (public.sdda_can_access_trial(trial_id));
create policy sdda_trial_days_write on public.sdda_trial_days
  for all to authenticated using (public.sdda_can_manage_trial(trial_id))
  with check (public.sdda_can_manage_trial(trial_id));

create policy sdda_trial_members_read on public.sdda_trial_members
  for select to authenticated using (public.sdda_can_access_trial(trial_id));
create policy sdda_trial_members_write on public.sdda_trial_members
  for all to authenticated using (
    exists (select 1 from public.sdda_trials t where t.id = trial_id and t.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.sdda_trials t where t.id = trial_id and t.owner_id = auth.uid())
  );

create policy sdda_dogs_read on public.sdda_dogs
  for select to authenticated using (
    created_by = auth.uid() or exists (
      select 1 from public.sdda_entries e
      where e.dog_id = id and public.sdda_can_access_trial(e.trial_id)
    )
  );
create policy sdda_dogs_insert on public.sdda_dogs
  for insert to authenticated with check (created_by = auth.uid());
create policy sdda_dogs_update on public.sdda_dogs
  for update to authenticated using (
    created_by = auth.uid() or exists (
      select 1 from public.sdda_entries e
      where e.dog_id = id and public.sdda_can_manage_trial(e.trial_id)
    )
  ) with check (
    created_by = auth.uid() or exists (
      select 1 from public.sdda_entries e
      where e.dog_id = id and public.sdda_can_manage_trial(e.trial_id)
    )
  );

create policy sdda_entries_read on public.sdda_entries
  for select to authenticated using (public.sdda_can_access_trial(trial_id));
create policy sdda_entries_write on public.sdda_entries
  for all to authenticated using (public.sdda_can_manage_trial(trial_id))
  with check (public.sdda_can_manage_trial(trial_id));

create policy sdda_runs_read on public.sdda_runs
  for select to authenticated using (public.sdda_can_access_trial(trial_id));
create policy sdda_runs_write on public.sdda_runs
  for all to authenticated using (public.sdda_can_manage_trial(trial_id))
  with check (public.sdda_can_manage_trial(trial_id));

create policy sdda_scores_read on public.sdda_scores
  for select to authenticated using (
    exists (
      select 1 from public.sdda_runs r join public.sdda_entries e on e.id = r.entry_id
      where r.id = run_id and public.sdda_can_access_trial(e.trial_id)
    )
  );
create policy sdda_scores_write on public.sdda_scores
  for all to authenticated using (
    exists (
      select 1 from public.sdda_runs r join public.sdda_entries e on e.id = r.entry_id
      where r.id = run_id and public.sdda_can_manage_trial(e.trial_id)
    )
  ) with check (
    recorded_by = auth.uid() and
    exists (
      select 1 from public.sdda_runs r join public.sdda_entries e on e.id = r.entry_id
      where r.id = run_id and public.sdda_can_manage_trial(e.trial_id)
    )
  );

create policy sdda_financial_read on public.sdda_financial_transactions
  for select to authenticated using (public.sdda_can_manage_finances(trial_id));
create policy sdda_financial_write on public.sdda_financial_transactions
  for all to authenticated using (public.sdda_can_manage_finances(trial_id))
  with check (created_by = auth.uid() and public.sdda_can_manage_finances(trial_id));

create policy sdda_audit_read on public.sdda_audit_records
  for select to authenticated using (trial_id is not null and public.sdda_can_access_trial(trial_id));
create policy sdda_audit_insert on public.sdda_audit_records
  for insert to authenticated with check (
    actor_id = auth.uid() and trial_id is not null and public.sdda_can_manage_trial(trial_id)
  );

commit;
