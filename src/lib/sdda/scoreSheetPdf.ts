import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { SddaComponent, SddaLevel, SddaStream } from './offerings';

type Field = [number, number, number];
type SheetFields = {
  trial: Field;
  date: Field;
  dog: Field;
  breed: Field;
  dogNumber: Field;
  alerts?: [Field, Field];
  stream?: { y: number; amateurX: number; workingX: number; amateurY?: number; workingY?: number };
  footerY: number;
};

export type SddaScoreSheetRun = {
  id: string;
  dayNumber: number;
  trialNumber: string;
  trialDate: string;
  level: SddaLevel;
  component: SddaComponent;
  stream: SddaStream;
  dogName: string;
  breed: string;
  dogNumber: string;
  alerts?: string;
  order: number;
};

const baseFields: Record<SddaLevel, SheetFields> = {
  Started: {
    trial: [326, 109, 70],
    date: [490, 109, 82],
    dog: [90, 136, 164],
    breed: [294, 136, 118],
    dogNumber: [509, 136, 62],
    stream: { y: 170.5, amateurX: 448.5, workingX: 514, amateurY: 171.5, workingY: 171.5 },
    footerY: 781,
  },
  Advanced: {
    trial: [330, 109, 94],
    date: [500, 109, 76],
    dog: [102, 136, 290],
    breed: [438, 136, 130],
    dogNumber: [143, 163, 57],
    alerts: [
      [276, 163, 142],
      [430, 163, 145],
    ],
    stream: { y: 190, amateurX: 455, workingX: 513 },
    footerY: 781,
  },
  Excellent: {
    trial: [330, 109, 94],
    date: [500, 109, 76],
    dog: [102, 137, 290],
    breed: [438, 137, 130],
    dogNumber: [143, 164, 57],
    alerts: [
      [276, 164, 142],
      [430, 164, 145],
    ],
    stream: { y: 191, amateurX: 455, workingX: 513 },
    footerY: 781,
  },
  Elite: {
    trial: [397, 94, 35],
    date: [503, 94, 78],
    dog: [102, 121, 292],
    breed: [438, 121, 137],
    dogNumber: [143, 148, 57],
    alerts: [
      [276, 148, 137],
      [430, 148, 145],
    ],
    footerY: 660,
  },
};

export const SDDA_SCORE_SHEET_FIELDS: Record<SddaLevel, Record<SddaComponent, SheetFields>> = {
  Started: {
    Container: baseFields.Started,
    Interior: {
      trial: [326, 112, 70],
      date: [490, 112, 82],
      dog: [96, 140, 164],
      breed: [300, 140, 118],
      dogNumber: [515, 140, 62],
      stream: { y: 170, amateurX: 438.5, workingX: 504 },
      footerY: 781,
    },
    Exterior: {
      trial: [263, 112, 70],
      date: [415, 112, 82],
      dog: [96, 140, 164],
      breed: [300, 140, 118],
      dogNumber: [515, 140, 62],
      stream: { y: 171, amateurX: 439, workingX: 503 },
      footerY: 781,
    },
  },
  Advanced: {
    Container: baseFields.Advanced,
    Exterior: {
      trial: [330, 110, 94],
      date: [500, 110, 76],
      dog: [102, 138, 290],
      breed: [438, 138, 130],
      dogNumber: [143, 165, 57],
      alerts: [
        [276, 165, 142],
        [430, 165, 145],
      ],
      stream: { y: 207, amateurX: 454, workingX: 517 },
      footerY: 781,
    },
    Interior: {
      trial: [330, 123, 94],
      date: [500, 123, 76],
      dog: [102, 151, 290],
      breed: [438, 151, 130],
      dogNumber: [143, 178, 57],
      alerts: [
        [276, 178, 142],
        [430, 178, 145],
      ],
      stream: { y: 220, amateurX: 457, workingX: 520 },
      footerY: 781,
    },
  },
  Excellent: {
    Container: { ...baseFields.Excellent, stream: { y: 191, amateurX: 476, workingX: 530 } },
    Exterior: {
      trial: [330, 110, 94],
      date: [500, 110, 76],
      dog: [102, 138, 290],
      breed: [438, 138, 130],
      dogNumber: [143, 165, 57],
      alerts: [
        [276, 165, 142],
        [430, 165, 145],
      ],
      stream: { y: 193, amateurX: 467, workingX: 520 },
      footerY: 781,
    },
    Interior: {
      trial: [330, 109, 94],
      date: [500, 109, 76],
      dog: [102, 130, 290],
      breed: [438, 130, 130],
      dogNumber: [143, 151, 57],
      alerts: [
        [276, 151, 142],
        [430, 151, 145],
      ],
      stream: { y: 172, amateurX: 475, workingX: 529 },
      footerY: 781,
    },
  },
  Elite: {
    Container: baseFields.Elite,
    Exterior: {
      trial: [397, 110, 35],
      date: [503, 110, 78],
      dog: [102, 137, 292],
      breed: [438, 137, 137],
      dogNumber: [143, 165, 57],
      alerts: [
        [276, 165, 137],
        [430, 165, 145],
      ],
      footerY: 660,
    },
    Interior: {
      trial: [397, 97, 35],
      date: [503, 97, 78],
      dog: [102, 124, 292],
      breed: [438, 124, 137],
      dogNumber: [143, 151, 57],
      alerts: [
        [276, 151, 137],
        [430, 151, 145],
      ],
      footerY: 660,
    },
  },
};

export const scoreSheetTemplatePath = (level: SddaLevel, component: SddaComponent) =>
  `/templates/sdda-score-sheets/${level.toLowerCase()}-${component.toLowerCase()}.pdf`;

export const scoreSheetBackgroundPath = (level: SddaLevel, component: SddaComponent) =>
  `/templates/sdda-score-sheets-compressed/${level.toLowerCase()}-${component.toLowerCase()}.jpg`;

export async function buildSddaJudgePacket(
  runs: SddaScoreSheetRun[],
  loadTemplate: (path: string) => Promise<ArrayBuffer>
) {
  if (!runs.length) throw new Error('There are no SDDA runs to print.');
  const output = await PDFDocument.create();
  const font = await output.embedFont(StandardFonts.HelveticaBold);
  const totals = new Map<string, number>();
  const backgrounds = new Map<string, Awaited<ReturnType<typeof output.embedJpg>>>();
  runs.forEach((run) => {
    const key = `${run.dayNumber}|${run.level}|${run.component}`;
    totals.set(key, (totals.get(key) || 0) + 1);
  });

  for (const run of runs) {
    const backgroundPath = scoreSheetBackgroundPath(run.level, run.component);
    let background = backgrounds.get(backgroundPath);
    if (!background) {
      background = await output.embedJpg(await loadTemplate(backgroundPath));
      backgrounds.set(backgroundPath, background);
    }
    const page = output.addPage([612, 792]);
    page.drawImage(background, { x: 0, y: 0, width: 612, height: 792 });
    const fields = SDDA_SCORE_SHEET_FIELDS[run.level][run.component];
    const height = page.getHeight();
    const drawFit = (text: string, [x, y, maxWidth]: Field, preferredSize = 10, minSize = 7) => {
      const value = (text || '').slice(0, 80);
      let size = preferredSize;
      while (size > minSize && font.widthOfTextAtSize(value, size) > maxWidth) size -= 0.5;
      if (value)
        page.drawText(value, { x, y: height - y, size, font, color: rgb(0.08, 0.08, 0.08) });
    };
    drawFit(run.trialNumber, fields.trial);
    drawFit(run.trialDate, fields.date);
    drawFit(run.dogName, fields.dog, 10.5);
    drawFit(run.breed, fields.breed);
    drawFit(run.dogNumber, fields.dogNumber);
    if (fields.alerts) {
      const parts = (run.alerts || '').split(/[,/]/).map((item) => item.trim());
      drawFit(parts[0] || '', fields.alerts[0]);
      drawFit(parts[1] || '', fields.alerts[1]);
    }
    if (fields.stream) {
      const working = run.stream === 'Working';
      const point: Field = [
        working ? fields.stream.workingX : fields.stream.amateurX,
        working
          ? (fields.stream.workingY ?? fields.stream.y)
          : (fields.stream.amateurY ?? fields.stream.y),
        14,
      ];
      drawFit('X', point, 12, 12);
    }
    drawFit(
      `Day ${run.dayNumber} - ${run.level} ${run.component} - Run ${run.order}/${totals.get(`${run.dayNumber}|${run.level}|${run.component}`)}`,
      [36, fields.footerY, 260],
      7,
      7
    );
  }
  return output.save({ useObjectStreams: true, addDefaultPage: false });
}
