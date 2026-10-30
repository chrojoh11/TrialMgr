import assert from 'node:assert/strict';
import test from 'node:test';
import { isStandardFormalAlert, joinFormalAlerts, SDDA_FORMAL_ALERT_OPTIONS, splitFormalAlerts } from './formalAlerts';

test('supports separate alerts and legacy comma, slash, and multiline values', () => {
  assert.deepEqual(splitFormalAlerts('Dogs, People'), ['Dogs', 'People']);
  assert.deepEqual(splitFormalAlerts('Dogs / People'), ['Dogs', 'People']);
  assert.deepEqual(splitFormalAlerts('Dogs\nPeople'), ['Dogs', 'People']);
  assert.equal(joinFormalAlerts('Dogs', 'People'), 'Dogs\nPeople');
});

test('offers normalized formal-alert descriptions while preserving custom alerts', () => {
  assert.ok(SDDA_FORMAL_ALERT_OPTIONS.includes('Nose freeze'));
  assert.ok(SDDA_FORMAL_ALERT_OPTIONS.includes('Look at handler'));
  assert.equal(SDDA_FORMAL_ALERT_OPTIONS.includes('Look back at handler' as never), false);
  assert.equal(isStandardFormalAlert('Sit'), true);
  assert.equal(isStandardFormalAlert('Nose down, look at me'), false);
  assert.equal(joinFormalAlerts('__custom__', ''), '');
  assert.equal(joinFormalAlerts('Nose freeze', '__custom__'), 'Nose freeze');
});
