begin;

create table public.sdda_trial_offerings (
  id uuid primary key default gen_random_uuid(),
  trial_id uuid not null references public.sdda_trials(id) on delete cascade,
  trial_day_id uuid not null,
  level text not null check (level in ('Started', 'Advanced', 'Excellent', 'Elite')),
  component text not null check (component in ('Container', 'Interior', 'Exterior')),
  stream text not null check (stream in ('Amateur', 'Working')),
  judge_name text,
  capacity integer check (capacity is null or capacity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (trial_day_id, trial_id)
    references public.sdda_trial_days(id, trial_id) on delete cascade,
  unique (trial_day_id, level, component, stream)
);

create index sdda_trial_offerings_trial_idx
  on public.sdda_trial_offerings (trial_id, trial_day_id, level, component, stream);

alter table public.sdda_trial_offerings enable row level security;

create policy sdda_trial_offerings_read on public.sdda_trial_offerings
  for select to authenticated using (public.sdda_can_access_trial(trial_id));
create policy sdda_trial_offerings_write on public.sdda_trial_offerings
  for all to authenticated using (public.sdda_can_manage_trial(trial_id))
  with check (public.sdda_can_manage_trial(trial_id));

revoke all on table public.sdda_trial_offerings from anon;
grant select, insert, update, delete on table public.sdda_trial_offerings to authenticated;

create or replace function public.sdda_audit_trial_offering_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  changed public.sdda_trial_offerings;
begin
  changed := case when tg_op = 'DELETE' then old else new end;
  insert into public.sdda_audit_records (
    trial_id, actor_id, action, entity_type, entity_id, before_state, after_state
  ) values (
    changed.trial_id,
    auth.uid(),
    'trial_offering.' || lower(tg_op),
    'sdda_trial_offering',
    changed.id::text,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return changed;
end;
$$;

revoke all on function public.sdda_audit_trial_offering_change() from public;
revoke all on function public.sdda_audit_trial_offering_change() from anon;

create trigger sdda_trial_offering_audit
after insert or update or delete on public.sdda_trial_offerings
for each row execute function public.sdda_audit_trial_offering_change();

commit;
