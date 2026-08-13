import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canMoveUpComponent,
  isValidTrialDayCount,
  nextMoveUpLevel,
} from './domain';

test('accepts only one-to-four-day trials', () => {
  assert.equal(isValidTrialDayCount(1), true);
  assert.equal(isValidTrialDayCount(4), true);
  assert.equal(isValidTrialDayCount(0), false);
  assert.equal(isValidTrialDayCount(5), false);
  assert.equal(isValidTrialDayCount(2.5), false);
});

test('supports only the SDDA next-level move-ups', () => {
  assert.equal(nextMoveUpLevel('Started'), 'Advanced');
  assert.equal(nextMoveUpLevel('Advanced'), 'Excellent');
  assert.equal(nextMoveUpLevel('Excellent'), null);
  assert.equal(nextMoveUpLevel('Elite'), null);
});

test('requires every component-specific move-up safeguard', () => {
  const valid = {
    fromDayIndex: 0,
    toDayIndex: 1,
    level: 'Started' as const,
    qualified: true,
    registeredForNextDay: true,
    capacityAvailable: true,
    hostApproved: true,
  };
  assert.equal(canMoveUpComponent(valid), true);
  assert.equal(canMoveUpComponent({ ...valid, toDayIndex: 2 }), false);
  assert.equal(canMoveUpComponent({ ...valid, hostApproved: false }), false);
});
