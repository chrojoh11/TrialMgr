import * as XLSX from 'xlsx-js-style';
import { SDDA_COMPONENTS, SDDA_LEVELS } from './offerings';
import type { SddaTrialWorkspace } from './trialRepository';
const colors: Record<string, string> = {
  Started: '367353',
  Advanced: '536DB1',
  Excellent: '9B433D',
  Elite: '63398D',
};
export function buildSddaRunningOrderWorkbook(trial: SddaTrialWorkspace, runs: any[]) {
  const wb = XLSX.utils.book_new();
  for (const day of [...trial.sdda_trial_days].sort((a, b) => a.day_number - b.day_number)) {
    const dr = runs.filter((r) => r.trial_day_id === day.id);
    const rows: any[][] = [
      [`Day ${day.day_number} Runs`],
      [],
      [
        `Trial # ${day.sdda_trial_number || trial.name}`,
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
        `Judge`,
        day.judge_name || '',
      ],
    ];
    const merges: any[] = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 12 } },
      { s: { r: 0, c: 13 }, e: { r: 1, c: 14 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
      { s: { r: 2, c: 5 }, e: { r: 2, c: 9 } },
      { s: { r: 2, c: 10 }, e: { r: 2, c: 12 } },
    ];
    rows[0][13] = `DAY TOTAL\n${dr.length} RUNS`;
    for (const level of SDDA_LEVELS) {
      const lists = SDDA_COMPONENTS.map((component) =>
        dr
          .filter((r) => r.level === level && r.component === component)
          .sort((a, b) => (a.running_position ?? 9999) - (b.running_position ?? 9999))
      );
      if (lists.every((l) => !l.length)) continue;
      rows.push([]);
      const br = rows.length;
      rows.push([`Day ${day.day_number} - ${level}`]);
      rows[br][13] = `Class total: ${lists.reduce((n, l) => n + l.length, 0)} runs`;
      merges.push(
        { s: { r: br, c: 0 }, e: { r: br, c: 12 } },
        { s: { r: br, c: 13 }, e: { r: br, c: 14 } }
      );
      const hr = rows.length;
      rows.push([]);
      SDDA_COMPONENTS.forEach((component, i) => {
        const s = i * 5;
        rows[hr][s] = component;
        rows[hr][s + 3] = lists[i].length;
        merges.push({ s: { r: hr, c: s }, e: { r: hr, c: s + 2 } });
      });
      for (let n = 0; n < Math.max(...lists.map((l) => l.length)); n++) {
        const rr = rows.length;
        rows.push([]);
        lists.forEach((list, i) => {
          const run = list[n];
          if (!run) return;
          const s = i * 5;
          const entry = Array.isArray(run.sdda_entries) ? run.sdda_entries[0] : run.sdda_entries;
          const dog = Array.isArray(entry?.sdda_dogs) ? entry.sdda_dogs[0] : entry?.sdda_dogs;
          rows[rr][s] = run.running_position ?? n + 1;
          rows[rr][s + 1] = `${dog?.call_name || ''}\n${entry?.handler_name || ''}`;
          rows[rr][s + 2] = run.stream;
          rows[rr][s + 3] = run.run_group;
          rows[rr][s + 4] = run.move_up_approved_at
            ? `Moved up from ${run.move_up_from_level}`
            : '';
        });
      }
      const tr = rows.length;
      rows.push([]);
      SDDA_COMPONENTS.forEach((component, i) => {
        const s = i * 5;
        rows[tr][s] = `${component} total`;
        rows[tr][s + 3] = lists[i].length;
        merges.push({ s: { r: tr, c: s }, e: { r: tr, c: s + 2 } });
      });
    }
    rows.push([]);
    const gr = rows.length;
    rows.push([`Day ${day.day_number} grand total`]);
    rows[gr][13] = `${dr.length} runs`;
    merges.push(
      { s: { r: gr, c: 0 }, e: { r: gr, c: 12 } },
      { s: { r: gr, c: 13 }, e: { r: gr, c: 14 } }
    );
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!merges'] = merges;
    ws['!cols'] = [4, 19, 8, 14, 4, 4, 19, 8, 14, 4, 4, 19, 8, 14, 4].map((w) => ({ wch: w }));
    ws['!rows'] = rows.map((_r, i) => ({ hpt: i < 2 ? 24 : i === 2 ? 22 : 34 }));
    ws['!freeze'] = { xSplit: 0, ySplit: 2 };
    ws['!pageSetup'] = { orientation: 'landscape', paperSize: 9, fitToWidth: 1, fitToHeight: 0 };
    ws['!margins'] = { left: 0.2, right: 0.2, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 };
    ws['!headerFooter'] = {
      oddFooter: `SDDA Running Orders  |  ${trial.name}  |  Day ${day.day_number}  |  Page &P of &N`,
    };
    const range = XLSX.utils.decode_range(ws['!ref']!);
    for (let r = 0; r <= range.e.r; r++)
      for (let c = 0; c <= 14; c++) {
        const a = XLSX.utils.encode_cell({ r, c });
        if (!ws[a]) ws[a] = { t: 's', v: '' };
        ws[a].s = {
          font: { name: 'Arial', sz: 9, color: { rgb: '18231D' } },
          alignment: { vertical: 'center', wrapText: true },
          border: { bottom: { style: 'thin', color: { rgb: 'D9DDD9' } } },
        };
      }
    for (const r of [0, 1, gr])
      for (let c = 0; c <= 14; c++) {
        const a = XLSX.utils.encode_cell({ r, c });
        ws[a].s = {
          fill: { fgColor: { rgb: '225F45' } },
          font: { name: 'Georgia', sz: r === 0 ? 18 : 13, bold: true, color: { rgb: 'FFFFFF' } },
          alignment: { vertical: 'center', wrapText: true },
        };
      }
    for (let r = 3; r < gr; r++) {
      const value = String(ws[XLSX.utils.encode_cell({ r, c: 0 })]?.v || '');
      const level = SDDA_LEVELS.find((l) => value.endsWith(`- ${l}`));
      if (level)
        for (let c = 0; c <= 14; c++)
          ws[XLSX.utils.encode_cell({ r, c })].s = {
            fill: { fgColor: { rgb: colors[level] } },
            font: { name: 'Georgia', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
          };
    }
    XLSX.utils.book_append_sheet(wb, ws, `Day ${day.day_number} Runs`);
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
