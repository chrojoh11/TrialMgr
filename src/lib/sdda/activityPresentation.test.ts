import assert from 'node:assert/strict';
import test from 'node:test';
import { activityFieldLabel, displayActivityFieldValue, groupEntryImportActivity, groupOfferingActivity, initialTrialSetupRecordIds, secretaryActivityChanges } from './activityPresentation';

test('keeps secretary-facing changes and removes database metadata', () => {
  const changes = secretaryActivityChanges({}, {
    id: 'offering-id',
    trial_id: 'trial-id',
    trial_day_id: 'day-id',
    created_at: '2026-08-22T23:53:28Z',
    updated_at: '2026-08-22T23:53:28Z',
    level: 'Started',
    component: 'Exterior',
    stream: 'Working',
    capacity: null,
    judge_name: null,
  });

  assert.deepEqual(changes.map((change) => change.field), ['level', 'component', 'stream']);
});

test('retains meaningful clearing and labels common operational fields', () => {
  const changes = secretaryActivityChanges(
    { judge_name: 'Jane Judge', confirmation_status: 'received' },
    { judge_name: null, confirmation_status: 'accepted' },
  );

  assert.equal(changes.length, 2);
  assert.equal(activityFieldLabel('judge_name'), 'Judge');
  assert.equal(activityFieldLabel('confirmation_status'), 'Entry Decision');
});

test('groups only the uninterrupted initial trial setup sequence', () => {
  const grouped = initialTrialSetupRecordIds([
    { id: 'later-offering', action: 'trial_offering.insert', created_at: '2026-08-24T12:00:00Z' },
    { id: 'entry', action: 'entry.submitted', created_at: '2026-08-24T11:00:00Z' },
    { id: 'offering-2', action: 'trial_offering.insert', created_at: '2026-08-24T10:02:00Z' },
    { id: 'day', action: 'trial_day.details_updated', created_at: '2026-08-24T10:01:00Z' },
    { id: 'created', action: 'trial.created', created_at: '2026-08-24T10:00:00Z' },
  ]);
  assert.deepEqual([...grouped], ['created', 'day', 'offering-2']);
});

test('combines offering inserts from one save into one display record', () => {
  const grouped = groupOfferingActivity([
    { id: 'a', action: 'trial_offering.insert', actor_id: 'secretary', created_at: '2026-08-24T10:02:00.111Z' },
    { id: 'b', action: 'trial_offering.insert', actor_id: 'secretary', created_at: '2026-08-24T10:02:00.222Z' },
    { id: 'c', action: 'trial_offering.insert', actor_id: 'other', created_at: '2026-08-24T10:02:00.333Z' },
  ]);
  assert.equal(grouped.length, 2);
  assert.ok(grouped[0].offeringBatch);
  assert.ok(grouped[1].offeringBatch);
  assert.equal(grouped[0].offeringBatch?.length, 2);
  assert.equal(grouped[1].offeringBatch?.length, 1);
});

test('combines inserts, updates, and deletes from one offering save', () => {
  const grouped = groupOfferingActivity([
    { id: 'a', action: 'trial_offering.update', actor_id: 'secretary', created_at: '2026-08-24T10:02:00.111Z' },
    { id: 'b', action: 'trial_offering.update', actor_id: 'secretary', created_at: '2026-08-24T10:02:00.222Z' },
    { id: 'c', action: 'trial_offering.insert', actor_id: 'secretary', created_at: '2026-08-24T10:02:00.333Z' },
    { id: 'd', action: 'trial_offering.delete', actor_id: 'secretary', created_at: '2026-08-24T10:01:59.999Z' },
  ]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].offeringBatch?.length, 4);
});

test('keeps offering saves separated when more than a minute apart', () => {
  const grouped = groupOfferingActivity([
    { id: 'a', action: 'trial_offering.delete', actor_id: 'secretary', created_at: '2026-08-24T10:04:00Z' },
    { id: 'b', action: 'trial_offering.insert', actor_id: 'secretary', created_at: '2026-08-24T10:02:00Z' },
  ]);
  assert.equal(grouped.length, 2);
});

test('formats stored cent values as Canadian currency', () => {
  assert.equal(displayActivityFieldValue('scent_component_fee_cents', 3575), '$35.75');
  assert.equal(displayActivityFieldValue('scent_three_component_fee_cents', 10000), '$100.00');
  assert.equal(activityFieldLabel('scent_component_fee_cents'), 'Scent—Single Component');
});

test('combines contiguous entry imports from one actor into one batch', () => {
  const grouped = groupEntryImportActivity([
    { id: 'a', action: 'entry.imported', actor_id: 'secretary', created_at: '2026-08-24T10:02:30Z' },
    { id: 'b', action: 'entry.imported', actor_id: 'secretary', created_at: '2026-08-24T10:02:10Z' },
    { id: 'c', action: 'entry.imported', actor_id: 'secretary', created_at: '2026-08-24T09:58:00Z' },
  ]);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].importBatch?.length, 2);
  assert.equal(grouped[1].importBatch?.length, 1);
});

test('does not combine imports from different actors', () => {
  const grouped = groupEntryImportActivity([
    { id: 'a', action: 'entry.imported', actor_id: 'secretary', created_at: '2026-08-24T10:02:30Z' },
    { id: 'b', action: 'entry.imported', actor_id: 'other', created_at: '2026-08-24T10:02:20Z' },
  ]);
  assert.equal(grouped.length, 2);
});
