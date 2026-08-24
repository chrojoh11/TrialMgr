import assert from 'node:assert/strict';
import test from 'node:test';
import { importSddaCsvEntries, SDDA_RUNNING_ORDER_RUN_SELECT } from './trialRepository';

test('running-order records include formal alerts required by score-sheet packets', () => {
  assert.match(SDDA_RUNNING_ORDER_RUN_SELECT, /sdda_entries!inner\([^)]*formal_alerts/);
});

test('CSV import stores reactivity for the running-order export', async () => {
  let updated: unknown;
  const client: any = {
    rpc: async () => ({ data: 'entry-1', error: null }),
    from: () => ({
      update: (value: unknown) => {
        updated = value;
        return { eq: async () => ({ error: null }) };
      },
    }),
  };
  const trial: any = { id: 'trial-1', sdda_trial_days: [{ id: 'day-1', day_number: 1 }] };
  const entry: any = {
    rowNumber: 2, trialDay: 1, handlerName: 'Handler', handlerEmail: '', handlerPhone: '',
    dogCallName: 'Dog', dogRegisteredName: '', registrationNumber: '123', registrationPending: false,
    breed: 'All Canadian', stream: 'Amateur', level: 'Started', components: ['Container'],
    formalAlerts: '', reactivity: 'People',
  };
  const result = await importSddaCsvEntries(client, trial, [entry]);
  assert.deepEqual(updated, { reactivity: 'People' });
  assert.deepEqual(result, { imported: 1, errors: [] });
});
