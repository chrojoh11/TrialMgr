-- SDDA only. Preserves existing ledger rows and introduces audited credits/waivers.
begin;

-- Writes go through audited RPCs so raw table writes cannot bypass refund limits.
-- Keep the existing finance-only SELECT policy and all RLS protections enabled.
drop policy if exists sdda_financial_write on public.sdda_financial_transactions;

alter table public.sdda_financial_transactions
  drop constraint if exists sdda_financial_transactions_transaction_type_check;
alter table public.sdda_financial_transactions
  add constraint sdda_financial_transactions_transaction_type_check
  check(transaction_type in ('entry_fee','payment','refund','expense','judge','volunteer','adjustment','waiver','waiver_restore','sdda_fee'));
alter table public.sdda_financial_transactions
  add column if not exists payee text,
  add column if not exists reverses_id uuid references public.sdda_financial_transactions(id);
create unique index if not exists sdda_financial_single_reversal
  on public.sdda_financial_transactions(reverses_id) where reverses_id is not null;

-- Same accepted-entry pricing as financialSummary.ts. Not publicly callable.
create or replace function public.sdda_entry_charge_cents(target_entry_id uuid)
returns bigint language sql stable security definer set search_path=public
as $charges$
  select case when e.confirmation_status <> 'accepted' then 0 else
    coalesce((select sum(case when grouped.level='Elite' then t.elite_fee_cents
      when grouped.n=3 and t.scent_three_component_fee_cents>0 then t.scent_three_component_fee_cents
      else grouped.n*t.scent_component_fee_cents end)
      from (select r.trial_day_id,r.level,count(*) n from public.sdda_runs r
        where r.entry_id=e.id group by r.trial_day_id,r.level) grouped),0)
    +coalesce((select sum(case when r.entry_type='FEO' then o.feo_fee_cents else o.entry_fee_cents end)
      from public.sdda_game_runs r join public.sdda_game_offerings o on o.id=r.offering_id
      where r.entry_id=e.id),0) end
  from public.sdda_entries e join public.sdda_trials t on t.id=e.trial_id where e.id=target_entry_id;
$charges$;
revoke all on function public.sdda_entry_charge_cents(uuid) from public,anon,authenticated;

create or replace function public.sdda_save_financial_transaction_v2(
  target_trial_id uuid,target_entry_id uuid,requested_type text,requested_amount_cents integer,
  requested_payment_method text,requested_reference text,requested_notes text,requested_occurred_on date,
  target_transaction_id uuid default null,requested_payee text default null,requested_reverses_id uuid default null
)
returns uuid language plpgsql security definer set search_path=public set row_security=off
as $save_finance$
declare
  previous public.sdda_financial_transactions%rowtype;
  original public.sdda_financial_transactions%rowtype;
  saved_id uuid;
  net_paid bigint;
  balance_due bigint;
  trial_status text;
begin
  if not public.sdda_can_manage_finances(target_trial_id) then raise exception 'Financial access required'; end if;
  -- All financial writes take the same trial lock, including edits and deletions.
  select status into trial_status from public.sdda_trials where id=target_trial_id for update;
  if not found then raise exception 'Trial not found'; end if;
  if trial_status='completed' then raise exception 'Reopen this trial before changing finances'; end if;
  if target_transaction_id is not null then
    select * into previous from public.sdda_financial_transactions
      where id=target_transaction_id and trial_id=target_trial_id for update;
    if not found then raise exception 'Transaction not found'; end if;
    if previous.transaction_type in ('waiver','waiver_restore') then raise exception 'Use Restore fees; waiver history cannot be edited'; end if;
    if previous.entry_id is distinct from target_entry_id or previous.transaction_type<>requested_type
      then raise exception 'An edit cannot change transaction type or entry'; end if;
  end if;
  if requested_type not in ('payment','refund','expense','judge','volunteer','adjustment','waiver','waiver_restore','sdda_fee','entry_fee')
    then raise exception 'Invalid transaction type'; end if;
  if requested_type='entry_fee' and target_transaction_id is null
    then raise exception 'Entry fees are automatic. Use an additional charge adjustment only when needed'; end if;
  if requested_amount_cents is null or requested_amount_cents=0
    or (requested_type<>'adjustment' and requested_amount_cents<0)
    then raise exception 'Enter a positive amount (only adjustments may be negative)'; end if;
  if requested_type in ('entry_fee','payment','refund','adjustment','waiver','waiver_restore') then
    if target_entry_id is null or not exists(select 1 from public.sdda_entries where id=target_entry_id and trial_id=target_trial_id)
      then raise exception 'Choose an entry belonging to this trial'; end if;
  elsif target_entry_id is not null then raise exception 'Expenses must not be assigned to an entry'; end if;
  if requested_type in ('adjustment','waiver','waiver_restore') and nullif(trim(requested_notes),'') is null
    then raise exception 'A reason is required'; end if;
  if requested_reverses_id is not null and requested_type<>'waiver_restore' then raise exception 'Only a waiver restoration may reverse a waiver'; end if;
  if requested_type='waiver_restore' then
    select * into original from public.sdda_financial_transactions
      where id=requested_reverses_id and trial_id=target_trial_id and entry_id=target_entry_id and transaction_type='waiver';
    if not found or original.amount_cents<>requested_amount_cents then raise exception 'Select the original waiver to restore'; end if;
    if exists(select 1 from public.sdda_financial_transactions where reverses_id=original.id)
      then raise exception 'This waiver has already been restored'; end if;
  end if;
  if target_entry_id is not null then
    select coalesce(sum(case when transaction_type='payment' then amount_cents when transaction_type='refund' then -amount_cents else 0 end),0)
      into net_paid from public.sdda_financial_transactions
      where entry_id=target_entry_id and id is distinct from target_transaction_id;
    if requested_type='payment' then net_paid:=net_paid+requested_amount_cents; end if;
    if requested_type='refund' then net_paid:=net_paid-requested_amount_cents; end if;
    if requested_type in ('payment','refund') and net_paid<0 then raise exception 'Refund cannot exceed net payments recorded for this entry'; end if;
    if requested_type='waiver' then
      select public.sdda_entry_charge_cents(target_entry_id)+coalesce(sum(case
        when transaction_type in ('entry_fee','adjustment','refund','waiver_restore') then amount_cents
        when transaction_type in ('payment','waiver') then -amount_cents else 0 end),0)
        into balance_due from public.sdda_financial_transactions where entry_id=target_entry_id;
      if requested_amount_cents>balance_due then raise exception 'Waiver cannot exceed the outstanding balance. Payments are retained; use Refund to return money'; end if;
    end if;
  end if;
  if target_transaction_id is null then
    insert into public.sdda_financial_transactions(trial_id,entry_id,transaction_type,amount_cents,payment_method,reference,notes,occurred_on,created_by,payee,reverses_id)
    values(target_trial_id,target_entry_id,requested_type,requested_amount_cents,nullif(trim(requested_payment_method),''),nullif(trim(requested_reference),''),
      nullif(trim(requested_notes),''),coalesce(requested_occurred_on,current_date),auth.uid(),nullif(trim(requested_payee),''),requested_reverses_id)
    returning id into saved_id;
  else
    update public.sdda_financial_transactions set amount_cents=requested_amount_cents,payment_method=nullif(trim(requested_payment_method),''),
      reference=nullif(trim(requested_reference),''),notes=nullif(trim(requested_notes),''),occurred_on=coalesce(requested_occurred_on,current_date),payee=nullif(trim(requested_payee),'')
    where id=target_transaction_id returning id into saved_id;
  end if;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state,after_state)
    select target_trial_id,auth.uid(),case when target_transaction_id is null then 'financial.transaction_recorded' else 'financial.transaction_updated' end,
      'sdda_financial_transaction',saved_id::text,case when target_transaction_id is not null then to_jsonb(previous) end,
      to_jsonb(f)||jsonb_build_object('handler_name',e.handler_name,'dog_call_name',d.call_name)
    from public.sdda_financial_transactions f left join public.sdda_entries e on e.id=f.entry_id
    left join public.sdda_dogs d on d.id=e.dog_id where f.id=saved_id;
  return saved_id;
end;
$save_finance$;

-- Older clients also receive the refund/charge safeguards.
create or replace function public.sdda_record_financial_transaction(
  target_trial_id uuid,target_entry_id uuid,requested_type text,requested_amount_cents integer,
  requested_payment_method text,requested_reference text,requested_notes text,requested_occurred_on date
)
returns uuid language sql security definer set search_path=public
as $compat$
  select public.sdda_save_financial_transaction_v2(target_trial_id,target_entry_id,requested_type,requested_amount_cents,
    requested_payment_method,requested_reference,requested_notes,requested_occurred_on);
$compat$;

create or replace function public.sdda_delete_financial_transaction(target_transaction_id uuid)
returns void language plpgsql security definer set search_path=public set row_security=off
as $delete_finance$
declare previous public.sdda_financial_transactions%rowtype; selected_trial uuid; remaining_paid bigint;
begin
  select trial_id into selected_trial from public.sdda_financial_transactions where id=target_transaction_id;
  if selected_trial is null or not public.sdda_can_manage_finances(selected_trial) then raise exception 'Financial access required'; end if;
  perform 1 from public.sdda_trials where id=selected_trial for update;
  if exists(select 1 from public.sdda_trials where id=selected_trial and status='completed')
    then raise exception 'Reopen this trial before changing finances'; end if;
  select * into previous from public.sdda_financial_transactions where id=target_transaction_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if previous.transaction_type in ('waiver','waiver_restore') then raise exception 'Use Restore fees; waiver history cannot be deleted'; end if;
  if previous.transaction_type='payment' then
    select coalesce(sum(case when transaction_type='payment' then amount_cents when transaction_type='refund' then -amount_cents else 0 end),0)
      into remaining_paid from public.sdda_financial_transactions where entry_id=previous.entry_id and id<>previous.id;
    if remaining_paid<0 then raise exception 'Correct the refunds before removing this payment'; end if;
  end if;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state)
    values(previous.trial_id,auth.uid(),'financial.transaction_deleted','sdda_financial_transaction',previous.id::text,to_jsonb(previous));
  delete from public.sdda_financial_transactions where id=previous.id;
end;
$delete_finance$;
revoke all on function public.sdda_save_financial_transaction_v2(uuid,uuid,text,integer,text,text,text,date,uuid,text,uuid) from public,anon;
grant execute on function public.sdda_save_financial_transaction_v2(uuid,uuid,text,integer,text,text,text,date,uuid,text,uuid) to authenticated;
-- One handler payment may be allocated across dogs; the batch commits atomically.
create or replace function public.sdda_record_payment_batch(
  target_trial_id uuid, allocations jsonb, requested_payment_method text,
  requested_reference text, requested_notes text, requested_occurred_on date
)
returns void language plpgsql security definer set search_path=public
as $batch$
declare item jsonb;
begin
  if not public.sdda_can_manage_finances(target_trial_id) then raise exception 'Financial access required'; end if;
  if jsonb_typeof(allocations) is distinct from 'array' then raise exception 'Payment allocations must be an array'; end if;
  if jsonb_array_length(allocations)=0 or jsonb_array_length(allocations)>100 then raise exception 'Choose between 1 and 100 entries'; end if;
  for item in select value from jsonb_array_elements(allocations) loop
    perform public.sdda_save_financial_transaction_v2(target_trial_id,(item->>'entryId')::uuid,'payment',(item->>'amountCents')::integer,
      requested_payment_method,requested_reference,requested_notes,requested_occurred_on);
  end loop;
end;
$batch$;
revoke all on function public.sdda_record_payment_batch(uuid,jsonb,text,text,text,date) from public,anon;
grant execute on function public.sdda_record_payment_batch(uuid,jsonb,text,text,text,date) to authenticated;
commit;
