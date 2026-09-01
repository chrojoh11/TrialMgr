import assert from 'node:assert/strict';
import test from 'node:test';
import { toPdfStandardText } from './pdfText';

test('converts multiline and Unicode entry data to PDF standard-font text', () => {
  assert.equal(
    toPdfStandardText('People\nDogs — “José’s note” 🐾'),
    'People Dogs - "Jose\'s note"'
  );
});
