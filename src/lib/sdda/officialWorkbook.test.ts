import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { buildOfficialSddaWorkbook, officialWorkbookDogNumbers, reviewOfficialSddaWorkbook } from './officialWorkbook';

const template = new Uint8Array(readFileSync('public/templates/sdda/TrialWorkbook-20260729.xlsx'));

test('patches a fresh official SDDA workbook while preserving formulas and filling Games', () => {
  const output = buildOfficialSddaWorkbook(template, {
    days: [{ dayNumber: 1, trialNumber: 'SD-TEST-1', trialDate: '2026-09-12' }],
    venue: 'Test Venue',
    trialEmail: 'secretary@example.ca',
    defaultJudge: 'Test Judge',
    runs: [
      { dayNumber: 1, level: 'Started', component: 'Container', stream: 'Amateur', dogNumber: '1234', runGroup: 'Regular' },
      { dayNumber: 1, level: 'Started', component: 'Interior', stream: 'Working', dogNumber: '1234', runGroup: 'Regular', result: 'qualifying', score: 22, timeSeconds: 31.5 },
    ],
    gameRuns: [
      { dayNumber: 1, gameType: 'Aerial', dogNumber: '1234', entryType: 'Regular', result: 'pass', timeSeconds: 18.2 },
      { dayNumber: 1, gameType: 'Distance', dogNumber: '1234', entryType: 'Regular', result: 'pass', timeSeconds: 27.7 },
      { dayNumber: 1, gameType: 'Speed', dogNumber: '1234', entryType: 'Regular', result: 'pass', timeSeconds: 32.4 },
    ],
  });
  const files = unzipSync(output);
  const workbook = strFromU8(files['xl/workbook.xml']);
  assert.match(workbook, /name="Games"/);
  assert.match(workbook, /fullCalcOnLoad="1"/);
  assert.match(workbook, /calcMode="auto"/);
  assert.match(workbook, /calcOnSave="1"/);
  assert.equal(files['xl/calcChain.xml'], undefined);
  assert.doesNotMatch(strFromU8(files['xl/_rels/workbook.xml.rels']), /calcChain/);
  assert.doesNotMatch(strFromU8(files['[Content_Types].xml']), /calcChain/);
  assert.equal(strFromU8(files['xl/worksheets/sheet3.xml']).includes('<f>'), true);
  const games = strFromU8(files['xl/worksheets/sheet11.xml']);
  assert.match(games, /r="D7"[^>]*><v>1234<\/v>/);
  assert.match(games, /r="O7"[^>]*t="inlineStr"><is><t xml:space="preserve">P<\/t>/);
  const distanceTimeStyle = Number(games.match(/r="W7"[^>]*\bs="(\d+)"/)?.[1]);
  const speedTimeStyle = Number(games.match(/r="AD7"[^>]*\bs="(\d+)"/)?.[1]);
  const styles = strFromU8(files['xl/styles.xml']);
  const cellStyles = styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g) || [];
  assert.match(cellStyles[distanceTimeStyle], /numFmtId="47"/);
  assert.match(cellStyles[speedTimeStyle], /numFmtId="47"/);
  const started = strFromU8(files['xl/worksheets/sheet3.xml']);
  assert.match(started, /r="C5"[^>]*><v>1234<\/v>/);
  assert.match(started, /r="G5"[^>]*t="inlineStr"><is><t xml:space="preserve">E<\/t><\/is><\/c>/);
  assert.match(started, /r="C6"[^>]*><v>1234<\/v>/);
  assert.match(started, /r="O6"[^>]*><v>22<\/v>/);
});

test('keeps worksheet cell XML valid when populated template cells were self-closing', () => {
  const output = buildOfficialSddaWorkbook(template, {
    days: [{ dayNumber: 1, trialNumber: '3085', trialDate: '2026-10-11' }],
    venue: 'Peachland Riding Club',
    defaultJudge: 'Test Judge',
    runs: [
      { dayNumber: 1, level: 'Started', component: 'Container', stream: 'Working', dogNumber: '7151', runGroup: 'Regular', result: 'qualifying', score: 30, timeSeconds: 72.77 },
      { dayNumber: 1, level: 'Advanced', component: 'Container', stream: 'Working', dogNumber: '7151', runGroup: 'Regular', result: 'qualifying', score: 60, timeSeconds: 151.27 },
    ],
    gameRuns: [{ dayNumber: 1, gameType: 'Aerial', dogNumber: '7151', entryType: 'Regular', result: 'pass', timeSeconds: 18.2 }],
  });
  const files = unzipSync(output);
  for (const [path, bytes] of Object.entries(files)) {
    if (!path.startsWith('xl/worksheets/') || !path.endsWith('.xml')) continue;
    const xml = strFromU8(bytes);
    assert.doesNotMatch(xml, /<c\b[^>]*\/\s+t=/, `${path} has attributes after a self-closing cell slash`);
    assert.doesNotMatch(xml, /<c\b[^>]*\/>\s*<(?:v|is)>/, `${path} has a value outside a self-closing cell`);
  }
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

test('reviews Scent results and warns when an automatic NQ must export as zero', () => {
  const base = { days: [{ dayNumber: 1, trialNumber: '3000', trialDate: '2026-09-12', judgeName: 'Judge' }], venue: 'Venue' };
  const qualifyingBelowMinimum = reviewOfficialSddaWorkbook({ ...base, runs: [{ dayNumber: 1, level: 'Started' as const, component: 'Container' as const, stream: 'Amateur' as const, dogNumber: '1234', runGroup: 'Regular', result: 'qualifying' as const, score: 14, timeSeconds: 30 }] });
  assert.equal(qualifyingBelowMinimum.some((issue) => issue.severity === 'blocker' && issue.message.includes('marked Qualifying')), true);
  const nonQualifyingThatCalculatesPass = reviewOfficialSddaWorkbook({ ...base, runs: [{ dayNumber: 1, level: 'Advanced' as const, component: 'Interior' as const, stream: 'Working' as const, dogNumber: '1234', runGroup: 'Regular', result: 'non_qualifying' as const, score: 70, timeSeconds: 120 }] });
  assert.equal(nonQualifyingThatCalculatesPass.some((issue) => issue.severity === 'warning' && issue.message.includes('export 0')), true);
});

test('exports every non-qualifying Scent outcome as a numeric failed score', () => {
  const output = buildOfficialSddaWorkbook(template, {
    days: [{ dayNumber: 1, trialNumber: '3085', trialDate: '2026-10-11', judgeName: 'Judge' }],
    venue: 'Venue',
    runs: [
      { dayNumber: 1, level: 'Started', component: 'Container', stream: 'Amateur', dogNumber: '1001', runGroup: 'Regular', result: 'non_qualifying', score: null, timeSeconds: 151.27 },
      { dayNumber: 1, level: 'Started', component: 'Container', stream: 'Working', dogNumber: '1002', runGroup: 'Regular', result: 'non_qualifying', score: 14, timeSeconds: 60 },
      { dayNumber: 1, level: 'Started', component: 'Container', stream: 'Working', dogNumber: '1003', runGroup: 'Regular', result: 'non_qualifying', score: 20, timeSeconds: 60 },
      { dayNumber: 1, level: 'Started', component: 'Container', stream: 'Working', dogNumber: '1004', runGroup: 'Regular', result: 'excused' },
      { dayNumber: 1, level: 'Started', component: 'Container', stream: 'Working', dogNumber: '1005', runGroup: 'Regular', result: 'withdrawn' },
    ],
  });
  const started = strFromU8(unzipSync(output)['xl/worksheets/sheet3.xml']);
  assert.match(started, /r="G5"[^>]*><v>0<\/v>/);
  assert.match(started, /r="G6"[^>]*><v>0<\/v>/);
  assert.match(started, /r="G7"[^>]*><v>0<\/v>/);
  assert.match(started, /r="G8"[^>]*><v>0<\/v>/);
  assert.match(started, /r="G9"[^>]*><v>0<\/v>/);
});
