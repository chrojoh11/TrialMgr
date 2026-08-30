import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { parseSddaHistoryWorkbook, possibleTitleAwards, titleHistoryFlags, workingStreamConflicts } from './titleHistoryWorkbook';

test('reads official SDDA Dogs component-Q columns', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Number', 'Dog', 'Breed', '', '', '', 'SC', 'SI', 'SE', 'AC', 'AI', 'AE', 'EC', 'EI', 'EE'],
    ['12345', 'Magic', 'All Canadian', '', '', '', 1, 1, 0, 2, 3, 4, 0, 0, 0],
  ]), 'SDDA Dogs');
  const parsed = parseSddaHistoryWorkbook(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
  assert.equal(parsed.dogs[0].qualifyingCounts['Started|Interior'], 1);
  assert.equal(parsed.dogs[0].qualifyingCounts['Advanced|Exterior'], 4);
});

test('reads official registry identity fields from SDDA Dogs', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Number', 'Dog', 'Breed', 'Sex', 'Owner number', 'Owner'],
    ['17', 'Dali', 'All-Canadian', 'Female', '14187', 'Wolfram, Marg'],
  ]), 'SDDA Dogs');
  const parsed = parseSddaHistoryWorkbook(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
  assert.deepEqual(parsed.dogs[0], {
    registrationNumber: '17', dogName: 'Dali', breed: 'All-Canadian', sex: 'Female',
    ownerNumber: '14187', ownerName: 'Wolfram, Marg', qualifyingCounts: {
      'Started|Container': 0, 'Started|Interior': 0, 'Started|Exterior': 0,
      'Advanced|Container': 0, 'Advanced|Interior': 0, 'Advanced|Exterior': 0,
      'Excellent|Container': 0, 'Excellent|Interior': 0, 'Excellent|Exterior': 0,
    },
  });
});

test('flags title opportunities and level-specific Working requirements', () => {
  const summary = { registrationNumber: '12345', dogName: 'Magic', breed: 'All Canadian', qualifyingCounts: {
    'Started|Container': 1, 'Started|Interior': 1, 'Started|Exterior': 0,
    'Advanced|Container': 1, 'Advanced|Interior': 1, 'Advanced|Exterior': 1,
  } };
  const flags = titleHistoryFlags(summary, [
    { level: 'Started', component: 'Exterior', stream: 'Amateur' },
    { level: 'Advanced', component: 'Container', stream: 'Amateur' },
  ]);
  assert.ok(flags.some((flag) => /complete Started title/.test(flag)));
  assert.ok(flags.some((flag) => /Advanced has already titled/.test(flag)));
});

test('identifies Amateur entries at levels already completed in official history', () => {
  const summary = { registrationNumber: '12345', dogName: 'Magic', breed: 'All Canadian', qualifyingCounts: {
    'Started|Container': 1, 'Started|Interior': 1, 'Started|Exterior': 1,
    'Advanced|Container': 1, 'Advanced|Interior': 0, 'Advanced|Exterior': 1,
  } };
  assert.deepEqual(workingStreamConflicts(summary, [
    { level: 'Started', component: 'Container', stream: 'Amateur' },
    { level: 'Started', component: 'Exterior', stream: 'Working' },
    { level: 'Advanced', component: 'Container', stream: 'Amateur' },
  ]), [{ level: 'Started', components: ['Container'] }]);
});

test('calculates the maximum titles possible when all entered components pass', () => {
  const summary = { registrationNumber: '12345', dogName: 'Magic', breed: 'All Canadian', qualifyingCounts: {
    'Started|Container': 1, 'Started|Interior': 1, 'Started|Exterior': 0,
    'Advanced|Container': 0, 'Advanced|Interior': 0, 'Advanced|Exterior': 0,
    'Excellent|Container': 1, 'Excellent|Interior': 1, 'Excellent|Exterior': 1,
  } };
  assert.deepEqual(possibleTitleAwards(summary, [
    { level: 'Started', component: 'Exterior' },
    { level: 'Advanced', component: 'Container' },
    { level: 'Advanced', component: 'Interior' },
    { level: 'Advanced', component: 'Exterior' },
    { level: 'Elite', component: 'Container' },
    { level: 'Elite', component: 'Interior' },
    { level: 'Elite', component: 'Exterior' },
  ]).map((award) => award.title), ['Started title', 'Special Advanced title', 'Elite title']);
});
