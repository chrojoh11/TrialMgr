import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/sdda-migrations/20260813_0001_sdda_core.sql', import.meta.url),
  'utf8',
).toLowerCase();

const requiredTables = [
  'sdda_profiles', 'sdda_trials', 'sdda_trial_days', 'sdda_trial_members', 'sdda_dogs',
  'sdda_entries', 'sdda_runs', 'sdda_scores', 'sdda_financial_transactions',
  'sdda_audit_records',
];

test('defines every initial SDDA table', () => {
  for (const table of requiredTables) {
    assert.match(migration, new RegExp(`create table public\\.${table}\\b`));
  }
});

test('enables RLS on every initial SDDA table', () => {
  for (const table of requiredTables) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
});

test('encodes SDDA days, levels, components, streams, groups, and pending registration', () => {
  assert.match(migration, /day_number between 1 and 4/);
  for (const value of ['started', 'advanced', 'excellent', 'elite']) assert.match(migration, new RegExp(`'${value}'`));
  for (const value of ['container', 'interior', 'exterior']) assert.match(migration, new RegExp(`'${value}'`));
  for (const value of ['amateur', 'working']) assert.match(migration, new RegExp(`'${value}'`));
  for (const value of ['official', 'regular', 'second dog', 'feo', 'bis']) assert.match(migration, new RegExp(`'${value}'`));
  assert.match(migration, /registration_pending boolean not null default false/);
});

test('does not contain legacy C-WAGS project vocabulary', () => {
  for (const value of ['cwags', 'c-wags', 'patrol 1', 'detective 2', 'ranger 5', 'dasher 6']) {
    assert.doesNotMatch(migration, new RegExp(value));
  }
});
