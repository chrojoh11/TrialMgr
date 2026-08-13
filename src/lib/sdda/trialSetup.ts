export const SDDA_TRIAL_STATUSES = [
  'draft',
  'entries_open',
  'entries_closed',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export type SddaTrialStatus = (typeof SDDA_TRIAL_STATUSES)[number];

export interface SddaTrialSetupInput {
  name: string;
  hostClub: string;
  venue?: string;
  dates: string[];
}

export function validateSddaTrialSetup(input: SddaTrialSetupInput) {
  const name = input.name.trim();
  const hostClub = input.hostClub.trim();
  const venue = input.venue?.trim() || null;
  const dates = [...new Set(input.dates.filter(Boolean))].sort();

  if (name.length < 3 || name.length > 120) {
    throw new Error('Trial name must be between 3 and 120 characters.');
  }
  if (hostClub.length < 2 || hostClub.length > 120) {
    throw new Error('Host club must be between 2 and 120 characters.');
  }
  if (dates.length < 1 || dates.length > 4) {
    throw new Error('An SDDA trial must have between one and four unique trial days.');
  }
  if (dates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    throw new Error('Every trial day must be a valid calendar date.');
  }

  return { name, hostClub, venue, dates };
}

export function formatSddaTrialStatus(status: SddaTrialStatus) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
