'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Trash2, Pencil, Printer, Download } from 'lucide-react';
import { PawLoader } from '@/components/ui/pawLoader';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import {
  getSddaTrialWorkspace,
  listSddaEntries,
  type SddaTrialWorkspace,
} from '@/lib/sdda/trialRepository';
import {
  deleteSddaFinancialTransaction,
  listSddaFinancialTransactions,
  recordSddaFinancialTransaction,
  recordSddaHandlerPayment,
  type SddaFinancialType,
} from '@/lib/sdda/operationsRepository';
import {
  acceptedEntryChargeCents,
  minimumJudgeFeeCents,
  sddaRemittanceCents,
  financialEntryBalance,
  financialLedgerTotals,
  financialHandlerKey,
  allocateHandlerPayment,
} from '@/lib/sdda/financialSummary';
import { createFinancialWorkbook } from '@/lib/sdda/financialWorkbook';

type Transaction = Awaited<ReturnType<typeof listSddaFinancialTransactions>>[number];
type Entry = Awaited<ReturnType<typeof listSddaEntries>>[number];
const entryTypes = new Set<SddaFinancialType>([
  'entry_fee',
  'payment',
  'refund',
  'adjustment',
  'waiver',
  'waiver_restore',
]);
const labels: Record<SddaFinancialType, string> = {
  entry_fee: 'Legacy additional entry fee',
  payment: 'Payment received',
  refund: 'Refund',
  expense: 'Trial expense',
  judge: 'Judge expense',
  volunteer: 'Volunteer expense',
  adjustment: 'Charge / credit adjustment',
  waiver: 'Fees waived',
  waiver_restore: 'Fees restored',
  sdda_fee: 'SDDA remittance paid',
};
const money = (cents: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
const today = () => new Date().toLocaleDateString('en-CA');

export default function SddaFinancialsPage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<SddaFinancialType>('payment');
  const [entryId, setEntryId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(today());
  const [payee, setPayee] = useState('');
  const [editingId, setEditingId] = useState<string | undefined>();
  const [reversesId, setReversesId] = useState<string | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [accountEntryIds, setAccountEntryIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [balanceFilter, setBalanceFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const client = getSupabaseBrowser();
      const [workspace, roster, ledger] = await Promise.all([
        getSddaTrialWorkspace(client, trialId),
        listSddaEntries(client, trialId),
        listSddaFinancialTransactions(client, trialId),
      ]);
      setTrial(workspace);
      setEntries(roster);
      setTransactions(ledger);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load finances.');
    } finally {
      setLoading(false);
    }
  }, [trialId]);
  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => financialLedgerTotals(transactions), [transactions]);

  const entryBalances = useMemo(() => {
    if (!trial) return [];
    const pricing = {
      scentComponentFeeCents: trial.scent_component_fee_cents || 0,
      scentThreeComponentFeeCents: trial.scent_three_component_fee_cents || 0,
      eliteFeeCents: trial.elite_fee_cents || 0,
    };
    return entries.map((entry: any) => {
      const automatic = acceptedEntryChargeCents(entry, pricing, trial.sdda_game_offerings);
      const ledger = transactions.filter((item) => item.entry_id === entry.id);
      const dog = Array.isArray(entry.sdda_dogs) ? entry.sdda_dogs[0] : entry.sdda_dogs;
      return {
        id: entry.id,
        handler: entry.handler_name,
        email: entry.handler_email || '',
        key: financialHandlerKey(entry),
        dog: dog?.call_name || 'Dog',
        entryStatus: entry.confirmation_status,
        ...financialEntryBalance(automatic, ledger),
      };
    });
  }, [entries, transactions, trial]);

  const automaticCharges = entryBalances.reduce((sum, entry) => sum + entry.automatic, 0);
  const accounts = useMemo(() => {
    const groups = new Map<string, typeof entryBalances>();
    for (const entry of entryBalances)
      groups.set(entry.key, [...(groups.get(entry.key) || []), entry]);
    return [...groups.values()].sort((a, b) => a[0].handler.localeCompare(b[0].handler));
  }, [entryBalances]);
  const outstanding = accounts.reduce(
    (sum, group) =>
      sum +
      Math.max(
        0,
        group.reduce((n, e) => n + e.balance, 0)
      ),
    0
  );
  const credits = accounts.reduce(
    (sum, group) => sum + Math.max(0, -group.reduce((n, e) => n + e.balance, 0)),
    0
  );
  const openForm = (
    kind: SddaFinancialType,
    ids: string[] = [],
    initialAmount = '',
    item?: Transaction
  ) => {
    setType(kind);
    setAccountEntryIds(ids);
    setEntryId(ids.length === 1 ? ids[0] : '');
    setAmount(initialAmount);
    setMethod(item?.payment_method || '');
    setReference(item?.reference || '');
    setNotes(item?.notes || '');
    setDate(item?.occurred_on || today());
    setPayee(item?.payee || '');
    setEditingId(item?.id);
    setReversesId(undefined);
    setError(null);
    setFormOpen(true);
  };
  const sddaFees = trial ? sddaRemittanceCents(entries as any, trial.sdda_trial_days.length) : 0;
  const judgeBreakdown = useMemo(() => {
    if (!trial) return [];
    const rows = new Map<
      string,
      { day: number; date: string; judge: string; standardRuns: number; gameRuns: number }
    >();
    const dayMap = new Map(trial.sdda_trial_days.map((day) => [day.id, day]));
    const gameMap = new Map(trial.sdda_game_offerings.map((offering) => [offering.id, offering]));
    const add = (
      dayId: string,
      judgeName: string | null | undefined,
      kind: 'standardRuns' | 'gameRuns'
    ) => {
      const day = dayMap.get(dayId);
      if (!day) return;
      const judge = judgeName?.trim() || 'Unassigned judge';
      const key = `${dayId}|${judge.toLowerCase()}`;
      const row = rows.get(key) || {
        day: day.day_number,
        date: day.trial_date,
        judge,
        standardRuns: 0,
        gameRuns: 0,
      };
      row[kind] += 1;
      rows.set(key, row);
    };
    for (const entry of entries as any[]) {
      if (entry.confirmation_status !== 'accepted') continue;
      for (const run of entry.sdda_runs || []) {
        const offering = trial.sdda_trial_offerings.find(
          (candidate) =>
            candidate.trial_day_id === run.trial_day_id &&
            candidate.level === run.level &&
            candidate.component === run.component &&
            candidate.stream === run.stream
        );
        add(
          run.trial_day_id,
          offering?.judge_name || dayMap.get(run.trial_day_id)?.judge_name,
          'standardRuns'
        );
      }
      for (const run of entry.sdda_game_runs || []) {
        const offering = gameMap.get(run.offering_id);
        add(
          run.trial_day_id,
          offering?.judge_name || dayMap.get(run.trial_day_id)?.judge_name,
          'gameRuns'
        );
      }
    }
    return [...rows.values()]
      .sort((a, b) => a.day - b.day || a.judge.localeCompare(b.judge))
      .map((row) => ({
        ...row,
        runRateCents: row.standardRuns * 300 + row.gameRuns * 200,
        minimumFeeCents: minimumJudgeFeeCents(row.standardRuns, row.gameRuns),
      }));
  }, [entries, trial]);
  const judgeMinimum = judgeBreakdown.reduce((sum, row) => sum + row.minimumFeeCents, 0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amountCents = Math.round(Number(amount.replace(/[$,\s]/g, '')) * 100);
    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents === 0 ||
      (type !== 'adjustment' && amountCents < 0)
    ) {
      setError('Enter a positive amount. Only adjustments may be negative.');
      return;
    }
    const isBatch = type === 'payment' && !editingId && !entryId && accountEntryIds.length > 1;
    if (entryTypes.has(type) && !entryId && !isBatch) {
      setError('Choose the dog entry this transaction belongs to.');
      return;
    }
    if (['waiver', 'waiver_restore', 'adjustment'].includes(type) && !notes.trim()) {
      setError('Enter the reason for this change.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      if (isBatch) {
        const selected = entryBalances.filter((entry) => accountEntryIds.includes(entry.id));
        await recordSddaHandlerPayment(getSupabaseBrowser(), {
          trialId,
          allocations: allocateHandlerPayment(amountCents, selected),
          paymentMethod: method,
          reference,
          notes,
          occurredOn: date,
        });
      } else
        await recordSddaFinancialTransaction(getSupabaseBrowser(), {
          trialId,
          entryId: entryTypes.has(type) ? entryId : undefined,
          type,
          amountCents,
          paymentMethod: method,
          reference,
          notes,
          occurredOn: date,
          transactionId: editingId,
          payee,
          reversesId,
        });
      setFormOpen(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save transaction.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (saving) return;
    if (
      !window.confirm(
        'Delete this ledger transaction? The deletion remains in the activity journal.'
      )
    )
      return;
    try {
      setSaving(true);
      await deleteSddaFinancialTransaction(getSupabaseBrowser(), id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete transaction.');
    } finally {
      setSaving(false);
    }
  };

  const exportWorkbook = () => {
    if (!trial) return;
    const bytes = createFinancialWorkbook(
      trial.name,
      entryBalances,
      transactions.map((item) => ({
        ...item,
        label: labels[item.transaction_type as SddaFinancialType],
        entry: entryBalances.find((entry) => entry.id === item.entry_id),
      })),
      judgeBreakdown
    );
    const url = URL.createObjectURL(
      new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${trial.name.replace(/[^a-z0-9]+/gi, '-')}-financials.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading)
    return (
      <MainLayout title="Finances">
        <div className="flex justify-center py-20">
          <PawLoader className="h-8 w-8" />
        </div>
      </MainLayout>
    );
  return (
    <MainLayout
      title="Finances"
      breadcrumbItems={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Trials', href: '/dashboard/trials' },
        { label: trial?.name || 'Trial', href: `/dashboard/trials/${trialId}` },
        { label: 'Finances' },
      ]}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4 print:static">
          <div>
            <h1 className="text-3xl font-bold">Trial finances</h1>
            <p className="text-gray-600">{trial?.name} · Canadian dollars</p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print statement
            </Button>
            <Button variant="outline" onClick={exportWorkbook}>
              <Download className="mr-2 h-4 w-4" />
              Export Excel
            </Button>
            <Button disabled={saving} onClick={() => openForm('expense')}>
              <Plus className="mr-2 h-4 w-4" />
              Add expense
            </Button>
          </div>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Gross charges', automaticCharges + totals.adjustments],
            ['Fees waived (net)', totals.waived],
            ['Collected (net of refunds)', totals.payments - totals.refunds],
            ['Outstanding', outstanding],
            ['Credits / overpayments', credits],
            ['Actual expenses recorded', totals.expenses],
            [
              'Cash net after recorded expenses',
              totals.payments - totals.refunds - totals.expenses,
            ],
          ].map(([label, value]) => (
            <Card key={String(label)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-600">{label}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{money(Number(value))}</CardContent>
            </Card>
          ))}
        </div>
        <Alert>
          <AlertDescription>
            Automatic charges include accepted entries only. Estimates are shown separately: SDDA
            fees {money(sddaFees)}; judge compensation {money(judgeMinimum)}. Cash net subtracts
            actual ledger expenses only, not these estimates again. Record SDDA remittances and
            judge payments once as expenses. Fee waivers do not remove runs or reduce these cost
            estimates.
          </AlertDescription>
        </Alert>
        <Card>
          <CardHeader>
            <CardTitle>Judge compensation breakdown</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Trial day</th>
                  <th className="p-2">Judge</th>
                  <th className="p-2 text-right">Standard runs</th>
                  <th className="p-2 text-right">Games runs</th>
                  <th className="p-2 text-right">Run rate</th>
                  <th className="p-2 text-right">Minimum payment</th>
                </tr>
              </thead>
              <tbody>
                {judgeBreakdown.map((row) => (
                  <tr key={`${row.day}-${row.judge}`} className="border-b">
                    <td className="p-2">
                      Day {row.day} · {row.date}
                    </td>
                    <td
                      className={`p-2 font-medium ${row.judge === 'Unassigned judge' ? 'text-blue-800' : ''}`}
                    >
                      {row.judge}
                    </td>
                    <td className="p-2 text-right">{row.standardRuns}</td>
                    <td className="p-2 text-right">{row.gameRuns}</td>
                    <td className="p-2 text-right">{money(row.runRateCents)}</td>
                    <td className="p-2 text-right font-bold">{money(row.minimumFeeCents)}</td>
                  </tr>
                ))}
                {judgeBreakdown.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      No accepted runs are assigned to a judge yet.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2">
                  <td colSpan={5} className="p-2 text-right font-bold">
                    Calculated judge minimum
                  </td>
                  <td className="p-2 text-right text-lg font-bold">{money(judgeMinimum)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="mt-3 text-xs text-gray-600">
              Travel at $0.65/km, lodging, meals, and other judge expenses are additional and should
              be entered in the ledger as Judge expense transactions.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Handler accounts · payments and waivers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3 print:hidden">
              <Input
                aria-label="Search handler or dog"
                placeholder="Search handler or dog"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                aria-label="Balance filter"
                className="rounded border bg-white px-3"
                value={balanceFilter}
                onChange={(e) => setBalanceFilter(e.target.value)}
              >
                <option value="all">All balances</option>
                <option value="owing">Owing</option>
                <option value="credit">Credit</option>
                <option value="settled">Settled</option>
              </select>
            </div>
            <p className="text-sm text-gray-600">
              Dogs are grouped by matching handler name and email. Entries without email remain
              separate. A handler payment is allocated across the selected dogs’ balances; any
              excess remains a credit. Refunds and waivers apply to a specific dog.
            </p>
            {accounts
              .filter((group) => {
                const balance = group.reduce((sum, e) => sum + e.balance, 0);
                return (
                  group.some((e) =>
                    `${e.handler} ${e.dog} ${e.email}`.toLowerCase().includes(search.toLowerCase())
                  ) &&
                  (balanceFilter === 'all' ||
                    (balanceFilter === 'owing' && balance > 0) ||
                    (balanceFilter === 'credit' && balance < 0) ||
                    (balanceFilter === 'settled' && balance === 0))
                );
              })
              .map((group) => (
                <section
                  key={group[0].key}
                  className="rounded-lg border bg-white p-4 break-inside-avoid"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-bold">{group[0].handler}</h3>
                      <p className="text-sm text-gray-600">
                        {group[0].email} · Net balance{' '}
                        {money(group.reduce((sum, e) => sum + e.balance, 0))}
                      </p>
                    </div>
                    <Button
                      className="print:hidden"
                      disabled={saving || trial?.status === 'completed'}
                      onClick={() =>
                        openForm(
                          'payment',
                          group.map((e) => e.id),
                          (
                            Math.max(
                              0,
                              group.reduce((sum, e) => sum + e.balance, 0)
                            ) / 100
                          ).toFixed(2)
                        )
                      }
                    >
                      Record payment
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="p-2">Dog / entry status</th>
                          <th className="p-2">Charges</th>
                          <th className="p-2">Waived</th>
                          <th className="p-2">Net paid</th>
                          <th className="p-2">Balance</th>
                          <th className="p-2 print:hidden">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.map((e) => (
                          <tr key={e.id} className="border-b">
                            <td className="p-2">
                              {e.dog}
                              <div className="text-xs text-gray-600">
                                {e.entryStatus} · {e.status}
                              </div>
                            </td>
                            <td className="p-2">{money(e.charges)}</td>
                            <td className="p-2">{money(e.waived)}</td>
                            <td className="p-2">{money(e.paid)}</td>
                            <td className="p-2 font-bold">{money(e.balance)}</td>
                            <td className="p-2 print:hidden">
                              <div className="flex flex-wrap gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={saving || e.balance <= 0}
                                  onClick={() =>
                                    openForm('waiver', [e.id], (e.balance / 100).toFixed(2))
                                  }
                                >
                                  Waive fees
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={saving || e.paid <= 0}
                                  onClick={() =>
                                    openForm(
                                      'refund',
                                      [e.id],
                                      (Math.min(e.paid, Math.max(0, -e.balance)) / 100).toFixed(2)
                                    )
                                  }
                                >
                                  Refund
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={saving}
                                  onClick={() => openForm('adjustment', [e.id])}
                                >
                                  Adjust
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <details className="mt-3 print:hidden">
                    <summary className="cursor-pointer font-medium">
                      Payment and waiver history
                    </summary>
                    {transactions
                      .filter((t) => group.some((e) => e.id === t.entry_id))
                      .map((t) => (
                        <p key={t.id} className="border-b py-2 text-sm">
                          {t.occurred_on} · {group.find((e) => e.id === t.entry_id)?.dog} ·{' '}
                          {labels[t.transaction_type as SddaFinancialType]} ·{' '}
                          {money(t.amount_cents)} · {t.notes}
                        </p>
                      ))}
                  </details>
                </section>
              ))}
            {!entries.length && <p>No entries yet.</p>}
          </CardContent>
        </Card>
        {formOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden"
            role="dialog"
            aria-modal="true"
            aria-label={labels[type]}
          >
            <Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto bg-white">
              <CardHeader>
                <CardTitle>
                  {editingId ? 'Edit: ' : ''}
                  {labels[type]}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
                  {error && (
                    <Alert variant="destructive" className="md:col-span-2">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  {!entryTypes.has(type) && (
                    <div>
                      <Label htmlFor="expense-type">Expense category</Label>
                      <select
                        id="expense-type"
                        disabled={!!editingId}
                        className="mt-1 h-10 w-full rounded border bg-white px-3"
                        value={type}
                        onChange={(e) => setType(e.target.value as SddaFinancialType)}
                      >
                        {(['expense', 'judge', 'volunteer', 'sdda_fee'] as const).map((value) => (
                          <option key={value} value={value}>
                            {labels[value]}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {entryTypes.has(type) && (
                    <div>
                      <Label htmlFor="transaction-entry">Dog entry</Label>
                      <select
                        id="transaction-entry"
                        disabled={!!editingId || !!reversesId}
                        className="mt-1 h-10 w-full rounded border bg-white px-3"
                        value={entryId}
                        onChange={(e) => setEntryId(e.target.value)}
                      >
                        {accountEntryIds.length > 1 && type === 'payment' && (
                          <option value="">All dogs — allocate payment</option>
                        )}
                        {entryBalances
                          .filter((e) => accountEntryIds.includes(e.id))
                          .map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.handler} · {e.dog} · {money(e.balance)}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                  {type === 'waiver' && (
                    <p className="text-sm md:col-span-2">
                      Waive all or part of this dog’s current outstanding balance. Existing payments
                      remain collected. This is a fixed amount, not free future entries; review the
                      balance after adding runs or changing prices.
                    </p>
                  )}
                  {type === 'adjustment' && (
                    <p className="text-sm md:col-span-2">
                      Use a positive amount for an additional charge or a negative amount for a
                      credit. Automatic entry fees are already included; do not enter them again.
                    </p>
                  )}
                  {type === 'refund' && (
                    <p className="text-sm md:col-span-2">
                      A refund returns recorded money; it does not cancel the entry charge. For a
                      cancellation, also correct the entry or credit the charge according to your
                      policy.
                    </p>
                  )}
                  <div>
                    <Label htmlFor="amount">Amount ($)</Label>
                    <Input
                      id="amount"
                      disabled={!!reversesId}
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="date">Date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="method">Payment method</Label>
                    <Input
                      id="method"
                      placeholder="E-transfer, cash, cheque…"
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="reference">Reference</Label>
                    <Input
                      id="reference"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </div>
                  {!entryTypes.has(type) && (
                    <div>
                      <Label htmlFor="payee">Paid to / payee</Label>
                      <Input id="payee" value={payee} onChange={(e) => setPayee(e.target.value)} />
                    </div>
                  )}
                  <div className="lg:col-span-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <Button disabled={saving || trial?.status === 'completed'} type="submit">
                      {saving && <PawLoader className="mr-2 h-4 w-4" />}Save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() => setFormOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Ledger · transaction history</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Date</th>
                  <th className="p-2">Type / reason</th>
                  <th className="p-2">Entry / payee</th>
                  <th className="p-2">Method / reference</th>
                  <th className="p-2 text-right">Amount</th>
                  <th className="print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((item) => {
                  const entry = entryBalances.find((e) => e.id === item.entry_id);
                  const restored = transactions.some((t) => t.reverses_id === item.id);
                  return (
                    <tr key={item.id} className="border-b align-top">
                      <td className="p-2">{item.occurred_on}</td>
                      <td className="p-2">
                        {labels[item.transaction_type as SddaFinancialType]}
                        {restored && ' (restored)'}
                        <div className="text-xs text-gray-600">{item.notes}</div>
                      </td>
                      <td className="p-2">
                        {entry ? `${entry.handler} · ${entry.dog}` : item.payee || 'Trial-wide'}
                      </td>
                      <td className="p-2">
                        {[item.payment_method, item.reference].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="p-2 text-right">{money(item.amount_cents)}</td>
                      <td className="p-2 print:hidden">
                        {item.transaction_type === 'waiver' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={restored || saving}
                            onClick={() => {
                              openForm(
                                'waiver_restore',
                                item.entry_id ? [item.entry_id] : [],
                                (item.amount_cents / 100).toFixed(2)
                              );
                              setReversesId(item.id);
                            }}
                          >
                            Restore fees
                          </Button>
                        ) : (
                          item.transaction_type !== 'waiver_restore' && (
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={saving}
                                aria-label="Edit transaction"
                                onClick={() =>
                                  openForm(
                                    item.transaction_type as SddaFinancialType,
                                    item.entry_id ? [item.entry_id] : [],
                                    (item.amount_cents / 100).toFixed(2),
                                    item
                                  )
                                }
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={saving}
                                aria-label="Delete transaction"
                                onClick={() => void remove(item.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!transactions.length && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center">
                      No transactions recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
