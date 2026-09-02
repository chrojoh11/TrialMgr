import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx-js-style';
import { createFinancialWorkbook } from './financialWorkbook';

test('exports numeric financial statements with auditable balances and distinct expenses', () => {
  const bytes = createFinancialWorkbook(
    'Example',
    [
      {
        handler: 'Example Handler',
        dog: 'Example Dog',
        entryStatus: 'accepted',
        charges: 10000,
        payments: 4000,
        refunds: 0,
        waived: 6000,
      },
    ],
    [
      {
        occurred_on: '2026-09-02',
        label: 'Payment',
        transaction_type: 'payment',
        amount_cents: 4000,
      },
      {
        occurred_on: '2026-09-02',
        label: 'Judge expense',
        transaction_type: 'judge',
        amount_cents: 2000,
      },
    ],
    []
  );
  const wb = XLSX.read(bytes, { type: 'array' });
  assert.deepEqual(wb.SheetNames, ['Entry balances', 'Ledger', 'Summary', 'Judge estimates']);
  assert.equal(wb.Sheets['Entry balances'].D2.v, 100);
  assert.equal(wb.Sheets['Entry balances'].H2.f, 'D2-E2+F2-G2');
  assert.equal(wb.Sheets['Entry balances'].H2.v, 0);
  assert.equal(wb.Sheets.Summary.B7.f, 'B4-B5-B6');
  assert.equal(wb.Sheets.Summary.B7.v, 20);
});
