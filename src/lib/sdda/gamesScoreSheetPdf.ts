import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { SddaGameType } from './trialRepository';

type Field = [number, number, number];
type GameFields = {
  trial: Field;
  date: Field;
  dog: Field;
  breed: Field;
  dogNumber: Field;
  partnerDog?: Field;
  partnerBreed?: Field;
  partnerNumber?: Field;
  aerialHigh?: Field;
  aerialHighfly?: Field;
  judge: Field;
  footer: Field;
};

export type SddaGameScoreSheetRun = {
  id: string;
  dayNumber: number;
  trialNumber: string;
  trialDate: string;
  gameType: SddaGameType;
  dogName: string;
  breed: string;
  dogNumber: string;
  judgeName?: string;
  entryType: 'Regular' | 'FEO';
  order: number;
  requestedTeamPartner?: string;
  partnerBreed?: string;
  partnerNumber?: string;
  aerialDivision?: 'High' | 'Highfly';
};

export const SDDA_GAME_SCORE_SHEET_FIELDS: Record<SddaGameType, GameFields> = {
  Aerial: {
    trial: [350, 132, 60],
    date: [474, 132, 100],
    dog: [102, 190, 165],
    breed: [316, 190, 126],
    dogNumber: [525, 190, 52],
    aerialHigh: [194, 241, 12],
    aerialHighfly: [255, 241, 12],
    judge: [180, 671, 130],
    footer: [36, 768, 310],
  },
  Distance: {
    trial: [350, 132, 60],
    date: [474, 132, 100],
    dog: [102, 190, 165],
    breed: [316, 190, 126],
    dogNumber: [525, 190, 52],
    judge: [180, 686, 130],
    footer: [36, 768, 310],
  },
  Speed: {
    trial: [350, 132, 60],
    date: [474, 132, 100],
    dog: [102, 190, 165],
    breed: [316, 190, 126],
    dogNumber: [525, 190, 52],
    judge: [180, 651, 130],
    footer: [36, 768, 310],
  },
  Team: {
    trial: [350, 132, 60],
    date: [474, 132, 100],
    dog: [102, 190, 165],
    breed: [316, 190, 126],
    dogNumber: [525, 190, 52],
    partnerDog: [102, 240, 165],
    partnerBreed: [316, 240, 126],
    partnerNumber: [525, 240, 52],
    judge: [180, 686, 130],
    footer: [36, 768, 310],
  },
};

export const gameScoreSheetBackgroundPath = (game: SddaGameType) =>
  `/templates/sdda-score-sheets-compressed/games-${game.toLowerCase()}.jpg`;

export async function buildSddaGamesJudgePacket(
  runs: SddaGameScoreSheetRun[],
  loadTemplate: (path: string) => Promise<ArrayBuffer>
) {
  if (!runs.length) throw new Error('There are no SDDA Games runs to print.');
  const output = await PDFDocument.create();
  const font = await output.embedFont(StandardFonts.HelveticaBold);
  const backgrounds = new Map<string, Awaited<ReturnType<typeof output.embedJpg>>>();
  const totals = new Map<string, number>();
  runs.forEach((run) => {
    const key = `${run.dayNumber}|${run.gameType}`;
    totals.set(key, (totals.get(key) || 0) + 1);
  });
  for (const run of runs) {
    const path = gameScoreSheetBackgroundPath(run.gameType);
    let background = backgrounds.get(path);
    if (!background) {
      background = await output.embedJpg(await loadTemplate(path));
      backgrounds.set(path, background);
    }
    const page = output.addPage([612, 792]);
    page.drawImage(background, { x: 0, y: 0, width: 612, height: 792 });
    const fields = SDDA_GAME_SCORE_SHEET_FIELDS[run.gameType];
    const draw = (value: string | undefined, [x, top, maxWidth]: Field, size = 10) => {
      const text = (value || '').slice(0, 100);
      let fitted = size;
      while (fitted > 6.5 && font.widthOfTextAtSize(text, fitted) > maxWidth) fitted -= 0.5;
      if (text)
        page.drawText(text, { x, y: 792 - top, size: fitted, font, color: rgb(0.06, 0.06, 0.06) });
    };
    draw(run.trialNumber, fields.trial);
    draw(run.trialDate, fields.date);
    draw(run.dogName, fields.dog, 10.5);
    draw(run.breed, fields.breed);
    draw(run.dogNumber, fields.dogNumber);
    draw(run.judgeName, fields.judge);
    if (run.gameType === 'Team') {
      draw(run.requestedTeamPartner, fields.partnerDog!);
      draw(run.partnerBreed, fields.partnerBreed!);
      draw(run.partnerNumber, fields.partnerNumber!);
    }
    if (run.gameType === 'Aerial' && run.aerialDivision)
      draw('X', run.aerialDivision === 'High' ? fields.aerialHigh! : fields.aerialHighfly!, 12);
    if (run.entryType === 'FEO') draw('FEO', [535, 75, 40], 11);
    draw(
      `Day ${run.dayNumber} - ${run.gameType} - Run ${run.order}/${totals.get(`${run.dayNumber}|${run.gameType}`)}`,
      fields.footer,
      7
    );
  }
  return output.save({ useObjectStreams: true, addDefaultPage: false });
}
