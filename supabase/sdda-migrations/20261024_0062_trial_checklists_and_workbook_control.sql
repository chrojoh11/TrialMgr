-- Persistent secretary checklists and an auditable official-workbook version pin.

alter table public.sdda_trials
  add column if not exists workbook_source_url text,
  add column if not exists workbook_filename text,
  add column if not exists workbook_sha256 text,
  add column if not exists workbook_pinned_at timestamptz,
  add column if not exists workbook_proofed_at timestamptz,
  add column if not exists workbook_proofed_by uuid references public.sdda_profiles(user_id);

create table if not exists public.sdda_trial_checklist_items (
  trial_id uuid not null references public.sdda_trials(id) on delete cascade,
  checklist text not null check (checklist in ('sanction','closeout')),
  item_key text not null,
  completed boolean not null default false,
  notes text,
  completed_at timestamptz,
  completed_by uuid references public.sdda_profiles(user_id),
  updated_at timestamptz not null default now(),
  primary key (trial_id,checklist,item_key)
);

alter table public.sdda_trial_checklist_items enable row level security;
drop policy if exists sdda_trial_checklist_read on public.sdda_trial_checklist_items;
create policy sdda_trial_checklist_read on public.sdda_trial_checklist_items
  for select to authenticated using (public.sdda_can_access_trial(trial_id));
drop policy if exists sdda_trial_checklist_write on public.sdda_trial_checklist_items;
create policy sdda_trial_checklist_write on public.sdda_trial_checklist_items
  for all to authenticated using (public.sdda_can_manage_trial(trial_id))
  with check (public.sdda_can_manage_trial(trial_id));

create or replace function public.sdda_set_checklist_item(
  target_trial_id uuid,
  target_checklist text,
  target_item_key text,
  requested_completed boolean,
  requested_notes text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $checklist$
declare
  before_record public.sdda_trial_checklist_items%rowtype;
  after_record public.sdda_trial_checklist_items%rowtype;
begin
  if auth.uid() is null or not public.sdda_can_manage_trial(target_trial_id) then
    raise exception 'You cannot update this trial checklist.';
  end if;
  if target_checklist not in ('sanction','closeout') then raise exception 'Invalid checklist.'; end if;
  if nullif(btrim(target_item_key),'') is null then raise exception 'Checklist item is required.'; end if;
  select * into before_record from public.sdda_trial_checklist_items
    where trial_id=target_trial_id and checklist=target_checklist and item_key=target_item_key;
  insert into public.sdda_trial_checklist_items(
    trial_id,checklist,item_key,completed,notes,completed_at,completed_by,updated_at
  ) values (
    target_trial_id,target_checklist,target_item_key,requested_completed,nullif(btrim(requested_notes),''),
    case when requested_completed then now() end,
    case when requested_completed then auth.uid() end,now()
  ) on conflict(trial_id,checklist,item_key) do update set
    completed=excluded.completed,notes=excluded.notes,completed_at=excluded.completed_at,
    completed_by=excluded.completed_by,updated_at=now()
  returning * into after_record;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
  values(target_trial_id,auth.uid(),'trial_checklist.updated','sdda_trial_checklist_item',
    target_checklist||':'||target_item_key,
    case when before_record.trial_id is null then null else to_jsonb(before_record) end,to_jsonb(after_record));
end;
$checklist$;

create or replace function public.sdda_pin_workbook(
  target_trial_id uuid,
  requested_source_url text,
  requested_filename text,
  requested_sha256 text,
  mark_proofed boolean default false
)
returns void
language plpgsql
security definer
set search_path=public
as $workbook$
declare
  before_record jsonb;
  after_record jsonb;
begin
  if auth.uid() is null or not public.sdda_can_manage_trial(target_trial_id) then
    raise exception 'You cannot manage the workbook for this trial.';
  end if;
  if requested_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Invalid workbook checksum.'; end if;
  select jsonb_build_object('source_url',workbook_source_url,'filename',workbook_filename,'sha256',workbook_sha256,
    'pinned_at',workbook_pinned_at,'proofed_at',workbook_proofed_at) into before_record
    from public.sdda_trials where id=target_trial_id;
  update public.sdda_trials set
    workbook_source_url=requested_source_url,workbook_filename=requested_filename,
    workbook_sha256=requested_sha256,workbook_pinned_at=now(),
    workbook_proofed_at=case when mark_proofed then now() else null end,
    workbook_proofed_by=case when mark_proofed then auth.uid() else null end,
    updated_at=now()
  where id=target_trial_id;
  select jsonb_build_object('source_url',workbook_source_url,'filename',workbook_filename,'sha256',workbook_sha256,
    'pinned_at',workbook_pinned_at,'proofed_at',workbook_proofed_at) into after_record
    from public.sdda_trials where id=target_trial_id;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
  values(target_trial_id,auth.uid(),case when mark_proofed then 'workbook.proofed' else 'workbook.pinned' end,
    'sdda_workbook',target_trial_id::text,before_record,after_record);
end;
$workbook$;

revoke all on function public.sdda_set_checklist_item(uuid,text,text,boolean,text) from public,anon;
revoke all on function public.sdda_pin_workbook(uuid,text,text,text,boolean) from public,anon;
grant execute on function public.sdda_set_checklist_item(uuid,text,text,boolean,text) to authenticated;
grant execute on function public.sdda_pin_workbook(uuid,text,text,text,boolean) to authenticated;

