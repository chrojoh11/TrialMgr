import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScoreTime } from './scoreTime';

test('parses total seconds', () => {
  assert.equal(parseScoreTime('72.77'), 72.77);
  assert.equal(parseScoreTime('151.27'), 151.27);
});

test('parses judge-style minute and second times', () => {
  assert.equal(parseScoreTime('1:12.77'), 72.77);
  assert.equal(parseScoreTime('2:31.27'), 151.27);
});

test('accepts blank and rejects malformed time values', () => {
  assert.equal(parseScoreTime(''), null);
  assert.equal(Number.isNaN(parseScoreTime('1:72.77')!), true);
  assert.equal(Number.isNaN(parseScoreTime('1:12:77')!), true);
});
