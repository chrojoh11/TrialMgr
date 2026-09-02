import XLSX from 'xlsx-js-style';

interface BalanceRow {
  handler: string;
  dog: string;
  entryStatus: string;
  charges: number;
  payments: number;
  refunds: number;
  waived: number;
}
interface TransactionRow {
  occurred_on: string;
  label: string;
  transaction_type: string;
  amount_cents: number;
  payee?: string | null;
  payment_method?: string | null;
  reference?: string | null;
  notes?: string | null;
  entry?: { handler: string; dog: string };
}
interface JudgeRow {
  day: number;
  date: string;
  judge: string;
  standardRuns: number;
  gameRuns: number;
  runRateCents: number;
  minimumFeeCents: number;
}

/** Export uses the same ledger values as the screen; monetary values remain numeric. */
export function createFinancialWorkbook(
  name: string,
  entries: BalanceRow[],
  transactions: TransactionRow[],
  judges: JudgeRow[]
) {
  const workbook = XLSX.utils.book_new();
  const addSheet = (title: string, rows: unknown[][], widths: number[], currency: number[]) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = widths.map((wch) => ({ wch }));
    sheet['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: rows.length - 1, c: widths.length - 1 },
      }),
    };
    rows[0].forEach((_, col) => {
      sheet[XLSX.utils.encode_cell({ r: 0, c: col })].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '294F73' } },
      };
    });
    for (let row = 1; row < rows.length; row++)
      for (const col of currency) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
        if (cell) cell.z = '"$"#,##0.00;[Red]-"$"#,##0.00';
      }
    XLSX.utils.book_append_sheet(workbook, sheet, title);
  };
  const sorted = [...entries].sort(
    (a, b) => a.handler.localeCompare(b.handler) || a.dog.localeCompare(b.dog)
  );
  addSheet(
    'Entry balances',
    [
      [
        'Handler',
        'Dog',
        'Entry status',
        'Charges incl. adjustments',
        'Payments',
        'Refunds',
        'Fees waived (net)',
        'Balance owing / credit',
      ],
      ...sorted.map((e, index) => {
        const r = index + 2;
        return [
          e.handler,
          e.dog,
          e.entryStatus,
          e.charges / 100,
          e.payments / 100,
          e.refunds / 100,
          e.waived / 100,
          {
            t: 'n',
            f: `D${r}-E${r}+F${r}-G${r}`,
            v: (e.charges - e.payments + e.refunds - e.waived) / 100,
          },
        ];
      }),
    ],
    [26, 22, 18, 26, 16, 16, 22, 27],
    [3, 4, 5, 6, 7]
  );
  addSheet(
    'Ledger',
    [
      [
        'Date',
        'Type',
        'Handler',
        'Dog',
        'Paid to',
        'Method',
        'Reference',
        'Amount',
        'Reason / notes',
      ],
      ...transactions.map((t) => [
        t.occurred_on,
        t.label,
        t.entry?.handler || '',
        t.entry?.dog || '',
        t.payee || '',
        t.payment_method || '',
        t.reference || '',
        t.amount_cents / 100,
        t.notes || '',
      ]),
    ],
    [15, 28, 26, 22, 28, 18, 22, 16, 65],
    [7]
  );
  const sum = (type: string) =>
    transactions
      .filter((t) => t.transaction_type === type)
      .reduce((n, t) => n + t.amount_cents / 100, 0);
  const expense = sum('expense') + sum('judge') + sum('volunteer') + sum('sdda_fee');
  addSheet(
    'Summary',
    [
      ['Trial financial summary', name],
      ['Gross charges', sorted.reduce((n, e) => n + e.charges / 100, 0)],
      ['Fees waived (net)', sorted.reduce((n, e) => n + e.waived / 100, 0)],
      ['Payments received', sum('payment')],
      ['Refunds issued', sum('refund')],
      ['Actual expenses recorded', expense],
      [
        'Cash net (actual only)',
        { t: 'n', f: 'B4-B5-B6', v: sum('payment') - sum('refund') - expense },
      ],
      ['Note', 'Estimates are not deducted from actual cash net. Waived fees are not payments.'],
    ],
    [34, 80],
    [1]
  );
  addSheet(
    'Judge estimates',
    [
      ['Day', 'Date', 'Judge', 'Standard runs', 'Games runs', 'Run rate', 'Minimum estimate'],
      ...judges.map((j) => [
        j.day,
        j.date,
        j.judge,
        j.standardRuns,
        j.gameRuns,
        j.runRateCents / 100,
        j.minimumFeeCents / 100,
      ]),
    ],
    [10, 16, 30, 18, 16, 18, 22],
    [5, 6]
  );
  workbook.Props = { Title: `${name} financial statement`, Author: 'SDDA TrialDesk' };
  return XLSX.write(workbook, {
    type: 'array',
    bookType: 'xlsx',
    compression: true,
  }) as ArrayBuffer;
}
