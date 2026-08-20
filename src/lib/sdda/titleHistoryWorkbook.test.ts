import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { parseSddaHistoryWorkbook, titleHistoryFlags } from './titleHistoryWorkbook';

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
