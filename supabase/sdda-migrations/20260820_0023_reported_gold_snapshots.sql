begin;

alter table public.sdda_entries
  add column if not exists reported_advanced_gold_count integer not null default 0 check (reported_advanced_gold_count between 0 and 999),
  add column if not exists reported_excellent_gold_count integer not null default 0 check (reported_excellent_gold_count between 0 and 999),
  add column if not exists reported_elite_gold_count integer not null default 0 check (reported_elite_gold_count between 0 and 999),
  add column if not exists reported_gold_acknowledged boolean not null default false,
  add column if not exists reported_gold_declared_at timestamptz;

comment on column public.sdda_entries.reported_gold_declared_at is
  'Dated entry snapshot of competitor-reported Gold counts; not SDDA verification.';

create or replace function public.sdda_entry_edit_payload(target_entry_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public
set row_security=off
as $payload$
  select jsonb_build_object(
    'entry_id',e.id,'trial_id',e.trial_id,'confirmation_code',e.confirmation_code,
    'confirmation_status',e.confirmation_status,'handler_name',e.handler_name,
    'handler_email',e.handler_email,'handler_phone',e.handler_phone,
    'handler_address',e.handler_address,'participant_number',e.participant_number,
    'formal_alerts',e.formal_alerts,'reactivity',e.reactivity,
    'title_watch_note',e.title_watch_note,
    'reported_advanced_gold_count',e.reported_advanced_gold_count,
    'reported_excellent_gold_count',e.reported_excellent_gold_count,
    'reported_elite_gold_count',e.reported_elite_gold_count,
    'reported_gold_acknowledged',e.reported_gold_acknowledged,
    'reported_gold_declared_at',e.reported_gold_declared_at,
    'dog_call_name',d.call_name,'dog_registered_name',d.registered_name,
    'dog_registration_number',d.sdda_registration_number,
    'registration_pending',d.registration_pending,'breed',d.breed,
    'runs',coalesce((select jsonb_agg(jsonb_build_object(
      'offering_id',o.id,'run_group',r.run_group
    ) order by td.day_number,o.level,o.component)
      from public.sdda_runs r
      join public.sdda_trial_offerings o on o.trial_id=r.trial_id
        and o.trial_day_id=r.trial_day_id and o.level=r.level
        and o.component=r.component and o.stream=r.stream
      join public.sdda_trial_days td on td.id=r.trial_day_id
      where r.entry_id=e.id),'[]'::jsonb),
    'game_runs',coalesce((select jsonb_agg(jsonb_build_object(
      'offering_id',gr.offering_id,'entry_type',gr.entry_type,
      'team_partner_name',gr.requested_team_partner,'aerial_division',gr.aerial_division
    ) order by td.day_number,g.game_type)
      from public.sdda_game_runs gr
      join public.sdda_game_offerings g on g.id=gr.offering_id
      join public.sdda_trial_days td on td.id=gr.trial_day_id
      where gr.entry_id=e.id),'[]'::jsonb)
  )
  from public.sdda_entries e join public.sdda_dogs d on d.id=e.dog_id
  where e.id=target_entry_id;
$payload$;

create or replace function public.sdda_set_reported_gold_snapshot(
  target_entry_id uuid,
  entry_code text,
  receipt_token text,
  advanced_count integer,
  excellent_count integer,
  elite_count integer,
  acknowledged boolean
)
returns void
language plpgsql
security definer
set search_path=public,extensions
set row_security=off
as $gold$
declare
  selected_entry public.sdda_entries%rowtype;
  before_state jsonb;
begin
  if coalesce(advanced_count,0) not between 0 and 999
    or coalesce(excellent_count,0) not between 0 and 999
    or coalesce(elite_count,0) not between 0 and 999 then
    raise exception 'Gold counts must be whole numbers from 0 through 999';
  end if;
  if (coalesce(advanced_count,0)+coalesce(excellent_count,0)+coalesce(elite_count,0))>0
    and coalesce(acknowledged,false) is not true then
    raise exception 'Reported Gold counts require competitor acknowledgement';
  end if;

  if target_entry_id is not null then
    select * into selected_entry from public.sdda_entries where id=target_entry_id for update;
    if selected_entry.id is null or auth.uid() is null or not public.sdda_can_manage_trial(selected_entry.trial_id) then
      raise exception 'Trial management permission required';
    end if;
  else
    select * into selected_entry from public.sdda_entries
      where confirmation_code=entry_code
        and receipt_token_hash=encode(extensions.digest(receipt_token,'sha256'),'hex')
      for update;
    if selected_entry.id is null then raise exception 'Entry credentials are invalid'; end if;
    if selected_entry.confirmation_status<>'received'
      or not exists(select 1 from public.sdda_trials t where t.id=selected_entry.trial_id and t.status='entries_open') then
      raise exception 'This entry can no longer be edited';
    end if;
  end if;

  before_state:=jsonb_build_object(
    'advanced',selected_entry.reported_advanced_gold_count,
    'excellent',selected_entry.reported_excellent_gold_count,
    'elite',selected_entry.reported_elite_gold_count,
    'acknowledged',selected_entry.reported_gold_acknowledged,
    'declared_at',selected_entry.reported_gold_declared_at);

  update public.sdda_entries set
    reported_advanced_gold_count=coalesce(advanced_count,0),
    reported_excellent_gold_count=coalesce(excellent_count,0),
    reported_elite_gold_count=coalesce(elite_count,0),
    reported_gold_acknowledged=coalesce(acknowledged,false),
    reported_gold_declared_at=case when coalesce(acknowledged,false) then now() else null end,
    updated_at=now()
    where id=selected_entry.id;

  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
  values(selected_entry.trial_id,auth.uid(),'entry.reported_gold_snapshot','sdda_entry',selected_entry.id::text,before_state,
    jsonb_build_object('advanced',coalesce(advanced_count,0),'excellent',coalesce(excellent_count,0),
      'elite',coalesce(elite_count,0),'acknowledged',coalesce(acknowledged,false),'declared_at',now(),
      'verification_status','competitor_reported'));
end;
$gold$;

revoke all on function public.sdda_set_reported_gold_snapshot(uuid,text,text,integer,integer,integer,boolean) from public;
grant execute on function public.sdda_set_reported_gold_snapshot(uuid,text,text,integer,integer,integer,boolean) to anon,authenticated;

commit;
