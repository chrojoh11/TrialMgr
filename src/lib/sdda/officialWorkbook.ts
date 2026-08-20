import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { SddaComponent, SddaLevel, SddaStream } from './offerings';

export type OfficialWorkbookDay = {
  dayNumber: number;
  trialNumber: string;
  trialDate: string;
  judgeName?: string;
};

export type OfficialWorkbookRun = {
  dayNumber: number;
  level: SddaLevel;
  component: SddaComponent;
  stream: SddaStream;
  dogNumber: string;
  runGroup: string;
  result?: 'qualifying' | 'non_qualifying' | 'absent' | 'withdrawn' | 'excused';
  score?: number | null;
  timeSeconds?: number | null;
};

export type OfficialWorkbookInput = {
  days: OfficialWorkbookDay[];
  venue: string;
  trialEmail?: string;
  defaultJudge?: string;
  runs: OfficialWorkbookRun[];
};

const SCORE_COLUMNS: Record<SddaLevel, Record<SddaComponent, { score: number; time: number }>> = {
  Started: { Container: { score: 6, time: 7 }, Interior: { score: 14, time: 15 }, Exterior: { score: 22, time: 23 } },
  Advanced: { Container: { score: 6, time: 7 }, Interior: { score: 14, time: 15 }, Exterior: { score: 22, time: 23 } },
  Excellent: { Container: { score: 6, time: 7 }, Interior: { score: 14, time: 15 }, Exterior: { score: 22, time: 23 } },
  Elite: { Container: { score: 5, time: 6 }, Interior: { score: 13, time: 14 }, Exterior: { score: 21, time: 22 } },
};

function xmlEscape(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function columnName(index: number) {
  let value = index + 1;
  let result = '';
  while (value) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function excelDate(iso: string) {
  return iso ? Date.parse(`${iso}T00:00:00Z`) / 86400000 + 25569 : '';
}

function cellValue(run: OfficialWorkbookRun): string | number {
  if (run.runGroup === 'FEO') return 'FEO';
  if (!run.result) return 'E';
  if (run.result === 'excused' || run.result === 'withdrawn') return 'E';
  if (run.result === 'absent') return 'NE';
  return run.score ?? '';
}

export function buildOfficialSddaWorkbook(template: Uint8Array, input: OfficialWorkbookInput) {
  if (!input.days.length || input.days.length > 2) throw new Error('An official SDDA workbook must contain one or two trial days.');
  const files = unzipSync(template);
  const workbookPath = 'xl/workbook.xml';
  const relationshipsPath = 'xl/_rels/workbook.xml.rels';
  let workbookXml = strFromU8(files[workbookPath]);
  const relationshipXml = strFromU8(files[relationshipsPath]);
  const relationshipTargets = new Map<string, string>();
  for (const match of relationshipXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/?\s*>/g)) relationshipTargets.set(match[1], match[2]);
  const sheetPaths = new Map<string, string>();
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"[^>]*\/?\s*>/g)) {
    const target = relationshipTargets.get(match[2]);
    if (target) sheetPaths.set(match[1], target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\.\//, '')}`);
  }
  const names = new Map<string, string>();
  for (const match of workbookXml.matchAll(/<definedName\b[^>]*\bname="([^"]+)"[^>]*>([^<]*)<\/definedName>/g)) names.set(match[1], match[2]);
  const changedSheets = new Map<string, string>();
  const sheetXml = (name: string) => {
    if (changedSheets.has(name)) return changedSheets.get(name)!;
    const path = sheetPaths.get(name);
    if (!path || !files[path]) throw new Error(`The official workbook is missing the ${name} sheet.`);
    return strFromU8(files[path]);
  };
  const setCell = (sheet: string, address: string, value: string | number, time = false) => {
    let xml = sheetXml(sheet);
    const row = Number(address.match(/\d+/)?.[0]);
    const full = new RegExp(`<c\\b([^>]*\\br="${address}"[^>]*)>(?:[\\s\\S]*?)<\\/c>`);
    const empty = new RegExp(`<c\\b([^>]*\\br="${address}"[^>]*)\\/>`);
    const existing = xml.match(full) || xml.match(empty);
    let attrs = (existing?.[1] || ` r="${address}"`).replace(/\s+t="[^"]*"/g, '');
    if (time && !/\s+s="/.test(attrs)) attrs += ' s="2"';
    const body = typeof value === 'number' ? `<v>${value}</v>` : `<is><t xml:space="preserve">${xmlEscape(value)}</t></is>`;
    if (typeof value !== 'number') attrs += ' t="inlineStr"';
    const replacement = `<c${attrs}>${body}</c>`;
    if (existing) xml = full.test(xml) ? xml.replace(full, replacement) : xml.replace(empty, replacement);
    else {
      const rowPattern = new RegExp(`(<row\\b[^>]*\\br="${row}"[^>]*>)([\\s\\S]*?)(<\\/row>)`);
      if (rowPattern.test(xml)) xml = xml.replace(rowPattern, `$1$2${replacement}$3`);
      else {
        // Blank official templates can define names for cells whose rows have not
        // been materialized yet. Add that exact row without inserting/shifting it.
        const laterRow = [...xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>/g)].find((match) => Number(match[1]) > row);
        const rowXml = `<row r="${row}">${replacement}</row>`;
        if (laterRow?.index != null) xml = `${xml.slice(0, laterRow.index)}${rowXml}${xml.slice(laterRow.index)}`;
        else xml = xml.replace('</sheetData>', `${rowXml}</sheetData>`);
      }
    }
    changedSheets.set(sheet, xml);
  };
  const setName = (name: string, value: string | number) => {
    const reference = names.get(name)?.match(/^'([^']+)'!\$([A-Z]+)\$(\d+)$/);
    if (reference) setCell(reference[1], `${reference[2]}${reference[3]}`, value);
  };

  setName('TrialNumber', input.days[0].trialNumber);
  setName('TrialDate', excelDate(input.days[0].trialDate));
  setName('TrialNumberDay2', input.days[1]?.trialNumber || '');
  setName('TrialDateDay2', input.days[1] ? excelDate(input.days[1].trialDate) : '');
  setName('TrialVenue', input.venue);
  setName('TrialEmailDay1', input.trialEmail || '');
  setName('TrialEmailDay2', input.days[1] ? input.trialEmail || '' : '');
  for (const [index, day] of input.days.entries()) {
    const judge = day.judgeName || input.defaultJudge;
    if (!judge) continue;
    for (const name of names.keys()) {
      if (new RegExp(`^JudgeD${index + 1}(CSS|ISS|ESS|CSA|ISA|ESA|CSE|ISE|ESE|CSL|ISL|ESL)$`).test(name)) setName(name, judge);
    }
  }

  for (const level of ['Started', 'Advanced', 'Excellent', 'Elite'] as SddaLevel[]) {
    for (const day of input.days) {
      const byDogAndStream = new Map<string, OfficialWorkbookRun[]>();
      for (const run of input.runs.filter((item) => item.level === level && item.dayNumber === day.dayNumber)) {
        const key = `${run.dogNumber}|${run.stream}`;
        byDogAndStream.set(key, [...(byDogAndStream.get(key) || []), run]);
      }
      let row = day === input.days[0] ? 5 : level === 'Started' || level === 'Elite' ? 45 : 65;
      const maximum = level === 'Started' || level === 'Elite' ? 30 : 50;
      if (byDogAndStream.size > maximum) throw new Error(`${level} day ${day.dayNumber} exceeds the official workbook capacity of ${maximum} rows.`);
      for (const runs of byDogAndStream.values()) {
        const first = runs[0];
        setCell(level, `B${row}`, level === 'Elite' ? 'W' : first.stream === 'Working' ? 'W' : 'A');
        setCell(level, `C${row}`, /^\d+$/.test(first.dogNumber) ? Number(first.dogNumber) : first.dogNumber);
        for (const run of runs) {
          const columns = SCORE_COLUMNS[level][run.component];
          const value = cellValue(run);
          if (value !== '') setCell(level, `${columnName(columns.score)}${row}`, value);
          if (run.timeSeconds != null) setCell(level, `${columnName(columns.time)}${row}`, run.timeSeconds / 86400, true);
        }
        row += 1;
      }
    }
  }

  for (const [name, xml] of changedSheets) files[sheetPaths.get(name)!] = strToU8(xml);
  workbookXml = workbookXml.replace(/<calcPr\b([^>]*)\/>/, (_match, attrs: string) => `<calcPr${attrs.replace(/\s+(fullCalcOnLoad|forceFullCalc)="[^"]*"/g, '')} fullCalcOnLoad="1" forceFullCalc="1"/>`);
  files[workbookPath] = strToU8(workbookXml);
  return zipSync(files, { level: 6 });
}
