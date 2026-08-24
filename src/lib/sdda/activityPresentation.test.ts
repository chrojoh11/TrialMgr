import assert from 'node:assert/strict';
import test from 'node:test';
import { activityFieldLabel, secretaryActivityChanges } from './activityPresentation';

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
