import type { SupabaseClient } from '@supabase/supabase-js';

export const SDDA_FINANCIAL_TYPES = [
  'entry_fee', 'payment', 'refund', 'expense', 'judge', 'volunteer', 'adjustment',
] as const;
export type SddaFinancialType = (typeof SDDA_FINANCIAL_TYPES)[number];

export async function listSddaFinancialTransactions(client: SupabaseClient, trialId: string) {
  const { data, error } = await client
    .from('sdda_financial_transactions')
    .select('id,trial_id,entry_id,transaction_type,amount_cents,payment_method,reference,notes,occurred_on,created_at,sdda_entries(handler_name,sdda_dogs(call_name))')
    .eq('trial_id', trialId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function recordSddaFinancialTransaction(client: SupabaseClient, input: {
  trialId: string; entryId?: string; type: SddaFinancialType; amountCents: number;
  paymentMethod?: string; reference?: string; notes?: string; occurredOn: string;
}) {
  const { error } = await client.rpc('sdda_record_financial_transaction', {
    target_trial_id: input.trialId,
    target_entry_id: input.entryId || null,
    requested_type: input.type,
    requested_amount_cents: input.amountCents,
    requested_payment_method: input.paymentMethod || '',
    requested_reference: input.reference || '',
    requested_notes: input.notes || '',
    requested_occurred_on: input.occurredOn,
  });
  if (error) throw new Error(error.message);
}

export async function deleteSddaFinancialTransaction(client: SupabaseClient, transactionId: string) {
  const { error } = await client.rpc('sdda_delete_financial_transaction', { target_transaction_id: transactionId });
  if (error) throw new Error(error.message);
}

export async function listSddaAuditRecords(client: SupabaseClient, trialId: string) {
  const { data, error } = await client
    .from('sdda_audit_records')
    .select('id,actor_id,action,entity_type,entity_id,before_state,after_state,created_at,sdda_profiles(display_name,email)')
    .eq('trial_id', trialId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}
