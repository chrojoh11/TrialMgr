import assert from 'node:assert/strict';
import test from 'node:test';
import { rankSddaGameResults, rankSddaScentResults } from './results';

test('ranks complete qualifying Scent runs by score then time and excludes FEO', () => {
  const ranked = rankSddaScentResults([
    { id: 'slow', result: 'qualifying', score: 100, timeSeconds: 25, runGroup: 'Regular' },
    { id: 'fast', result: 'qualifying', score: 100, timeSeconds: 20, runGroup: 'Regular' },
    { id: 'lower', result: 'qualifying', score: 95, timeSeconds: 10, runGroup: 'Official' },
    { id: 'feo', result: 'qualifying', score: 101, timeSeconds: 5, runGroup: 'FEO' },
    { id: 'nq', result: 'non_qualifying', score: 100, timeSeconds: 4, runGroup: 'Regular' },
  ]);
  assert.deepEqual(ranked.map(({ id, placement }) => [id, placement]), [['fast', 1], ['slow', 2], ['lower', 3]]);
});

test('uses competition ranking for exact Scent ties', () => {
  const ranked = rankSddaScentResults([
    { id: 'a', result: 'qualifying', score: 100, timeSeconds: 20, runGroup: 'Regular' },
    { id: 'b', result: 'qualifying', score: 100, timeSeconds: 20, runGroup: 'Regular' },
    { id: 'c', result: 'qualifying', score: 90, timeSeconds: 18, runGroup: 'Regular' },
  ]);
  assert.deepEqual(ranked.map(({ placement }) => placement), [1, 1, 3]);
});

test('ranks passed Games runs by time and excludes incomplete and FEO runs', () => {
  const ranked = rankSddaGameResults([
    { id: 'b', result: 'pass', timeSeconds: 12, entryType: 'Regular' },
    { id: 'a', result: 'pass', timeSeconds: 10, entryType: 'Regular' },
    { id: 'feo', result: 'pass', timeSeconds: 5, entryType: 'FEO' },
    { id: 'missing', result: 'pass', timeSeconds: null, entryType: 'Regular' },
  ]);
  assert.deepEqual(ranked.map(({ id, placement }) => [id, placement]), [['a', 1], ['b', 2]]);
});
