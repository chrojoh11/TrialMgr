import type { SupabaseClient } from '@supabase/supabase-js';
import {
  validateSddaTrialSetup,
  type SddaTrialSetupInput,
  type SddaTrialStatus,
  type SddaTrialFormat,
} from './trialSetup';
import {
  offeringKey,
  parseOfferingKey,
  type SddaLevel,
  type SddaComponent,
  type SddaStream,
} from './offerings';
import type { SddaCsvEntry } from './entryCsv';
import type { SddaRunGroup } from './domain';

export interface SddaTrialSummary {
  id: string;
  name: string;
  host_club: string;
  venue: string | null;
  status: SddaTrialStatus;
  created_at: string;
  trial_format: SddaTrialFormat;
  sdda_trial_days: Array<{ day_number: number; trial_date: string }>;
}

export interface SddaTrialOffering {
  id: string;
  trial_day_id: string;
  level: SddaLevel;
  component: SddaComponent;
  stream: SddaStream;
  judge_name: string | null;
  capacity: number | null;
}

export const SDDA_GAME_TYPES = ['Aerial', 'Distance', 'Speed', 'Team'] as const;
export type SddaGameType = (typeof SDDA_GAME_TYPES)[number];

export interface SddaGameOffering {
  id: string;
  trial_day_id: string;
  game_type: SddaGameType;
  judge_name: string | null;
  capacity: number | null;
  entry_fee_cents: number;
  feo_fee_cents: number;
}

export interface SddaTrialWorkspace extends SddaTrialSummary {
  timezone: string;
  scent_component_fee_cents: number;
  scent_three_component_fee_cents: number;
  elite_fee_cents: number;
  secretary_name: string | null;
  secretary_email: string | null;
  secretary_phone: string | null;
  payment_instructions: string | null;
  cancellation_policy: string | null;
  sdda_trial_days: Array<{
    id: string;
    day_number: number;
    trial_date: string;
    sdda_trial_number: string | null;
    judge_name: string | null;
  }>;
  sdda_trial_offerings: SddaTrialOffering[];
  sdda_game_offerings: SddaGameOffering[];
}

export async function listSddaTrials(client: SupabaseClient): Promise<SddaTrialSummary[]> {
  const { data, error } = await client
    .from('sdda_trials')
    .select(
      'id,name,host_club,venue,status,created_at,trial_format,sdda_trial_days(day_number,trial_date)'
    )
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as SddaTrialSummary[];
}

export async function createSddaTrial(client: SupabaseClient, input: SddaTrialSetupInput) {
  const setup = validateSddaTrialSetup(input);
  const request = {
    trial_name: setup.name,
    trial_host_club: setup.hostClub,
    trial_venue: setup.venue || '',
    trial_dates: setup.dates,
  };
  const { data, error } = await client.rpc('sdda_create_trial', {
    ...request,
    requested_trial_format: setup.trialFormat,
  });
  if (
    error &&
    setup.trialFormat === 'scent' &&
    /function|schema cache|requested_trial_format/i.test(error.message)
  ) {
    const legacy = await client.rpc('sdda_create_trial', request);
    if (legacy.error || !legacy.data) {
      throw new Error(legacy.error?.message || 'Unable to create the SDDA trial.');
    }
    return legacy.data as string;
  }
  if (
    error &&
    setup.trialFormat !== 'scent' &&
    /function|schema cache|requested_trial_format/i.test(error.message)
  ) {
    throw new Error(
      'Games support is ready in the application, but SDDA database migration 0018 must be applied before creating a Games or Combined trial.'
    );
  }
  if (error || !data) throw new Error(error?.message || 'Unable to create the SDDA trial.');
  return data as string;
}

export async function deleteSddaDraftTrial(client: SupabaseClient, trialId: string) {
  const { error } = await client.rpc('sdda_delete_draft_trial', {
    target_trial_id: trialId,
  });
  if (error) throw new Error(error.message);
}

export async function setSddaTrialEntryStatus(
  client: SupabaseClient,
  trialId: string,
  status: 'entries_open' | 'entries_closed'
) {
  const { data: before, error: readError } = await client
    .from('sdda_trials')
    .select('status')
    .eq('id', trialId)
    .single();
  if (readError) throw new Error(readError.message);
  const { error } = await client.from('sdda_trials').update({ status }).eq('id', trialId);
  if (error) throw new Error(error.message);
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user)
    throw new Error(authError?.message || 'Signed-in user required.');
  const { error: auditError } = await client.from('sdda_audit_records').insert({
    trial_id: trialId,
    actor_id: authData.user.id,
    action: status === 'entries_open' ? 'trial.entries_opened' : 'trial.entries_closed',
    entity_type: 'sdda_trial',
    entity_id: trialId,
    before_state: { status: before.status },
    after_state: { status },
  });
  if (auditError)
    throw new Error(`Entry status changed, but audit recording failed: ${auditError.message}`);
}

export async function getSddaTrialWorkspace(client: SupabaseClient, trialId: string) {
  const { data, error } = await client
    .from('sdda_trials')
    .select(
      'id,name,host_club,venue,timezone,status,created_at,trial_format,scent_component_fee_cents,scent_three_component_fee_cents,elite_fee_cents,secretary_name,secretary_email,secretary_phone,payment_instructions,cancellation_policy,sdda_trial_days(id,day_number,trial_date,sdda_trial_number,judge_name),sdda_trial_offerings(id,trial_day_id,level,component,stream,judge_name,capacity),sdda_game_offerings(id,trial_day_id,game_type,judge_name,capacity,entry_fee_cents,feo_fee_cents)'
    )
    .eq('id', trialId)
    .single();
  if (error || !data) throw new Error(error?.message || 'SDDA trial not found.');
  return data as SddaTrialWorkspace;
}

export async function saveSddaTrialPricing(
  client: SupabaseClient,
  trialId: string,
  pricing: { componentFeeCents: number; threeComponentFeeCents: number; eliteFeeCents: number },
) {
  const { error } = await client.rpc('sdda_set_trial_pricing', {
    target_trial_id: trialId,
    requested_component_fee_cents: pricing.componentFeeCents,
    requested_three_component_fee_cents: pricing.threeComponentFeeCents,
    requested_elite_fee_cents: pricing.eliteFeeCents,
  });
  if (error) throw new Error(error.message);
}

export async function saveSddaTrialDayDetails(
  client: SupabaseClient,
  trialDayId: string,
  details: { trialNumber: string; judgeName: string },
) {
  const { error } = await client.rpc('sdda_update_trial_day_details', {
    target_trial_day_id: trialDayId,
    requested_trial_number: details.trialNumber,
    requested_judge_name: details.judgeName,
  });
  if (error) throw new Error(error.message);
}

export async function saveSddaTrialPublicDetails(
  client: SupabaseClient,
  trialId: string,
  details: { secretaryName: string; secretaryEmail: string; secretaryPhone: string; paymentInstructions: string; cancellationPolicy: string },
) {
  const { error } = await client.rpc('sdda_update_trial_public_details', {
    target_trial_id: trialId,
    requested_secretary_name: details.secretaryName,
    requested_secretary_email: details.secretaryEmail,
    requested_secretary_phone: details.secretaryPhone,
    requested_payment_instructions: details.paymentInstructions,
    requested_cancellation_policy: details.cancellationPolicy,
  });
  if (error) throw new Error(error.message);
}

export function gameOfferingKey(trialDayId: string, gameType: SddaGameType) {
  return `${trialDayId}|${gameType}`;
}

export async function saveSddaGameOfferings(
  client: SupabaseClient,
  trialId: string,
  current: SddaGameOffering[],
  selectedKeys: Set<string>,
  configuration: Record<
    string,
    Pick<SddaGameOffering, 'judge_name' | 'capacity' | 'entry_fee_cents' | 'feo_fee_cents'>
  >
) {
  const currentKeys = new Map(
    current.map((offering) => [
      gameOfferingKey(offering.trial_day_id, offering.game_type),
      offering,
    ])
  );
  const removeIds = [...currentKeys]
    .filter(([key]) => !selectedKeys.has(key))
    .map(([, offering]) => offering.id);
  const selected = [...selectedKeys].map((key) => {
    const separator = key.indexOf('|');
    return {
      trial_id: trialId,
      trial_day_id: key.slice(0, separator),
      game_type: key.slice(separator + 1) as SddaGameType,
      judge_name: configuration[key]?.judge_name || null,
      capacity: configuration[key]?.capacity || null,
      entry_fee_cents: configuration[key]?.entry_fee_cents || 0,
      feo_fee_cents: configuration[key]?.feo_fee_cents || 0,
      updated_at: new Date().toISOString(),
    };
  });
  if (removeIds.length) {
    const { error } = await client
      .from('sdda_game_offerings')
      .delete()
      .eq('trial_id', trialId)
      .in('id', removeIds);
    if (error) throw new Error(error.message);
  }
  if (selected.length) {
    const { error } = await client
      .from('sdda_game_offerings')
      .upsert(selected, { onConflict: 'trial_day_id,game_type' });
    if (error) throw new Error(error.message);
  }
}

export async function saveSddaTrialOfferings(
  client: SupabaseClient,
  trialId: string,
  current: SddaTrialOffering[],
  selectedKeys: Set<string>,
  configuration?: Record<string, { judge_name: string | null }>,
) {
  const currentKeys = new Map(
    current.map((offering) => [
      offeringKey({
        trialDayId: offering.trial_day_id,
        level: offering.level,
        component: offering.component,
        stream: offering.stream,
      }),
      offering,
    ])
  );
  const removeIds = [...currentKeys]
    .filter(([key]) => !selectedKeys.has(key))
    .map(([, value]) => value.id);
  const additions = [...selectedKeys].filter((key) => !currentKeys.has(key)).map(parseOfferingKey);

  if (removeIds.length) {
    const { error } = await client
      .from('sdda_trial_offerings')
      .delete()
      .eq('trial_id', trialId)
      .in('id', removeIds);
    if (error) throw new Error(error.message);
  }
  const rows = configuration ? [...selectedKeys].map(parseOfferingKey) : additions;
  if (rows.length) {
    const values = rows.map((item) => ({
        trial_id: trialId,
        trial_day_id: item.trialDayId,
        level: item.level,
        component: item.component,
        stream: item.stream,
        ...(configuration ? { judge_name: configuration[`${item.trialDayId}|${item.level}|${item.component}`]?.judge_name || null } : {}),
      }));
    const request = configuration
      ? client.from('sdda_trial_offerings').upsert(values, { onConflict: 'trial_day_id,level,component,stream' })
      : client.from('sdda_trial_offerings').insert(values);
    const { error } = await request;
    if (error) throw new Error(error.message);
  }
}

export async function listSddaEntries(client: SupabaseClient, trialId: string) {
  const { data, error } = await client
    .from('sdda_entries')
    .select(
      'id,handler_name,handler_email,handler_phone,handler_address,participant_number,stream,formal_alerts,reactivity,title_watch_note,reported_advanced_gold_count,reported_excellent_gold_count,reported_elite_gold_count,reported_gold_acknowledged,reported_gold_declared_at,entry_status,confirmation_status,confirmation_code,submitted_at,source,created_at,sdda_dogs(id,call_name,registered_name,sdda_registration_number,registration_pending,breed),sdda_runs(id,trial_day_id,level,component,stream,run_group,running_position,move_up_from_level,move_up_approved_at),sdda_game_runs(id,trial_day_id,offering_id,entry_type,requested_team_partner,aerial_division,sdda_game_offerings(game_type))'
    )
    .eq('trial_id', trialId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listSddaEntryFinancials(client: SupabaseClient, trialId: string) {
  const { data, error } = await client
    .from('sdda_financial_transactions')
    .select('entry_id,transaction_type,amount_cents')
    .eq('trial_id', trialId)
    .not('entry_id', 'is', null);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function setSddaEntryConfirmationStatus(
  client: SupabaseClient,
  entryId: string,
  status: 'received' | 'accepted' | 'waitlisted' | 'rejected',
) {
  const { error } = await client.rpc('sdda_set_entry_confirmation_status', {
    target_entry_id: entryId,
    requested_status: status,
  });
  if (error) throw new Error(error.message);
}

export async function importSddaCsvEntries(
  client: SupabaseClient,
  trial: SddaTrialWorkspace,
  entries: SddaCsvEntry[]
) {
  const results = { imported: 0, errors: [] as string[] };
  for (const entry of entries) {
    const day = trial.sdda_trial_days.find((candidate) => candidate.day_number === entry.trialDay);
    if (!day) {
      results.errors.push(`Row ${entry.rowNumber}: trial day ${entry.trialDay} does not exist.`);
      continue;
    }
    const { error } = await client.rpc('sdda_import_entry', {
      target_trial_id: trial.id,
      target_trial_day_id: day.id,
      dog_call_name: entry.dogCallName,
      dog_registered_name: entry.dogRegisteredName,
      dog_registration_number: entry.registrationNumber,
      dog_registration_pending: entry.registrationPending,
      dog_breed: entry.breed,
      entry_handler_name: entry.handlerName,
      entry_handler_email: entry.handlerEmail,
      entry_handler_phone: entry.handlerPhone,
      entry_stream: entry.stream,
      entry_level: entry.level,
      entry_components: entry.components,
      import_source: 'google_form',
      import_source_row: String(entry.rowNumber),
      entry_formal_alerts: entry.formalAlerts,
    });
    if (error) results.errors.push(`Row ${entry.rowNumber}: ${error.message}`);
    else results.imported++;
  }
  return results;
}

export async function listSddaRunningOrderRuns(client: SupabaseClient, trialId: string) {
  const { data, error } = await client
    .from('sdda_runs')
    .select(
      'id,trial_day_id,level,component,stream,run_group,running_position,move_up_from_run_id,move_up_from_level,move_up_approved_at,created_at,sdda_trial_days(day_number,trial_date),sdda_entries!inner(id,handler_name,dog_id,reactivity,confirmation_status,sdda_dogs(call_name,registered_name,breed,sdda_registration_number))'
    )
    .eq('trial_id', trialId)
    .eq('sdda_entries.confirmation_status', 'accepted')
    .order('created_at');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listSddaGameRuns(client: SupabaseClient, trialId: string) {
  const { data, error } = await client
    .from('sdda_game_runs')
    .select(
      'id,trial_day_id,entry_type,aerial_division,running_position,requested_team_partner,created_at,sdda_game_offerings(game_type,judge_name),sdda_entries!inner(id,handler_name,dog_id,reactivity,confirmation_status,sdda_dogs(call_name,registered_name,breed,sdda_registration_number))'
    )
    .eq('trial_id', trialId)
    .eq('sdda_entries.confirmation_status', 'accepted')
    .order('created_at');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listSddaScoringRuns(client: SupabaseClient, trialId: string) {
  const { data, error } = await client
    .from('sdda_runs')
    .select('id,trial_day_id,level,component,stream,run_group,running_position,sdda_trial_days(day_number,trial_date),sdda_scores(id,result,score,time_seconds,faults,judge_notes,recorded_at,amended_at),sdda_entries!inner(id,handler_name,confirmation_status,sdda_dogs(call_name,registered_name,sdda_registration_number))')
    .eq('trial_id', trialId)
    .eq('sdda_entries.confirmation_status', 'accepted')
    .order('created_at');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listSddaGameScoringRuns(client: SupabaseClient, trialId: string) {
  const { data, error } = await client
    .from('sdda_game_runs')
    .select('id,trial_day_id,entry_type,aerial_division,running_position,sdda_game_offerings(game_type,judge_name),sdda_game_scores(id,result,time_seconds,judge_notes,recorded_at,amended_at),sdda_entries!inner(id,handler_name,confirmation_status,sdda_dogs(call_name,registered_name,sdda_registration_number)),sdda_trial_days(day_number,trial_date)')
    .eq('trial_id', trialId)
    .eq('sdda_entries.confirmation_status', 'accepted')
    .order('created_at');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function recordSddaScentScore(client: SupabaseClient, input: { runId: string; result: string; score: number | null; timeSeconds: number | null; faults: number; notes: string }) {
  const { error } = await client.rpc('sdda_record_scent_score', {
    target_run_id: input.runId, requested_result: input.result, requested_score: input.score,
    requested_time_seconds: input.timeSeconds, requested_faults: input.faults, requested_notes: input.notes,
  });
  if (error) throw new Error(error.message);
}

export async function recordSddaGameScore(client: SupabaseClient, input: { runId: string; result: string; timeSeconds: number | null; notes: string }) {
  const { error } = await client.rpc('sdda_record_game_score', {
    target_game_run_id: input.runId, requested_result: input.result,
    requested_time_seconds: input.timeSeconds, requested_notes: input.notes,
  });
  if (error) throw new Error(error.message);
}

export async function listSddaOfficialWorkbookRuns(client: SupabaseClient, trialId: string) {
  const { data, error } = await client
    .from('sdda_runs')
    .select(
      'id,trial_day_id,level,component,stream,run_group,feo,sdda_scores(result,score,time_seconds),sdda_entries!inner(id,entry_status,confirmation_status,sdda_dogs(call_name,registered_name,breed,sdda_registration_number))'
    )
    .eq('trial_id', trialId)
    .eq('sdda_entries.confirmation_status', 'accepted')
    .order('created_at');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function saveSddaRunningOrder(
  client: SupabaseClient,
  input: {
    trialId: string;
    trialDayId: string;
    level: SddaLevel;
    component: SddaComponent;
    runIds: string[];
  }
) {
  const { error } = await client.rpc('sdda_save_running_order', {
    target_trial_id: input.trialId,
    target_trial_day_id: input.trialDayId,
    target_level: input.level,
    target_component: input.component,
    ordered_run_ids: input.runIds,
  });
  if (error) throw new Error(error.message);
}

export async function setSddaRunMoveUp(client: SupabaseClient, runId: string, approve: boolean) {
  const { error } = await client.rpc('sdda_set_run_move_up', {
    target_run_id: runId,
    approve_move_up: approve,
    qualification_confirmed: approve,
    host_approved: approve,
  });
  if (error) throw new Error(error.message);
}

export async function setSddaRunGroup(
  client: SupabaseClient,
  runId: string,
  runGroup: SddaRunGroup
) {
  const { data: before, error: readError } = await client
    .from('sdda_runs')
    .select('trial_id,run_group')
    .eq('id', runId)
    .single();
  if (readError) throw new Error(readError.message);
  if (before.run_group === runGroup) return;
  const { error: updateError } = await client
    .from('sdda_runs')
    .update({ run_group: runGroup })
    .eq('id', runId);
  if (updateError) throw new Error(updateError.message);
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user)
    throw new Error(userError?.message || 'Signed-in user required.');
  const { error: auditError } = await client.from('sdda_audit_records').insert({
    trial_id: before.trial_id,
    actor_id: userData.user.id,
    action: 'run.group_changed',
    entity_type: 'sdda_run',
    entity_id: runId,
    before_state: { run_group: before.run_group },
    after_state: { run_group: runGroup },
  });
  if (auditError)
    throw new Error(`Run group changed, but audit recording failed: ${auditError.message}`);
}
