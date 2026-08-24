import assert from 'node:assert/strict';
import test from 'node:test';
import { SDDA_RUNNING_ORDER_RUN_SELECT } from './trialRepository';

test('running-order records include formal alerts required by score-sheet packets', () => {
  assert.match(SDDA_RUNNING_ORDER_RUN_SELECT, /sdda_entries!inner\([^)]*formal_alerts/);
});
