import assert from 'node:assert/strict';
import test from 'node:test';
import { findSddaScheduleConflicts, moveSddaRun, orderSddaRuns, type SddaScheduledRun } from './runningOrder';

const run = (overrides: Partial<SddaScheduledRun>): SddaScheduledRun => ({
  id: 'run', dayIndex: 0, level: 'Started', component: 'Container', handlerId: 'handler',
  dogId: 'dog', group: 'Regular', order: 1, ...overrides,
});

test('orders officials, regular entries, second dogs, FEO, then BIS', () => {
  const ordered = orderSddaRuns([
    run({ id: 'bis', group: 'BIS' }), run({ id: 'official', group: 'Official' }),
    run({ id: 'feo', group: 'FEO' }), run({ id: 'second', group: 'Second dog' }),
    run({ id: 'regular', group: 'Regular' }),
  ]);
  assert.deepEqual(ordered.map(({ id }) => id), ['official', 'regular', 'second', 'feo', 'bis']);
});

test('finds same-day duplicate dogs and adjacent handler runs', () => {
  const conflicts = findSddaScheduleConflicts([
    run({ id: 'one', dogId: 'dog-1', handlerId: 'handler-1', order: 1 }),
    run({ id: 'two', dogId: 'dog-1', handlerId: 'handler-2', order: 8 }),
    run({ id: 'three', dogId: 'dog-3', handlerId: 'handler-1', component: 'Interior', order: 2 }),
  ]);
  assert.deepEqual(conflicts.map(({ kind }) => kind).sort(), ['duplicate-dog', 'handler-overlap']);
});

test('moves a run without losing entries', () => {
  assert.deepEqual(moveSddaRun(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
});
