import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptedEntryChargeCents, minimumJudgeFeeCents, sddaRemittanceCents } from './financialSummary';

test('calculates accepted Scent packages, Elite, and Games fees', () => {
  const entry = { id: 'entry', confirmation_status: 'accepted', sdda_runs: [
    { trial_day_id: 'day-1', level: 'Started' }, { trial_day_id: 'day-1', level: 'Started' },
    { trial_day_id: 'day-1', level: 'Started' }, { trial_day_id: 'day-2', level: 'Elite' },
  ], sdda_game_runs: [{ offering_id: 'game', entry_type: 'FEO' }] };
  assert.equal(acceptedEntryChargeCents(entry, {
    scentComponentFeeCents: 3500, scentThreeComponentFeeCents: 9500, eliteFeeCents: 10500,
  }, [{ id: 'game', entry_fee_cents: 2500, feo_fee_cents: 1500 }]), 21500);
  assert.equal(acceptedEntryChargeCents({ ...entry, confirmation_status: 'received' }, {
    scentComponentFeeCents: 3500, scentThreeComponentFeeCents: 9500, eliteFeeCents: 10500,
  }, []), 0);
});

test('calculates SDDA host fees and judge minimums', () => {
  const entries = [{ id: 'one', confirmation_status: 'accepted', sdda_runs: [
    { trial_day_id: 'day-1', level: 'Started' }, { trial_day_id: 'day-1', level: 'Elite' },
    { trial_day_id: 'day-1', level: 'Elite' }, { trial_day_id: 'day-1', level: 'Elite' },
  ], sdda_game_runs: [{ offering_id: 'game', entry_type: 'Regular' }] }];
  assert.equal(sddaRemittanceCents(entries, 2), 12000);
  assert.equal(minimumJudgeFeeCents(10, 5), 20000);
  assert.equal(minimumJudgeFeeCents(100, 10), 32000);
});
