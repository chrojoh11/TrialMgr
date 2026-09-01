import assert from 'node:assert/strict';
import test from 'node:test';
import { importSddaCsvEntries, listSddaRunningOrderRuns, SDDA_RUNNING_ORDER_RUN_SELECT } from './trialRepository';

test('running-order records include formal alerts required by score-sheet packets', () => {
  assert.match(SDDA_RUNNING_ORDER_RUN_SELECT, /sdda_entries!inner\([^)]*formal_alerts/);
});

test('running orders hydrate dog identity through the authorized trial roster', async () => {
  const query: any = {
    select: () => query,
    eq: () => query,
    order: async () => ({
      data: [{ id: 'run-1', sdda_entries: { id: 'entry-1', dog_id: 'dog-1', sdda_dogs: null } }],
      error: null,
    }),
  };
  const client: any = {
    from: () => query,
    rpc: async (name: string) => {
      assert.equal(name, 'sdda_trial_roster_dogs');
      return {
        data: [{ id: 'dog-1', call_name: 'Fizzgig', sdda_registration_number: '4429' }],
        error: null,
      };
    },
  };

  const runs: any = await listSddaRunningOrderRuns(client, 'trial-1');
  assert.equal(runs[0].sdda_entries.sdda_dogs.call_name, 'Fizzgig');
  assert.equal(runs[0].sdda_entries.sdda_dogs.sdda_registration_number, '4429');
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
