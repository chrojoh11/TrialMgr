import type { SupabaseClient } from '@supabase/supabase-js';
import { validateSddaTrialSetup, type SddaTrialSetupInput, type SddaTrialStatus } from './trialSetup';
import { offeringKey, parseOfferingKey, type SddaLevel, type SddaComponent, type SddaStream } from './offerings';
import type { SddaCsvEntry } from './entryCsv';

export interface SddaTrialSummary {
  id: string;
  name: string;
  host_club: string;
  venue: string | null;
  status: SddaTrialStatus;
  created_at: string;
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

export interface SddaTrialWorkspace extends SddaTrialSummary {
  timezone: string;
  sdda_trial_days: Array<{
    id: string;
    day_number: number;
    trial_date: string;
    sdda_trial_number: string | null;
    judge_name: string | null;
  }>;
  sdda_trial_offerings: SddaTrialOffering[];
}

export async function listSddaTrials(client: SupabaseClient): Promise<SddaTrialSummary[]> {
  const { data, error } = await client
    .from('sdda_trials')
    .select('id,name,host_club,venue,status,created_at,sdda_trial_days(day_number,trial_date)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as SddaTrialSummary[];
}

export async function createSddaTrial(client: SupabaseClient, input: SddaTrialSetupInput) {
  const setup = validateSddaTrialSetup(input);
  const { data, error } = await client.rpc('sdda_create_trial', {
    trial_name: setup.name,
    trial_host_club: setup.hostClub,
    trial_venue: setup.venue || '',
    trial_dates: setup.dates,
  });
  if (error || !data) throw new Error(error?.message || 'Unable to create the SDDA trial.');
  return data as string;
}

export async function deleteSddaDraftTrial(client: SupabaseClient, trialId: string) {
  const { error } = await client.rpc('sdda_delete_draft_trial', {
    target_trial_id: trialId,
  });
  if (error) throw new Error(error.message);
}

export async function getSddaTrialWorkspace(client: SupabaseClient, trialId: string) {
  const { data, error } = await client
    .from('sdda_trials')
    .select('id,name,host_club,venue,timezone,status,created_at,sdda_trial_days(id,day_number,trial_date,sdda_trial_number,judge_name),sdda_trial_offerings(id,trial_day_id,level,component,stream,judge_name,capacity)')
    .eq('id', trialId)
    .single();
  if (error || !data) throw new Error(error?.message || 'SDDA trial not found.');
  return data as SddaTrialWorkspace;
}

export async function saveSddaTrialOfferings(
  client: SupabaseClient,
  trialId: string,
  current: SddaTrialOffering[],
  selectedKeys: Set<string>,
) {
  const currentKeys = new Map(current.map((offering) => [offeringKey({
    trialDayId: offering.trial_day_id,
    level: offering.level,
    component: offering.component,
    stream: offering.stream,
  }), offering]));
  const removeIds = [...currentKeys].filter(([key]) => !selectedKeys.has(key)).map(([, value]) => value.id);
  const additions = [...selectedKeys].filter((key) => !currentKeys.has(key)).map(parseOfferingKey);

  if (removeIds.length) {
    const { error } = await client.from('sdda_trial_offerings').delete().eq('trial_id', trialId).in('id', removeIds);
    if (error) throw new Error(error.message);
  }
  if (additions.length) {
    const { error } = await client.from('sdda_trial_offerings').insert(additions.map((item) => ({
      trial_id: trialId,
      trial_day_id: item.trialDayId,
      level: item.level,
      component: item.component,
      stream: item.stream,
    })));
    if (error) throw new Error(error.message);
  }
}

export async function listSddaEntries(client: SupabaseClient, trialId: string) {
  const { data, error } = await client.from('sdda_entries')
    .select('id,handler_name,handler_email,handler_phone,stream,formal_alerts,entry_status,source,created_at,sdda_dogs(id,call_name,registered_name,sdda_registration_number,registration_pending,breed),sdda_runs(id,trial_day_id,level,component,stream,run_group,running_position)')
    .eq('trial_id', trialId).order('created_at');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function importSddaCsvEntries(client: SupabaseClient, trial: SddaTrialWorkspace, entries: SddaCsvEntry[]) {
  const results = { imported: 0, errors: [] as string[] };
  for (const entry of entries) {
    const day = trial.sdda_trial_days.find((candidate) => candidate.day_number === entry.trialDay);
    if (!day) { results.errors.push(`Row ${entry.rowNumber}: trial day ${entry.trialDay} does not exist.`); continue; }
    const { error } = await client.rpc('sdda_import_entry', {
      target_trial_id: trial.id, target_trial_day_id: day.id,
      dog_call_name: entry.dogCallName, dog_registered_name: entry.dogRegisteredName,
      dog_registration_number: entry.registrationNumber, dog_registration_pending: entry.registrationPending,
      dog_breed: entry.breed, entry_handler_name: entry.handlerName, entry_handler_email: entry.handlerEmail,
      entry_handler_phone: entry.handlerPhone, entry_stream: entry.stream, entry_level: entry.level,
      entry_components: entry.components, import_source: 'google_form', import_source_row: String(entry.rowNumber), entry_formal_alerts: entry.formalAlerts,
    });
    if (error) results.errors.push(`Row ${entry.rowNumber}: ${error.message}`); else results.imported++;
  }
  return results;
}

export async function listSddaRunningOrderRuns(client: SupabaseClient, trialId: string) {
  const { data, error } = await client.from('sdda_runs')
    .select('id,trial_day_id,level,component,stream,run_group,running_position,created_at,sdda_trial_days(day_number,trial_date),sdda_entries(id,handler_name,dog_id,formal_alerts,sdda_dogs(call_name,registered_name,breed,sdda_registration_number))')
    .eq('trial_id', trialId).order('created_at');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function saveSddaRunningOrder(client: SupabaseClient, input: {
  trialId: string; trialDayId: string; level: SddaLevel; component: SddaComponent; runIds: string[];
}) {
  const { error } = await client.rpc('sdda_save_running_order', {
    target_trial_id: input.trialId, target_trial_day_id: input.trialDayId,
    target_level: input.level, target_component: input.component, ordered_run_ids: input.runIds,
  });
  if (error) throw new Error(error.message);
}
