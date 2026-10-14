import assert from 'node:assert/strict';
import test from 'node:test';
import { rankSddaGameResults, rankSddaHighInTrial, rankSddaScentResults } from './results';

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

test('ranks High in Trial across all three components by score percentage then time percentage', () => {
  const runs = [
    ['started-fast', 'Started', 'Container', 30, 60], ['started-fast', 'Started', 'Interior', 40, 100], ['started-fast', 'Started', 'Exterior', 30, 100],
    ['advanced', 'Advanced', 'Container', 60, 70], ['advanced', 'Advanced', 'Interior', 80, 120], ['advanced', 'Advanced', 'Exterior', 60, 120],
    ['started-slow', 'Started', 'Container', 30, 100], ['started-slow', 'Started', 'Interior', 40, 150], ['started-slow', 'Started', 'Exterior', 30, 150],
  ].map(([dogId, level, component, score, timeSeconds], index) => ({
    id: String(index), dogId: String(dogId), dayNumber: 1, level: String(level), component: String(component),
    result: 'qualifying', score: Number(score), timeSeconds: Number(timeSeconds), runGroup: index === 1 ? 'Official' : 'Regular',
  }));
  const ranked = rankSddaHighInTrial(runs);
  assert.deepEqual(ranked.map(({ dogId, placement }) => [dogId, placement]), [['started-fast', 1], ['advanced', 2], ['started-slow', 3]]);
});

test('High in Trial combines streams but requires three qualifying components and excludes Elite and FEO', () => {
  const base = { dayNumber: 1, level: 'Started', result: 'qualifying', score: 30, timeSeconds: 30, runGroup: 'Regular' };
  const ranked = rankSddaHighInTrial([
    { ...base, id: '1', dogId: 'eligible', component: 'Container' },
    { ...base, id: '2', dogId: 'eligible', component: 'Interior', score: 40 },
    { ...base, id: '3', dogId: 'eligible', component: 'Exterior' },
    { ...base, id: '4', dogId: 'incomplete', component: 'Container' },
    { ...base, id: '5', dogId: 'incomplete', component: 'Interior' },
    { ...base, id: '6', dogId: 'nq', component: 'Container' },
    { ...base, id: '7', dogId: 'nq', component: 'Interior', score: 40 },
    { ...base, id: '8', dogId: 'nq', component: 'Exterior', result: 'non_qualifying' },
    { ...base, id: '9', dogId: 'feo', component: 'Container', runGroup: 'FEO' },
    { ...base, id: '10', dogId: 'feo', component: 'Interior', score: 40, runGroup: 'FEO' },
    { ...base, id: '11', dogId: 'feo', component: 'Exterior', runGroup: 'FEO' },
    { ...base, id: '12', dogId: 'elite', level: 'Elite', component: 'Container' },
    { ...base, id: '13', dogId: 'elite', level: 'Elite', component: 'Interior', score: 40 },
    { ...base, id: '14', dogId: 'elite', level: 'Elite', component: 'Exterior' },
  ]);
  assert.deepEqual(ranked.map(({ dogId }) => dogId), ['eligible']);
});

test('High in Trial placements restart on each trial day', () => {
  const rows = [1, 2].flatMap((dayNumber) => ['Container', 'Interior', 'Exterior'].map((component, index) => ({
    id: `${dayNumber}-${component}`, dogId: `dog-${dayNumber}`, dayNumber, level: 'Started', component,
    result: 'qualifying', score: component === 'Interior' ? 40 : 30, timeSeconds: 30 + index, runGroup: 'Regular',
  })));
  assert.deepEqual(rankSddaHighInTrial(rows).map(({ dayNumber, placement }) => [dayNumber, placement]), [[1, 1], [2, 1]]);
});
