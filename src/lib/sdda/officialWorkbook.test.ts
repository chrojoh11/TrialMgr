import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { buildOfficialSddaWorkbook, officialWorkbookDogNumbers, reviewOfficialSddaWorkbook } from './officialWorkbook';

const template = new Uint8Array(readFileSync('public/templates/sdda/TrialWorkbook-20260729.xlsx'));

test('patches a fresh official SDDA workbook while preserving its formulas and Games sheet', () => {
  const original = unzipSync(template);
  const output = buildOfficialSddaWorkbook(template, {
    days: [{ dayNumber: 1, trialNumber: 'SD-TEST-1', trialDate: '2026-09-12' }],
    venue: 'Test Venue',
    trialEmail: 'secretary@example.ca',
    defaultJudge: 'Test Judge',
    runs: [
      { dayNumber: 1, level: 'Started', component: 'Container', stream: 'Amateur', dogNumber: '1234', runGroup: 'Regular' },
      { dayNumber: 1, level: 'Started', component: 'Interior', stream: 'Working', dogNumber: '1234', runGroup: 'Regular', result: 'qualifying', score: 22, timeSeconds: 31.5 },
    ],
  });
  const files = unzipSync(output);
  const workbook = strFromU8(files['xl/workbook.xml']);
  assert.match(workbook, /name="Games"/);
  assert.match(workbook, /fullCalcOnLoad="1"/);
  assert.equal(strFromU8(files['xl/worksheets/sheet3.xml']).includes('<f>'), true);
  assert.equal(strFromU8(files['xl/worksheets/sheet11.xml']), strFromU8(original['xl/worksheets/sheet11.xml']));
  const started = strFromU8(files['xl/worksheets/sheet3.xml']);
  assert.match(started, /r="C5"[^>]*><v>1234<\/v>/);
  assert.match(started, /r="G5"[^>]*t="inlineStr"><is><t xml:space="preserve">E<\/t><\/is><\/c>/);
  assert.match(started, /r="C6"[^>]*><v>1234<\/v>/);
  assert.match(started, /r="O6"[^>]*><v>22<\/v>/);
});

test('rejects more than two days because the official workbook has only two day sections', () => {
  assert.throws(() => buildOfficialSddaWorkbook(template, { days: [
    { dayNumber: 1, trialNumber: '1', trialDate: '2026-09-12' },
    { dayNumber: 2, trialNumber: '2', trialDate: '2026-09-13' },
    { dayNumber: 3, trialNumber: '3', trialDate: '2026-09-14' },
  ], venue: '', runs: [] }), /one or two trial days/);
});

test('reviews required official submission fields and reads the embedded dog registry', () => {
  const registry = officialWorkbookDogNumbers(template);
  assert.equal(registry.has('17'), true);
  const issues = reviewOfficialSddaWorkbook({
    days: [{ dayNumber: 1, trialNumber: '', trialDate: '2026-09-12' }],
    venue: '',
    runs: [{ dayNumber: 1, level: 'Started', component: 'Container', stream: 'Amateur', dogNumber: '', runGroup: 'Regular' }],
  }, registry);
  assert.equal(issues.filter((issue) => issue.severity === 'blocker').length, 4);
  assert.equal(issues.some((issue) => issue.message.includes('not scored')), true);
});
