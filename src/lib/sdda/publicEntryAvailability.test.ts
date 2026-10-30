import assert from 'node:assert/strict';
import test from 'node:test';
import { publicEntryAvailability } from './publicEntryAvailability';

const now = new Date('2026-10-30T18:00:00Z').getTime();

test('keeps a completed or elapsed trial closed instead of reloading it', () => {
  assert.equal(publicEntryAvailability({ status: 'completed' }, now), 'closed');
  assert.equal(
    publicEntryAvailability(
      { status: 'entries_open', entry_open_at: '2026-10-01T16:00:00Z', entry_close_at: '2026-10-13T04:00:00Z' },
      now
    ),
    'closed'
  );
});

test('reloads only when an open trial reaches its scheduled opening', () => {
  assert.equal(
    publicEntryAvailability(
      { status: 'entries_open', entry_open_at: '2026-11-01T16:00:00Z' },
      now
    ),
    'upcoming'
  );
  assert.equal(
    publicEntryAvailability(
      { status: 'entries_open', entry_open_at: '2026-10-01T16:00:00Z' },
      now
    ),
    'open'
  );
  assert.equal(publicEntryAvailability({ status: 'draft' }, now), 'unavailable');
});
