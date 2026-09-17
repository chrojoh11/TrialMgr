import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptedEntryChargeCents,
  minimumJudgeFeeCents,
  sddaRemittanceCents,
  financialEntryBalance,
  financialBalanceDelta,
  financialHandlerKey,
  allocateHandlerPayment,
  financialLedgerTotals,
} from './financialSummary';

test('calculates accepted Scent packages, Elite, and Games fees', () => {
  const entry = {
    id: 'entry',
    confirmation_status: 'accepted',
    sdda_runs: [
      { trial_day_id: 'day-1', level: 'Started' },
      { trial_day_id: 'day-1', level: 'Started' },
      { trial_day_id: 'day-1', level: 'Started' },
      { trial_day_id: 'day-2', level: 'Elite' },
    ],
    sdda_game_runs: [{ offering_id: 'game', entry_type: 'FEO' }],
  };
  assert.equal(
    acceptedEntryChargeCents(
      entry,
      {
        scentComponentFeeCents: 3500,
        scentThreeComponentFeeCents: 9500,
        eliteFeeCents: 10500,
      },
      [{ id: 'game', entry_fee_cents: 2500, feo_fee_cents: 1500 }]
    ),
    21500
  );
  assert.equal(
    acceptedEntryChargeCents(
      { ...entry, confirmation_status: 'received' },
      {
        scentComponentFeeCents: 3500,
        scentThreeComponentFeeCents: 9500,
        eliteFeeCents: 10500,
      },
      []
    ),
    0
  );
});

test('charges only accepted selections in a partially waitlisted entry', () => {
  assert.equal(acceptedEntryChargeCents({
    id: 'entry', confirmation_status: 'accepted',
    sdda_runs: [
      { trial_day_id: 'day', level: 'Started', selection_status: 'accepted' },
      { trial_day_id: 'day', level: 'Started', selection_status: 'waitlisted' },
    ],
    sdda_game_runs: [
      { offering_id: 'game', entry_type: 'Regular', selection_status: 'waitlisted' },
    ],
  }, { scentComponentFeeCents: 3500, scentThreeComponentFeeCents: 10000, eliteFeeCents: 10000 }, [
    { id: 'game', entry_fee_cents: 2500, feo_fee_cents: 1500 },
  ]), 3500);
});

test('partial payment plus waiver settles without inventing collections; restore retains history', () => {
  const ledger = [
    { transaction_type: 'payment', amount_cents: 4000 },
    { transaction_type: 'waiver', amount_cents: 6000 },
  ];
  const balance = financialEntryBalance(10000, ledger);
  assert.equal(balance.balance, 0);
  assert.equal(balance.paid, 4000);
  assert.equal(balance.waived, 6000);
  const restored = financialEntryBalance(10000, [
    ...ledger,
    { transaction_type: 'waiver_restore', amount_cents: 6000 },
  ]);
  assert.equal(restored.balance, 6000);
  assert.equal(restored.waived, 0);
});

test('credits and refunds remain distinct from charge cancellation', () => {
  const ledger = [{ transaction_type: 'payment', amount_cents: 12000 }];
  assert.equal(financialEntryBalance(10000, ledger).balance, -2000);
  assert.equal(
    financialEntryBalance(10000, [...ledger, { transaction_type: 'refund', amount_cents: 2000 }])
      .balance,
    0
  );
  assert.equal(
    financialEntryBalance(10000, [{ transaction_type: 'adjustment', amount_cents: -2500 }]).charges,
    7500
  );
  assert.equal(financialBalanceDelta({ transaction_type: 'waiver', amount_cents: 1000 }), -1000);
  assert.equal(financialBalanceDelta({ transaction_type: 'sdda_fee', amount_cents: 1000 }), 0);
});

test('allocates one payment across dogs without losing a cent or overpayment', () => {
  const entries = [
    { id: 'a', balance: 6000 },
    { id: 'b', balance: 4000 },
  ];
  assert.deepEqual(allocateHandlerPayment(8000, entries), [
    { entryId: 'a', amountCents: 6000 },
    { entryId: 'b', amountCents: 2000 },
  ]);
  assert.deepEqual(allocateHandlerPayment(12000, entries), [
    { entryId: 'a', amountCents: 6000 },
    { entryId: 'b', amountCents: 6000 },
  ]);
  assert.throws(() => allocateHandlerPayment(0, entries));
  assert.throws(() => allocateHandlerPayment(100, []));
});

test('groups only matching handler/email identities and keeps missing-email entries separate', () => {
  assert.equal(
    financialHandlerKey({
      id: 'a',
      handler_name: ' Pat Smith ',
      handler_email: 'PAT@example.test',
    }),
    financialHandlerKey({ id: 'b', handler_name: 'pat smith', handler_email: 'pat@example.test' })
  );
  assert.notEqual(
    financialHandlerKey({ id: 'a', handler_name: 'Pat Smith' }),
    financialHandlerKey({ id: 'b', handler_name: 'Pat Smith' })
  );
});

test('actual expense totals do not include estimates or waivers', () => {
  const totals = financialLedgerTotals([
    { transaction_type: 'judge', amount_cents: 20000 },
    { transaction_type: 'sdda_fee', amount_cents: 5000 },
    { transaction_type: 'waiver', amount_cents: 3000 },
  ]);
  assert.equal(totals.expenses, 25000);
  assert.equal(totals.waived, 3000);
});

test('calculates SDDA host fees and judge minimums', () => {
  const entries = [
    {
      id: 'one',
      confirmation_status: 'accepted',
      sdda_runs: [
        { trial_day_id: 'day-1', level: 'Started' },
        { trial_day_id: 'day-1', level: 'Elite' },
        { trial_day_id: 'day-1', level: 'Elite' },
        { trial_day_id: 'day-1', level: 'Elite' },
      ],
      sdda_game_runs: [{ offering_id: 'game', entry_type: 'Regular' }],
    },
  ];
  assert.equal(sddaRemittanceCents(entries, 2), 12000);
  assert.equal(minimumJudgeFeeCents(10, 5), 20000);
  assert.equal(minimumJudgeFeeCents(100, 10), 32000);
});
