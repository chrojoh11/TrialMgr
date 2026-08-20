import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import {
  buildSddaGamesJudgePacket,
  gameScoreSheetBackgroundPath,
  SDDA_GAME_SCORE_SHEET_FIELDS,
  type SddaGameScoreSheetRun,
} from './gamesScoreSheetPdf';
import { SDDA_GAME_TYPES } from './trialRepository';

test('defines four independent official Games sheet mappings', () => {
  for (const game of SDDA_GAME_TYPES) {
    assert.ok(SDDA_GAME_SCORE_SHEET_FIELDS[game]);
    assert.ok(SDDA_GAME_SCORE_SHEET_FIELDS[game].feo);
    assert.equal(
      gameScoreSheetBackgroundPath(game),
      `/templates/sdda-score-sheets-compressed/games-${game.toLowerCase()}.jpg`
    );
  }

  assert.ok(SDDA_GAME_SCORE_SHEET_FIELDS.Aerial.aerialHigh);
  assert.ok(SDDA_GAME_SCORE_SHEET_FIELDS.Aerial.aerialHighfly);
  assert.ok(SDDA_GAME_SCORE_SHEET_FIELDS.Team.partnerDog);
  assert.ok(SDDA_GAME_SCORE_SHEET_FIELDS.Team.partnerBreed);
  assert.ok(SDDA_GAME_SCORE_SHEET_FIELDS.Team.partnerNumber);
  assert.notDeepEqual(SDDA_GAME_SCORE_SHEET_FIELDS.Aerial, SDDA_GAME_SCORE_SHEET_FIELDS.Speed);
  assert.notDeepEqual(SDDA_GAME_SCORE_SHEET_FIELDS.Distance, SDDA_GAME_SCORE_SHEET_FIELDS.Team);
});

test('builds one official prefilled page per Games run', async () => {
  const base = {
    id: 'sample',
    dayNumber: 1,
    trialNumber: '3141',
    trialDate: '2026-07-19',
    dogName: 'Prairie Star',
    breed: 'All Canadian',
    dogNumber: 'SD-123456',
    judgeName: 'SDDA Judge',
    entryType: 'Regular' as const,
    order: 1,
  };
  const runs: SddaGameScoreSheetRun[] = [
    { ...base, id: 'a', gameType: 'Aerial', aerialDivision: 'Highfly' },
    { ...base, id: 'd', gameType: 'Distance' },
    { ...base, id: 's', gameType: 'Speed', entryType: 'FEO' },
    {
      ...base,
      id: 't',
      gameType: 'Team',
      requestedTeamPartner: 'Partner Dog',
      partnerBreed: 'All Canadian',
      partnerNumber: 'SD-654321',
    },
  ];

  const bytes = await buildSddaGamesJudgePacket(runs, async (path) => {
    const file = await readFile(`public${path}`);
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  });
  const packet = await PDFDocument.load(bytes);

  assert.equal(packet.getPageCount(), 4);
  assert.ok(
    bytes.byteLength < 5_000_000,
    `expected compressed packet, got ${bytes.byteLength} bytes`
  );
});
