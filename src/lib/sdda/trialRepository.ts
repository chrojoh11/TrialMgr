import type { SupabaseClient } from '@supabase/supabase-js';
import { validateSddaTrialSetup, type SddaTrialSetupInput, type SddaTrialStatus } from './trialSetup';

export interface SddaTrialSummary {
  id: string;
  name: string;
  host_club: string;
  venue: string | null;
  status: SddaTrialStatus;
  created_at: string;
  sdda_trial_days: Array<{ day_number: number; trial_date: string }>;
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
