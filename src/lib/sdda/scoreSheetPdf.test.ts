import assert from 'node:assert/strict';
import test from 'node:test';
import { SDDA_COMPONENTS, SDDA_LEVELS } from './offerings';
import { SDDA_SCORE_SHEET_FIELDS, scoreSheetTemplatePath } from './scoreSheetPdf';

test('defines a dedicated official template mapping for all 12 SDDA score sheets', () => {
  for (const level of SDDA_LEVELS) for (const component of SDDA_COMPONENTS) {
    assert.ok(SDDA_SCORE_SHEET_FIELDS[level][component]);
    assert.equal(scoreSheetTemplatePath(level, component), `/templates/sdda-score-sheets/${level.toLowerCase()}-${component.toLowerCase()}.pdf`);
  }
  assert.notDeepEqual(SDDA_SCORE_SHEET_FIELDS.Started.Container, SDDA_SCORE_SHEET_FIELDS.Started.Interior);
  assert.notDeepEqual(SDDA_SCORE_SHEET_FIELDS.Advanced.Container, SDDA_SCORE_SHEET_FIELDS.Advanced.Exterior);
  assert.notDeepEqual(SDDA_SCORE_SHEET_FIELDS.Excellent.Container, SDDA_SCORE_SHEET_FIELDS.Excellent.Interior);
});
