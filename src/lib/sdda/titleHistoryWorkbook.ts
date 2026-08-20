import * as XLSX from 'xlsx';

export const SDDA_HISTORY_LEVELS = ['Started', 'Advanced', 'Excellent'] as const;
export const SDDA_HISTORY_COMPONENTS = ['Container', 'Interior', 'Exterior'] as const;
export type SddaHistoryLevel = (typeof SDDA_HISTORY_LEVELS)[number];
export type SddaHistoryComponent = (typeof SDDA_HISTORY_COMPONENTS)[number];

export interface SddaDogHistorySummary {
  registrationNumber: string;
  dogName: string;
  breed: string;
  qualifyingCounts: Record<string, number>;
}

export interface SddaHistoryWorkbook {
  dogs: SddaDogHistorySummary[];
  refreshedAt: string;
}

const clean = (value: unknown) => String(value ?? '').trim();

export function parseSddaHistoryWorkbook(buffer: ArrayBuffer): SddaHistoryWorkbook {
  const workbook = XLSX.read(buffer, { type: 'array', cellFormula: true });
  const sheet = workbook.Sheets['SDDA Dogs'];
  if (!sheet) throw new Error('The official workbook does not contain the SDDA Dogs sheet.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  const dogs = rows.slice(1).flatMap((row) => {
    const registrationNumber = clean(row[0]);
    if (!registrationNumber) return [];
    const counts: Record<string, number> = {};
    SDDA_HISTORY_LEVELS.forEach((level, levelIndex) => {
      SDDA_HISTORY_COMPONENTS.forEach((component, componentIndex) => {
        counts[`${level}|${component}`] = Math.max(0, Number(row[6 + levelIndex * 3 + componentIndex]) || 0);
      });
    });
    return [{ registrationNumber, dogName: clean(row[1]), breed: clean(row[2]), qualifyingCounts: counts }];
  });
  const info = workbook.Sheets['Trial Info'];
  return { dogs, refreshedAt: clean(info?.J1?.v) };
}

export function titleHistoryFlags(summary: SddaDogHistorySummary, enteredRuns: Array<{ level: string; component: string; stream?: string }>) {
  const flags: string[] = [];
  for (const level of SDDA_HISTORY_LEVELS) {
    const counts = SDDA_HISTORY_COMPONENTS.map((component) => summary.qualifyingCounts[`${level}|${component}`] || 0);
    const entered = new Set(enteredRuns.filter((run) => run.level === level).map((run) => run.component));
    const missingEntered = SDDA_HISTORY_COMPONENTS.filter((component, index) => counts[index] === 0 && entered.has(component));
    if (counts.filter((count) => count > 0).length === 2 && missingEntered.length === 1)
      flags.push(`Can complete ${level} title by qualifying in ${missingEntered[0]}.`);
    if (counts.every((count) => count === 0) && SDDA_HISTORY_COMPONENTS.every((component) => entered.has(component)))
      flags.push(`Special ${level} title opportunity if all three components qualify at this trial.`);
    const titlingScores = Math.min(...counts);
    if (titlingScores > 0) flags.push(`${level}: ${titlingScores} historical titling score${titlingScores === 1 ? '' : 's'}.`);
    if (counts.every((count) => count > 0) && enteredRuns.some((run) => run.level === level && run.stream?.toLowerCase() === 'amateur'))
      flags.push(`${level} has already titled: continued entries at this level must be Working after SDDA processes the title.`);
  }
  if (enteredRuns.some((run) => run.level === 'Elite'))
    flags.push('Elite requires all three components to qualify at the same trial; Elite has no stream.');
  return flags;
}
