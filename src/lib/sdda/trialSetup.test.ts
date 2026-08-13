import assert from 'node:assert/strict';
import test from 'node:test';
import { formatSddaTrialStatus, validateSddaTrialSetup } from './trialSetup';

test('normalizes and orders one-to-four SDDA trial days', () => {
  const result = validateSddaTrialSetup({
    name: '  Fall Scent Trial  ',
    hostClub: ' SDDA Club ',
    dates: ['2026-10-04', '2026-10-03', '2026-10-03'],
  });
  assert.deepEqual(result.dates, ['2026-10-03', '2026-10-04']);
  assert.equal(result.name, 'Fall Scent Trial');
});

test('rejects zero or more than four trial days', () => {
  assert.throws(
    () => validateSddaTrialSetup({ name: 'Trial', hostClub: 'Club', dates: [] }),
    /one and four/,
  );
  assert.throws(
    () => validateSddaTrialSetup({
      name: 'Trial',
      hostClub: 'Club',
      dates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'],
    }),
    /one and four/,
  );
});

test('formats SDDA database statuses for secretaries', () => {
  assert.equal(formatSddaTrialStatus('entries_open'), 'Entries Open');
});
