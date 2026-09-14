import assert from 'node:assert/strict';
import test from 'node:test';
import XLSX from 'xlsx-js-style';
import { buildSddaRunningOrderWorkbook } from './runningOrderWorkbook';

test('matches the original SDDA running-order workbook structure', () => {
  const day = {
    id: 'day-1',
    day_number: 1,
    trial_date: '2026-06-06',
    sdda_trial_number: 'T-1',
    judge_name: 'Judge',
  };
  const trial: any = {
    name: 'Test Trial',
    venue: 'Venue',
    sdda_trial_days: [day],
  };
  const run: any = {
    id: 'run-1',
    trial_day_id: day.id,
    level: 'Started',
    component: 'Container',
    stream: 'Amateur',
    run_group: 'Regular',
    running_position: 1,
    sdda_entries: {
      handler_name: 'Handler',
      reactivity: 'Dogs',
      sdda_dogs: { call_name: 'Dog' },
    },
  };
  const workbook = XLSX.read(buildSddaRunningOrderWorkbook(trial, [run]), {
    type: 'array',
    cellStyles: true,
  });
  assert.deepEqual(workbook.SheetNames, ['Saturday Runs']);
  const sheet = workbook.Sheets['Saturday Runs'];
  assert.equal(sheet.A1.v, 'Saturday Runs');
  assert.equal(sheet.N1.v, 'DAY TOTAL\n1 RUNS');
  assert.equal(sheet.C7.v, 'A');
  assert.equal(sheet.E6.v, 'Reactive');
  assert.equal(sheet['!cols']?.[4]?.wch, 10);
  assert.equal(sheet.E7.v, 'Dogs');
  assert.equal(sheet['!cols']?.length, 15);
  assert.equal(sheet['!merges']?.some((range) => XLSX.utils.encode_range(range) === 'A1:M2'), true);
});

test('leaves non-reactive dogs blank in the running-order export', () => {
  const day = { id: 'day-1', day_number: 1, trial_date: '2026-06-06' };
  const trial: any = { name: 'Test Trial', sdda_trial_days: [day] };
  const run: any = { trial_day_id: day.id, level: 'Started', component: 'Container', stream: 'Working', run_group: 'Regular', sdda_entries: { handler_name: 'Handler', reactivity: 'None', sdda_dogs: { call_name: 'Dog' } } };
  const workbook = XLSX.read(buildSddaRunningOrderWorkbook(trial, [run]), { type: 'array' });
  assert.equal(workbook.Sheets['Saturday Runs'].E7.v, '');
});

test('adds a printable Games running-order sheet with all run details', () => {
  const day = { id: 'day-1', day_number: 1, trial_date: '2026-06-06', judge_name: 'Judge' };
  const trial: any = { name: 'Combined Trial', venue: 'Venue', sdda_trial_days: [day] };
  const gameRun: any = {
    trial_day_id: day.id,
    running_position: 2,
    run_group: 'Second dog',
    entry_type: 'Regular',
    aerial_division: 'Highfly',
    sdda_game_offerings: { game_type: 'Aerial' },
    sdda_entries: {
      handler_name: 'Handler',
      reactivity: 'People',
      sdda_dogs: { call_name: 'Dog', sdda_registration_number: '4429' },
    },
  };
  const workbook = XLSX.read(buildSddaRunningOrderWorkbook(trial, [], [gameRun]), { type: 'array' });
  assert.deepEqual(workbook.SheetNames, ['Saturday Runs', 'Saturday Games']);
  const sheet = workbook.Sheets['Saturday Games'];
  assert.equal(sheet.A1.v, 'Saturday Games');
  assert.equal(sheet.M1.v, 'DAY TOTAL\n1 RUNS');
  assert.equal(sheet.A7.v, 2);
  assert.equal(sheet.B7.v, 'Dog\nHandler');
  assert.equal(sheet.E7.v, '4429');
  assert.equal(sheet.F7.v, 'Second dog');
  assert.equal(sheet.G7.v, 'Regular');
  assert.equal(sheet.H6.v, 'Aerial division / Team partner');
  assert.equal(sheet.H7.v, 'Highfly');
  assert.equal(sheet.M7.v, 'People');
});
