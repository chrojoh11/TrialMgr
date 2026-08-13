import assert from 'node:assert/strict';
import test from 'node:test';
import { offeringKey, parseOfferingKey } from './offerings';

test('round-trips an SDDA trial offering selection', () => {
  const selection = { trialDayId: 'day-1', level: 'Started', component: 'Container', stream: 'Amateur' } as const;
  assert.deepEqual(parseOfferingKey(offeringKey(selection)), selection);
});

test('rejects non-SDDA levels, components, and streams', () => {
  assert.throws(() => parseOfferingKey('day-1|Patrol|Vehicle|Pro'), /Invalid SDDA offering/);
});
