import assert from 'node:assert/strict';
import test from 'node:test';
import { joinFormalAlerts, splitFormalAlerts } from './formalAlerts';

test('supports separate alerts and legacy comma, slash, and multiline values', () => {
  assert.deepEqual(splitFormalAlerts('Dogs, People'), ['Dogs', 'People']);
  assert.deepEqual(splitFormalAlerts('Dogs / People'), ['Dogs', 'People']);
  assert.deepEqual(splitFormalAlerts('Dogs\nPeople'), ['Dogs', 'People']);
  assert.equal(joinFormalAlerts('Dogs', 'People'), 'Dogs\nPeople');
});
