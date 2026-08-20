begin;

create or replace function public.sdda_record_financial_transaction(
  target_trial_id uuid,
  target_entry_id uuid,
  requested_type text,
  requested_amount_cents integer,
  requested_payment_method text,
  requested_reference text,
  requested_notes text,
  requested_occurred_on date
)
returns uuid
language plpgsql
security definer
set search_path=public
set row_security=off
as $financial_insert$
declare transaction_id uuid;
begin
  if not public.sdda_can_manage_finances(target_trial_id) then raise exception 'Financial access required'; end if;
  if requested_type not in ('entry_fee','payment','refund','expense','judge','volunteer','adjustment')
    then raise exception 'Invalid transaction type'; end if;
  if requested_amount_cents is null or requested_amount_cents<=0 then raise exception 'Amount must be greater than zero'; end if;
  if target_entry_id is not null and not exists(select 1 from public.sdda_entries e where e.id=target_entry_id and e.trial_id=target_trial_id)
    then raise exception 'Entry does not belong to this trial'; end if;
  if requested_type in ('entry_fee','payment','refund','adjustment') and target_entry_id is null
    then raise exception 'This transaction type requires an entry'; end if;

  insert into public.sdda_financial_transactions(
    trial_id,entry_id,transaction_type,amount_cents,payment_method,reference,notes,occurred_on,created_by
  ) values(
    target_trial_id,target_entry_id,requested_type,requested_amount_cents,
    nullif(trim(requested_payment_method),''),nullif(trim(requested_reference),''),
    nullif(trim(requested_notes),''),coalesce(requested_occurred_on,current_date),auth.uid()
  ) returning id into transaction_id;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,after_state)
    select target_trial_id,auth.uid(),'financial.transaction_recorded','sdda_financial_transaction',transaction_id::text,
      to_jsonb(f) from public.sdda_financial_transactions f where f.id=transaction_id;
  return transaction_id;
end;
$financial_insert$;

create or replace function public.sdda_delete_financial_transaction(target_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path=public
set row_security=off
as $financial_delete$
declare transaction_record public.sdda_financial_transactions%rowtype;
begin
  select * into transaction_record from public.sdda_financial_transactions where id=target_transaction_id for update;
  if transaction_record.id is null or not public.sdda_can_manage_finances(transaction_record.trial_id)
    then raise exception 'Financial transaction not found or access denied'; end if;
  insert into public.sdda_audit_records(trial_id,actor_id,action,entity_type,entity_id,before_state)
    values(transaction_record.trial_id,auth.uid(),'financial.transaction_deleted','sdda_financial_transaction',
      target_transaction_id::text,to_jsonb(transaction_record));
  delete from public.sdda_financial_transactions where id=target_transaction_id;
end;
$financial_delete$;

revoke all on function public.sdda_record_financial_transaction(uuid,uuid,text,integer,text,text,text,date) from public,anon;
revoke all on function public.sdda_delete_financial_transaction(uuid) from public,anon;
grant execute on function public.sdda_record_financial_transaction(uuid,uuid,text,integer,text,text,text,date) to authenticated;
grant execute on function public.sdda_delete_financial_transaction(uuid) to authenticated;

commit;
