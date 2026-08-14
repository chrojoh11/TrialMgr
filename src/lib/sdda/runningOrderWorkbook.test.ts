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
      formal_alerts: 'Dogs',
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
  assert.equal(sheet.E7.v, '⚠ Dogs');
  assert.equal(sheet['!cols']?.length, 15);
  assert.equal(sheet['!merges']?.some((range) => XLSX.utils.encode_range(range) === 'A1:M2'), true);
});
