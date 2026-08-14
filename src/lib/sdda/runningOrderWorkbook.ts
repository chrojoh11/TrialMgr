import XLSX from 'xlsx-js-style';
import { SDDA_COMPONENTS, SDDA_LEVELS } from './offerings';
import type { SddaTrialWorkspace } from './trialRepository';

const LEVEL_COLORS: Record<string, string> = {
  Started: '367353',
  Advanced: '536DB1',
  Excellent: '9B433D',
  Elite: '63398D',
};
const THIN_BOTTOM = { bottom: { style: 'thin', color: { rgb: 'D9DDD9' } } };
const SOLID = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });

function dayLabel(date: string, dayNumber: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.valueOf())
    ? `Day ${dayNumber}`
    : parsed.toLocaleDateString('en-CA', { weekday: 'long', timeZone: 'UTC' });
}

function streamCode(stream: unknown) {
  return String(stream || '')
    .toLowerCase()
    .startsWith('a')
    ? 'A'
    : 'W';
}

function formalAlert(run: any) {
  const entry = Array.isArray(run.sdda_entries) ? run.sdda_entries[0] : run.sdda_entries;
  const alert = String(entry?.formal_alerts || '').trim();
  return alert ? `⚠ ${alert}` : '';
}

export function buildSddaRunningOrderWorkbook(trial: SddaTrialWorkspace, runs: any[]) {
  const wb = XLSX.utils.book_new();
  wb.Props = { Author: 'SDDA TrialDesk', Company: 'SDDA', Title: `${trial.name} running orders` };

  for (const day of [...trial.sdda_trial_days].sort((a, b) => a.day_number - b.day_number)) {
    const label = dayLabel(day.trial_date, day.day_number);
    const dayRuns = runs.filter((run) => run.trial_day_id === day.id);
    const rows: any[][] = [
      [`${label} Runs`],
      [],
      [
        `Trial # ${day.sdda_trial_number || ''}`,
        '',
        '',
        '',
        '',
        `Date ${day.trial_date}`,
        '',
        '',
        '',
        '',
        `Venue ${trial.venue || ''}`,
        '',
        '',
        'Judge',
        day.judge_name || '',
      ],
    ];
    rows[0][13] = `DAY TOTAL\n${dayRuns.length} RUNS`;
    const merges: XLSX.Range[] = [
      XLSX.utils.decode_range('A1:M2'),
      XLSX.utils.decode_range('N1:O2'),
      XLSX.utils.decode_range('A3:E3'),
      XLSX.utils.decode_range('F3:J3'),
      XLSX.utils.decode_range('K3:M3'),
    ];
    const sectionRows: Array<{
      banner: number;
      header: number;
      total: number;
      level: string;
      data: number[];
    }> = [];

    for (const level of SDDA_LEVELS) {
      const lists = SDDA_COMPONENTS.map((component) =>
        dayRuns
          .filter((run) => run.level === level && run.component === component)
          .sort(
            (a, b) =>
              (a.running_position ?? Number.MAX_SAFE_INTEGER) -
              (b.running_position ?? Number.MAX_SAFE_INTEGER)
          )
      );
      if (lists.every((list) => !list.length)) continue;

      rows.push([]);
      const banner = rows.length;
      rows.push([`${label} — ${level}`]);
      rows[banner][13] = `Class total: ${lists.reduce((sum, list) => sum + list.length, 0)} runs`;
      merges.push(
        { s: { r: banner, c: 0 }, e: { r: banner, c: 12 } },
        { s: { r: banner, c: 13 }, e: { r: banner, c: 14 } }
      );

      const header = rows.length;
      rows.push([]);
      SDDA_COMPONENTS.forEach((component, index) => {
        const start = index * 5;
        rows[header][start] = component;
        rows[header][start + 3] = lists[index].length;
        merges.push({ s: { r: header, c: start }, e: { r: header, c: start + 2 } });
      });

      const dataRows: number[] = [];
      const maxRows = Math.max(1, ...lists.map((list) => list.length));
      for (let index = 0; index < maxRows; index++) {
        const rowIndex = rows.length;
        rows.push([]);
        dataRows.push(rowIndex);
        lists.forEach((list, componentIndex) => {
          const run = list[index];
          if (!run) return;
          const start = componentIndex * 5;
          const entry = Array.isArray(run.sdda_entries) ? run.sdda_entries[0] : run.sdda_entries;
          const dog = Array.isArray(entry?.sdda_dogs) ? entry.sdda_dogs[0] : entry?.sdda_dogs;
          rows[rowIndex][start] = run.running_position ?? index + 1;
          rows[rowIndex][start + 1] = `${dog?.call_name || ''}\n${entry?.handler_name || ''}`;
          rows[rowIndex][start + 2] = streamCode(run.stream);
          rows[rowIndex][start + 3] = run.run_group;
          rows[rowIndex][start + 4] = formalAlert(run);
        });
      }

      const total = rows.length;
      rows.push([]);
      SDDA_COMPONENTS.forEach((component, index) => {
        const start = index * 5;
        rows[total][start] = `${component} total`;
        rows[total][start + 3] = lists[index].length;
        merges.push({ s: { r: total, c: start }, e: { r: total, c: start + 2 } });
      });
      sectionRows.push({ banner, header, total, level, data: dataRows });
    }

    rows.push([]);
    const grand = rows.length;
    rows.push([`${label} grand total`]);
    rows[grand][13] = `${dayRuns.length} runs`;
    merges.push(
      { s: { r: grand, c: 0 }, e: { r: grand, c: 12 } },
      { s: { r: grand, c: 13 }, e: { r: grand, c: 14 } }
    );

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!ref'] = `A1:O${rows.length}`;
    ws['!merges'] = merges;
    ws['!cols'] = [4, 19, 8, 14, 4, 4, 19, 8, 14, 4, 4, 19, 8, 14, 4].map((wch) => ({
      wch,
    }));
    ws['!rows'] = rows.map(() => ({ hpt: 20 }));
    ws['!rows'][0] = { hpt: 24 };
    ws['!rows'][1] = { hpt: 24 };
    ws['!rows'][2] = { hpt: 22 };
    ws['!freeze'] = { xSplit: 0, ySplit: 2 };
    ws['!sheetViews'] = [{ showGridLines: false, pane: { ySplit: 2, state: 'frozen' } }];
    ws['!pageSetup'] = {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    };
    ws['!margins'] = {
      left: 0.2,
      right: 0.2,
      top: 0.35,
      bottom: 0.35,
      header: 0.15,
      footer: 0.15,
    };
    ws['!headerFooter'] = {
      oddFooter: '&LGenerated by SDDA TrialDesk&C&P of &N&RSDDA Rule Book v5.1 — July 2026',
    };

    for (let row = 0; row <= grand; row++) {
      for (let column = 0; column < 15; column++) {
        const address = XLSX.utils.encode_cell({ r: row, c: column });
        if (!ws[address]) ws[address] = { t: 's', v: '' };
        ws[address].s = {
          fill: SOLID('FFFFFF'),
          font: { name: 'Arial', sz: 9, color: { rgb: '18231D' } },
          alignment: { vertical: 'center' },
        };
      }
    }

    for (const row of [0, 1]) {
      for (let column = 0; column < 15; column++) {
        ws[XLSX.utils.encode_cell({ r: row, c: column })].s = { fill: SOLID('225F45') };
      }
    }
    ws.A1.s = {
      fill: SOLID('225F45'),
      font: { name: 'Georgia', sz: 22, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { vertical: 'center' },
    };
    ws.N1.s = {
      fill: SOLID('225F45'),
      font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'right', vertical: 'center', wrapText: true },
    };
    for (let column = 0; column < 15; column++) {
      ws[XLSX.utils.encode_cell({ r: 2, c: column })].s = {
        fill: SOLID('FFFFFF'),
        font: { name: 'Arial', sz: 9, bold: true, color: { rgb: '68736C' } },
        alignment: { vertical: 'center' },
      };
    }

    for (const section of sectionRows) {
      ws['!rows'][section.banner] = { hpt: 31 };
      ws['!rows'][section.header] = { hpt: 29 };
      ws['!rows'][section.total] = { hpt: 24 };
      for (let column = 0; column < 15; column++) {
        const bannerCell = ws[XLSX.utils.encode_cell({ r: section.banner, c: column })];
        bannerCell.s = {
          fill: SOLID(LEVEL_COLORS[section.level]),
          font: { name: 'Georgia', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
          alignment: { vertical: 'center' },
        };
        const headerCell = ws[XLSX.utils.encode_cell({ r: section.header, c: column })];
        headerCell.s = {
          fill: SOLID(column % 5 === 4 ? 'FFFFFF' : 'F5F4EF'),
          font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '183126' } },
          alignment: { vertical: 'center', horizontal: column % 5 === 3 ? 'right' : undefined },
          border: column % 5 === 4 ? {} : THIN_BOTTOM,
        };
        const totalCell = ws[XLSX.utils.encode_cell({ r: section.total, c: column })];
        totalCell.s = {
          fill: SOLID(column % 5 === 4 ? 'FFFFFF' : 'E8ECE7'),
          font: { name: 'Arial', sz: 9, bold: true, color: { rgb: '225F45' } },
          alignment: { vertical: 'center', horizontal: column % 5 === 3 ? 'right' : undefined },
          border: column % 5 === 4 ? {} : { top: { style: 'medium', color: { rgb: 'C5CCC6' } } },
        };
      }
      ws[XLSX.utils.encode_cell({ r: section.banner, c: 13 })].s = {
        fill: SOLID(LEVEL_COLORS[section.level]),
        font: { name: 'Arial', sz: 9, bold: true, color: { rgb: 'FFFFFF' } },
        alignment: { horizontal: 'right', vertical: 'center' },
      };

      for (const row of section.data) {
        ws['!rows'][row] = { hpt: 34 };
        for (let component = 0; component < 3; component++) {
          const start = component * 5;
          const streamAddress = XLSX.utils.encode_cell({ r: row, c: start + 2 });
          const stream = String(ws[streamAddress]?.v || '');
          const styles = [
            {
              fill: SOLID('FFFFFF'),
              font: { name: 'Arial', sz: 9, bold: true, color: { rgb: '68736C' } },
              alignment: { vertical: 'center' },
              border: THIN_BOTTOM,
            },
            {
              fill: SOLID('FFFFFF'),
              font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '18231D' } },
              alignment: { vertical: 'center', wrapText: true },
              border: THIN_BOTTOM,
            },
            {
              fill: SOLID(stream === 'A' ? 'DFEADF' : 'F4E7D1'),
              font: {
                name: 'Arial',
                sz: 9,
                bold: true,
                color: { rgb: stream === 'A' ? '24593F' : '805821' },
              },
              alignment: { horizontal: 'center', vertical: 'center' },
              border: THIN_BOTTOM,
            },
            {
              fill: SOLID('FFFFFF'),
              font: { name: 'Arial', sz: 9, color: { rgb: '35443A' } },
              alignment: { vertical: 'center' },
              border: THIN_BOTTOM,
            },
            {
              fill: SOLID('FFFFFF'),
              font: { name: 'Arial', sz: 8, color: { rgb: '9B433D' } },
              alignment: { vertical: 'center' },
              border: THIN_BOTTOM,
            },
          ];
          styles.forEach((style, offset) => {
            ws[XLSX.utils.encode_cell({ r: row, c: start + offset })].s = style;
          });
        }
      }
    }

    ws['!rows'][grand] = { hpt: 29 };
    for (let column = 0; column < 15; column++) {
      ws[XLSX.utils.encode_cell({ r: grand, c: column })].s = {
        fill: SOLID('225F45'),
        font: { name: 'Georgia', sz: 13, bold: true, color: { rgb: 'FFFFFF' } },
        alignment: { vertical: 'center', horizontal: column >= 13 ? 'right' : undefined },
      };
    }

    XLSX.utils.book_append_sheet(wb, ws, `${label} Runs`);
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true }) as ArrayBuffer;
}
