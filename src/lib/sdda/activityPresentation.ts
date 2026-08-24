const INTERNAL_FIELDS = new Set([
  'id',
  'trial_id',
  'trial_day_id',
  'entry_id',
  'dog_id',
  'offering_id',
  'run_id',
  'game_run_id',
  'team_pair_id',
  'actor_id',
  'owner_id',
  'created_by',
  'recorded_by',
  'receipt_token',
]);

const FIELD_LABELS: Record<string, string> = {
  confirmation_status: 'Entry decision',
  run_group: 'Entry type',
  entry_type: 'Entry type',
  sdda_trial_number: 'SDDA trial number',
  handler_name: 'Handler',
  dog_call_name: 'Dog',
  judge_name: 'Judge',
  formal_alerts: 'Formal alerts',
  time_seconds: 'Time (seconds)',
};

const flatten = (value: unknown, prefix = '', result: Record<string, unknown> = {}) => {
  if (Array.isArray(value)) {
    if (!value.length && prefix) result[prefix] = [];
    value.forEach((item, index) => flatten(item, `${prefix}[${index + 1}]`, result));
  } else if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length && prefix) result[prefix] = {};
    entries.forEach(([key, item]) => flatten(item, prefix ? `${prefix}.${key}` : key, result));
  } else if (prefix) result[prefix] = value;
  return result;
};

export const displayActivityValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 'Blank';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value) && !value.length) return 'None';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const isInternalField = (field: string) => {
  const leaf = field.split('.').at(-1)?.replace(/\[\d+\]$/, '') || field;
  return INTERNAL_FIELDS.has(leaf) || leaf.endsWith('_id') || leaf.endsWith('_at');
};

export const activityFieldLabel = (field: string) => {
  const cleaned = field.replace(/\[(\d+)\]/g, ' $1');
  const leaf = cleaned.split('.').at(-1) || cleaned;
  const label = FIELD_LABELS[leaf] || leaf.replaceAll('_', ' ');
  return label.replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export const secretaryActivityChanges = (before: unknown, after: unknown) => {
  const oldValues = flatten(before || {});
  const newValues = flatten(after || {});
  return [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])]
    .filter((field) => !isInternalField(field))
    .filter((field) => JSON.stringify(oldValues[field]) !== JSON.stringify(newValues[field]))
    .filter((field) => displayActivityValue(oldValues[field]) !== displayActivityValue(newValues[field]))
    .map((field) => ({ field, before: oldValues[field], after: newValues[field] }));
};

type ActivityRecord = { id: string; action: string; created_at: string };
const INITIAL_SETUP_ACTIONS = new Set([
  'trial.created',
  'trial_offering.insert',
  'trial_offering.update',
  'trial_day.details_updated',
  'trial.pricing_updated',
  'trial.public_details_updated',
]);

export const initialTrialSetupRecordIds = (records: ActivityRecord[]) => {
  const chronological = [...records].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const createdIndex = chronological.findIndex((record) => record.action === 'trial.created');
  if (createdIndex < 0) return new Set<string>();
  const grouped = new Set<string>();
  for (const record of chronological.slice(createdIndex)) {
    if (!INITIAL_SETUP_ACTIONS.has(record.action)) break;
    grouped.add(record.id);
  }
  return grouped;
};
