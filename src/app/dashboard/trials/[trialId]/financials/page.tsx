'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { getSddaTrialWorkspace, listSddaEntries, type SddaTrialWorkspace } from '@/lib/sdda/trialRepository';
import { deleteSddaFinancialTransaction, listSddaFinancialTransactions, recordSddaFinancialTransaction, SDDA_FINANCIAL_TYPES, type SddaFinancialType } from '@/lib/sdda/operationsRepository';

type Transaction = Awaited<ReturnType<typeof listSddaFinancialTransactions>>[number];
type Entry = Awaited<ReturnType<typeof listSddaEntries>>[number];
const entryTypes = new Set<SddaFinancialType>(['entry_fee', 'payment', 'refund', 'adjustment']);
const labels: Record<SddaFinancialType, string> = { entry_fee: 'Entry fee', payment: 'Payment received', refund: 'Refund', expense: 'Trial expense', judge: 'Judge expense', volunteer: 'Volunteer expense', adjustment: 'Entry adjustment' };
const money = (cents: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);

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
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const client = getSupabaseBrowser();
      const [workspace, roster, ledger] = await Promise.all([getSddaTrialWorkspace(client, trialId), listSddaEntries(client, trialId), listSddaFinancialTransactions(client, trialId)]);
      setTrial(workspace); setEntries(roster); setTransactions(ledger);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load finances.'); }
    finally { setLoading(false); }
  }, [trialId]);
  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => transactions.reduce((sum, item) => {
    const value = Number(item.amount_cents) || 0;
    if (item.transaction_type === 'entry_fee' || item.transaction_type === 'adjustment') sum.charges += value;
    if (item.transaction_type === 'payment') sum.payments += value;
    if (item.transaction_type === 'refund') sum.refunds += value;
    if (['expense', 'judge', 'volunteer'].includes(item.transaction_type)) sum.costs += value;
    return sum;
  }, { charges: 0, payments: 0, refunds: 0, costs: 0 }), [transactions]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amountCents = Math.round(Number(amount.replace(/[$,\s]/g, '')) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) { setError('Enter a valid amount greater than zero.'); return; }
    if (entryTypes.has(type) && !entryId) { setError('Choose the entry this transaction belongs to.'); return; }
    try {
      setSaving(true); setError(null);
      await recordSddaFinancialTransaction(getSupabaseBrowser(), { trialId, entryId: entryTypes.has(type) ? entryId : undefined, type, amountCents, paymentMethod: method, reference, notes, occurredOn: date });
      setAmount(''); setReference(''); setNotes(''); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save transaction.'); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this ledger transaction? The deletion remains in the activity journal.')) return;
    try { await deleteSddaFinancialTransaction(getSupabaseBrowser(), id); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to delete transaction.'); }
  };

  if (loading) return <MainLayout title="Finances"><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div></MainLayout>;
  return <MainLayout title="Finances" breadcrumbItems={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Trials', href: '/dashboard/trials' }, { label: trial?.name || 'Trial', href: `/dashboard/trials/${trialId}` }, { label: 'Finances' }]}>
    <div className="mx-auto max-w-7xl space-y-6">
      <div><h1 className="text-3xl font-bold">Trial finances</h1><p className="text-gray-600">{trial?.name} · amounts in Canadian dollars</p></div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[
        ['Entry charges', totals.charges], ['Payments', totals.payments], ['Refunds', totals.refunds], ['Operating costs', totals.costs], ['Outstanding', totals.charges - totals.payments + totals.refunds],
      ].map(([label, value]) => <Card key={String(label)}><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-600">{label}</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{money(Number(value))}</CardContent></Card>)}</div>
      <Card><CardHeader><CardTitle>Record transaction</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div><Label>Type</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3" value={type} onChange={(e) => setType(e.target.value as SddaFinancialType)}>{SDDA_FINANCIAL_TYPES.map((value) => <option key={value} value={value}>{labels[value]}</option>)}</select></div>
        <div><Label>Entry</Label><select disabled={!entryTypes.has(type)} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 disabled:bg-gray-100" value={entryId} onChange={(e) => setEntryId(e.target.value)}><option value="">Select entry</option>{entries.map((entry: any) => { const dog = Array.isArray(entry.sdda_dogs) ? entry.sdda_dogs[0] : entry.sdda_dogs; return <option key={entry.id} value={entry.id}>{entry.handler_name} · {dog?.call_name || 'Dog'}</option>; })}</select></div>
        <div><Label htmlFor="amount">Amount ($)</Label><Input id="amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><Label htmlFor="date">Date</Label><Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label htmlFor="method">Payment method</Label><Input id="method" placeholder="E-transfer, cash, cheque…" value={method} onChange={(e) => setMethod(e.target.value)} /></div>
        <div><Label htmlFor="reference">Reference</Label><Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        <div className="lg:col-span-2"><Label htmlFor="notes">Notes</Label><Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <Button disabled={saving} className="w-fit">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Add transaction</Button>
      </form></CardContent></Card>
      <Card><CardHeader><CardTitle>Ledger</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Date</th><th className="p-2">Type</th><th className="p-2">Entry</th><th className="p-2">Method / reference</th><th className="p-2 text-right">Amount</th><th /></tr></thead><tbody>{transactions.map((item: any) => { const entry = Array.isArray(item.sdda_entries) ? item.sdda_entries[0] : item.sdda_entries; const dog = Array.isArray(entry?.sdda_dogs) ? entry.sdda_dogs[0] : entry?.sdda_dogs; return <tr key={item.id} className="border-b align-top"><td className="p-2">{item.occurred_on}</td><td className="p-2">{labels[item.transaction_type as SddaFinancialType] || item.transaction_type}<div className="text-xs text-gray-500">{item.notes}</div></td><td className="p-2">{entry ? `${entry.handler_name} · ${dog?.call_name || 'Dog'}` : 'Trial-wide'}</td><td className="p-2">{[item.payment_method, item.reference].filter(Boolean).join(' · ') || '—'}</td><td className="p-2 text-right font-medium">{money(item.amount_cents)}</td><td className="p-2 text-right"><Button size="icon" variant="ghost" aria-label="Delete transaction" onClick={() => void remove(item.id)}><Trash2 className="h-4 w-4" /></Button></td></tr>; })}{!transactions.length && <tr><td colSpan={6} className="p-8 text-center text-gray-500">No financial transactions recorded.</td></tr>}</tbody></table></CardContent></Card>
    </div>
  </MainLayout>;
}
