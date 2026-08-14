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

const unifiedEntryRunsMigration = readFileSync(
  new URL('../supabase/sdda-migrations/20260813_0010_unified_entry_runs.sql', import.meta.url),
  'utf8',
).toLowerCase();

const formalAlertsMigration = readFileSync(
  new URL('../supabase/sdda-migrations/20260813_0011_formal_alerts.sql', import.meta.url),
  'utf8',
).toLowerCase();
const componentMoveUpMigration = readFileSync(new URL('../supabase/sdda-migrations/20260813_0012_component_move_up.sql', import.meta.url), 'utf8').toLowerCase();
const multilevelRunsMigration = readFileSync(new URL('../supabase/sdda-migrations/20260813_0013_multilevel_component_runs.sql', import.meta.url), 'utf8').toLowerCase();
const publicEntryMigration = readFileSync(new URL('../supabase/sdda-migrations/20260813_0014_public_entry_confirmations.sql', import.meta.url), 'utf8').toLowerCase();
const publicEntryRandomMigration = readFileSync(new URL('../supabase/sdda-migrations/20260813_0015_public_entry_random_bytes.sql', import.meta.url), 'utf8').toLowerCase();
const publicEntryGroupsMigration = readFileSync(new URL('../supabase/sdda-migrations/20260813_0016_public_entry_run_group_requests.sql', import.meta.url), 'utf8').toLowerCase();
const perRunStreamsMigration = readFileSync(new URL('../supabase/sdda-migrations/20260813_0017_per_run_entry_streams.sql', import.meta.url), 'utf8').toLowerCase();

const runningOrderMigration = readFileSync(
  new URL('../supabase/sdda-migrations/20260813_0006_atomic_running_order.sql', import.meta.url),
  'utf8',
).toLowerCase();

const secureTrialCreationMigration = readFileSync(
  new URL('../supabase/sdda-migrations/20260813_0007_secure_trial_creation.sql', import.meta.url),
  'utf8',
).toLowerCase();

const deleteDraftTrialMigration = readFileSync(
  new URL('../supabase/sdda-migrations/20260813_0008_delete_draft_trial.sql', import.meta.url),
  'utf8',
).toLowerCase();

const fixDraftDeleteAuditMigration = readFileSync(
  new URL('../supabase/sdda-migrations/20260813_0009_fix_draft_delete_audit.sql', import.meta.url),
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

test('secures atomic trial creation without exposing anonymous execution', () => {
  assert.match(secureTrialCreationMigration, /alter function public\.sdda_create_trial.*security definer/s);
  assert.match(secureTrialCreationMigration, /set search_path = public/);
  assert.match(secureTrialCreationMigration, /from anon/);
  assert.match(secureTrialCreationMigration, /to authenticated/);
  assert.doesNotMatch(secureTrialCreationMigration, /service_role|cwags|c-wags/);
});

test('deletes only the signed-in owner’s draft and retains an audit record', () => {
  assert.match(deleteDraftTrialMigration, /function public\.sdda_delete_draft_trial/);
  assert.match(deleteDraftTrialMigration, /owner_id = auth\.uid\(\)/);
  assert.match(deleteDraftTrialMigration, /status = 'draft'/);
  assert.match(deleteDraftTrialMigration, /'trial\.deleted'/);
  assert.match(deleteDraftTrialMigration, /revoke all.*from anon/s);
  assert.doesNotMatch(deleteDraftTrialMigration, /service_role|cwags|c-wags/);
});

test('suppresses child offering audits only during an audited parent deletion', () => {
  assert.match(fixDraftDeleteAuditMigration, /set_config\('sdda\.deleting_trial'/);
  assert.match(fixDraftDeleteAuditMigration, /current_setting\('sdda\.deleting_trial', true\)/);
  assert.match(fixDraftDeleteAuditMigration, /'trial\.deleted'/);
  assert.match(fixDraftDeleteAuditMigration, /owner_id = auth\.uid\(\)/);
  assert.doesNotMatch(fixDraftDeleteAuditMigration, /service_role|cwags|c-wags/);
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

test('reuses one entry while importing component-specific runs idempotently', () => {
  assert.match(unifiedEntryRunsMigration, /alter table public\.sdda_runs\s+add column if not exists stream/);
  assert.match(unifiedEntryRunsMigration, /update public\.sdda_runs r\s+set stream\s*=\s*e\.stream/s);
  assert.match(unifiedEntryRunsMigration, /target_entry_id/);
  assert.match(unifiedEntryRunsMigration, /from public\.sdda_entries/);
  assert.match(unifiedEntryRunsMigration, /on conflict\s*\(entry_id,\s*trial_day_id,\s*component\)\s*do update/);
  assert.match(unifiedEntryRunsMigration, /excluded\.stream/);
  assert.match(unifiedEntryRunsMigration, /revoke all on function public\.sdda_import_entry.*from anon/s);
  assert.doesNotMatch(unifiedEntryRunsMigration, /service_role|security definer|cwags|c-wags/);
});

test('stores formal alerts and keeps their import authenticated and audited', () => {
  assert.match(formalAlertsMigration, /alter table public\.sdda_entries add column if not exists formal_alerts text/);
  assert.match(formalAlertsMigration, /entry_formal_alerts text/);
  assert.match(formalAlertsMigration, /'formal_alerts',entry_formal_alerts/);
  assert.match(formalAlertsMigration, /revoke all.*from anon/s);
  assert.doesNotMatch(formalAlertsMigration, /service_role|security definer|cwags|c-wags/);
});
test('supports audited component move-ups on any offered trial day', () => {
  assert.match(componentMoveUpMigration, /function public\.sdda_set_run_move_up/);
  assert.match(componentMoveUpMigration, /move_up_from_level/);
  assert.match(componentMoveUpMigration, /qualification_confirmed/);
  assert.match(componentMoveUpMigration, /host_approved/);
  assert.match(componentMoveUpMigration, /run\.move_up_approved/);
  assert.match(componentMoveUpMigration, /run\.move_up_undone/);
  assert.doesNotMatch(componentMoveUpMigration, /day_number\s*<=\s*1|service_role|security definer|cwags|c-wags/);
});
test('preserves multiple levels for the same dog, day, and component', () => {
  assert.match(multilevelRunsMigration, /unique\(entry_id,trial_day_id,level,component\)/);
  assert.match(multilevelRunsMigration, /on conflict\(entry_id,trial_day_id,level,component\)/);
  assert.doesNotMatch(multilevelRunsMigration, /on conflict\(entry_id,trial_day_id,component\)/);
  assert.doesNotMatch(multilevelRunsMigration, /service_role|security definer|cwags|c-wags/);
});

test('accepts public SDDA entries through narrow token-protected functions without anonymous table access', () => {
  assert.match(publicEntryMigration, /function public\.sdda_public_trial_entry_setup/);
  assert.match(publicEntryMigration, /function public\.sdda_submit_public_entry/);
  assert.match(publicEntryMigration, /function public\.sdda_public_entry_receipt/);
  assert.match(publicEntryMigration, /receipt_token_hash/);
  assert.match(publicEntryMigration, /digest\(receipt_token,'sha256'\)/);
  assert.match(publicEntryMigration, /status='entries_open'/);
  assert.match(publicEntryMigration, /from public\.sdda_trial_offerings/);
  assert.match(publicEntryMigration, /'received'/);
  assert.doesNotMatch(publicEntryMigration, /grant (select|insert|update|delete).*to anon/);
  assert.doesNotMatch(publicEntryMigration, /service_role|cwags|c-wags/);
});

test('resolves Supabase pgcrypto random bytes without broadening anonymous table access', () => {
  assert.match(publicEntryRandomMigration, /alter function public\.sdda_submit_public_entry\(uuid,jsonb\)/);
  assert.match(publicEntryRandomMigration, /set search_path to public, extensions/);
  assert.doesNotMatch(publicEntryRandomMigration, /grant .*table|service_role|cwags|c-wags/);
});

test('accepts validated competitor running-group requests while keeping table access private', () => {
  for (const value of ['official','regular','second dog','feo','bis']) assert.match(publicEntryGroupsMigration,new RegExp(`'${value}'`));
  assert.match(publicEntryGroupsMigration,/sdda_submit_public_entry_core/);
  assert.match(publicEntryGroupsMigration,/revoke all on function public\.sdda_submit_public_entry_core.*from public, anon, authenticated/);
  assert.match(publicEntryGroupsMigration,/entry\.public_run_groups_requested/);
  assert.doesNotMatch(publicEntryGroupsMigration,/grant .*table|service_role|cwags|c-wags/);
});

test('accepts per-run Amateur and Working choices without treating Elite as streamed', () => {
  assert.match(perRunStreamsMigration,/stream in \('amateur','working','mixed'\)/);
  assert.match(perRunStreamsMigration,/count\(distinct o\.stream\)/);
  assert.match(perRunStreamsMigration,/o\.level <> 'elite'/);
  assert.match(perRunStreamsMigration,/o\.id=\(run_request->>'offering_id'\)::uuid/);
  assert.match(perRunStreamsMigration,/o\.stream,requested_group/);
  assert.doesNotMatch(perRunStreamsMigration,/submission->>'stream'/);
  assert.doesNotMatch(perRunStreamsMigration,/grant .*table|service_role|cwags|c-wags/);
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
