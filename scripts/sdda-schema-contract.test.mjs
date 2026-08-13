import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/sdda-migrations/20260813_0001_sdda_core.sql', import.meta.url),
  'utf8',
).toLowerCase();

const authMigration = readFileSync(
  new URL('../supabase/sdda-migrations/20260813_0002_auth_profile_bootstrap.sql', import.meta.url),
  'utf8',
).toLowerCase();

const atomicTrialMigration = readFileSync(
  new URL('../supabase/sdda-migrations/20260813_0003_atomic_trial_creation.sql', import.meta.url),
  'utf8',
).toLowerCase();

const offeringsMigration = readFileSync(
  new URL('../supabase/sdda-migrations/20260813_0004_trial_offerings.sql', import.meta.url),
  'utf8',
).toLowerCase();

const entryImportMigration = readFileSync(
  new URL('../supabase/sdda-migrations/20260813_0005_atomic_entry_import.sql', import.meta.url),
  'utf8',
).toLowerCase();

const runningOrderMigration = readFileSync(
  new URL('../supabase/sdda-migrations/20260813_0006_atomic_running_order.sql', import.meta.url),
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

test('prevents cross-trial runs and binds sensitive writes to the caller', () => {
  assert.match(migration, /foreign key \(entry_id, trial_id\)[\s\S]*references public\.sdda_entries\(id, trial_id\)/);
  assert.match(migration, /foreign key \(trial_day_id, trial_id\)[\s\S]*references public\.sdda_trial_days\(id, trial_id\)/);
  assert.match(migration, /recorded_by = auth\.uid\(\)/);
  assert.match(migration, /created_by = auth\.uid\(\) and public\.sdda_can_manage_finances/);
});

test('keeps assistants and viewers out of financial records', () => {
  const functionStart = migration.indexOf('create or replace function public.sdda_can_manage_finances');
  const functionEnd = migration.indexOf('$$;', functionStart);
  const financeFunction = migration.slice(functionStart, functionEnd);
  assert.match(financeFunction, /m\.role in \('owner', 'secretary'\)/);
  assert.doesNotMatch(financeFunction, /assistant|viewer/);
  assert.match(migration, /sdda_financial_read[\s\S]*sdda_can_manage_finances\(trial_id\)/);
});

test('bootstraps an SDDA profile for every authenticated user', () => {
  assert.match(authMigration, /create or replace function public\.sdda_handle_new_auth_user\(\)/);
  assert.match(authMigration, /security definer/);
  assert.match(authMigration, /set search_path = public/);
  assert.match(authMigration, /create trigger sdda_auth_user_profile/);
  assert.match(authMigration, /after insert or update of email, raw_user_meta_data on auth\.users/);
  assert.match(authMigration, /on conflict \(user_id\) do update/);
});

test('backfills existing Auth users without copying legacy application data', () => {
  assert.match(authMigration, /from auth\.users u/);
  assert.doesNotMatch(authMigration, /from public\.users|cwags|c-wags|service_role/);
});

test('creates SDDA trials and one-to-four days atomically as the signed-in user', () => {
  assert.match(atomicTrialMigration, /function public\.sdda_create_trial/);
  assert.match(atomicTrialMigration, /security invoker/);
  assert.match(atomicTrialMigration, /auth\.uid\(\)/);
  assert.match(atomicTrialMigration, /cardinality\(trial_dates\).*between 1 and 4/s);
  assert.match(atomicTrialMigration, /insert into public\.sdda_audit_records/);
  assert.match(atomicTrialMigration, /revoke all on function public\.sdda_create_trial\(text, text, text, date\[\]\) from anon/);
  assert.doesNotMatch(atomicTrialMigration, /service_role|security definer|cwags|c-wags/);
});

test('defines RLS-protected SDDA day offerings for levels, components, and streams', () => {
  assert.match(offeringsMigration, /create table public\.sdda_trial_offerings/);
  for (const value of ['started', 'advanced', 'excellent', 'elite', 'container', 'interior', 'exterior', 'amateur', 'working']) {
    assert.match(offeringsMigration, new RegExp(`'${value}'`));
  }
  assert.match(offeringsMigration, /unique \(trial_day_id, level, component, stream\)/);
  assert.match(offeringsMigration, /enable row level security/);
  assert.match(offeringsMigration, /sdda_can_manage_trial\(trial_id\)/);
  assert.match(offeringsMigration, /revoke all on table public\.sdda_trial_offerings from anon/);
  assert.match(offeringsMigration, /create trigger sdda_trial_offering_audit/);
  assert.match(offeringsMigration, /insert into public\.sdda_audit_records/);
  assert.doesNotMatch(offeringsMigration, /service_role|cwags|c-wags/);
});

test('imports SDDA entries atomically only into configured offerings', () => {
  assert.match(entryImportMigration, /function public\.sdda_import_entry/);
  assert.match(entryImportMigration, /security invoker/);
  assert.match(entryImportMigration, /sdda_can_manage_trial\(target_trial_id\)/);
  assert.match(entryImportMigration, /from public\.sdda_trial_offerings/);
  for (const table of ['sdda_dogs', 'sdda_entries', 'sdda_runs', 'sdda_audit_records']) {
    assert.match(entryImportMigration, new RegExp(`insert into public\\.${table}`));
  }
  assert.match(entryImportMigration, /revoke all on function public\.sdda_import_entry.*from anon/s);
  assert.doesNotMatch(entryImportMigration, /service_role|security definer|cwags|c-wags/);
});

test('saves complete SDDA running orders atomically with an audit record', () => {
  assert.match(runningOrderMigration, /function public\.sdda_save_running_order/);
  assert.match(runningOrderMigration, /security invoker/);
  assert.match(runningOrderMigration, /running order must contain every run exactly once/);
  assert.match(runningOrderMigration, /set running_position=null/);
  assert.match(runningOrderMigration, /'running_order\.saved'/);
  assert.match(runningOrderMigration, /from anon/);
  assert.doesNotMatch(runningOrderMigration, /service_role|security definer|cwags|c-wags/);
});
