'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Dog, Download, FileUp, Pencil, Search } from 'lucide-react';
import { PawLoader } from '@/components/ui/pawLoader';
import Link from 'next/link';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { parseSddaEntryCsv, type SddaCsvEntry } from '@/lib/sdda/entryCsv';
import {
  getSddaTrialWorkspace,
  importSddaCsvEntries,
  listSddaEntries,
  listSddaEntryFinancials,
  saveSddaTrialOfferings,
  setSddaEntryConfirmationStatus,
  type SddaTrialWorkspace,
} from '@/lib/sdda/trialRepository';
import { offeringKey } from '@/lib/sdda/offerings';
import { createSddaMailingListWorkbook } from '@/lib/sdda/mailingListWorkbook';
import { acceptedEntryChargeCents } from '@/lib/sdda/financialSummary';

type RosterEntry = Awaited<ReturnType<typeof listSddaEntries>>[number];
type EntryFinancial = Awaited<ReturnType<typeof listSddaEntryFinancials>>[number];
const money = (cents: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);

export default function SddaEntriesPage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [financials, setFinancials] = useState<EntryFinancial[]>([]);
  const [preview, setPreview] = useState<SddaCsvEntry[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportMailingList = async () => {
    if (!trial) return;
    setError(null);
    try {
      const financials = await listSddaEntryFinancials(getSupabaseBrowser(), trialId);
      const byEntry = new Map<string, number>();
      financials.forEach((item: any) => {
        const current = byEntry.get(item.entry_id) || 0;
        const cents = Number(item.amount_cents) || 0;
        const delta =
          item.transaction_type === 'payment'
            ? -cents
            : item.transaction_type === 'refund'
              ? cents
              : item.transaction_type === 'entry_fee' || item.transaction_type === 'adjustment'
                ? cents
                : 0;
        byEntry.set(item.entry_id, current + delta);
      });
      const dayMap = new Map(trial.sdda_trial_days.map((day) => [day.id, day.day_number]));
      const rows = entries.map((entry: any) => {
        const dog = Array.isArray(entry.sdda_dogs) ? entry.sdda_dogs[0] : entry.sdda_dogs;
        const selections = (entry.sdda_runs || [])
          .slice()
          .sort(
            (a: any, b: any) =>
              (dayMap.get(a.trial_day_id) || 0) - (dayMap.get(b.trial_day_id) || 0) ||
              a.level.localeCompare(b.level) ||
              a.component.localeCompare(b.component)
          )
          .map(
            (run: any) =>
              `Day ${dayMap.get(run.trial_day_id) || '?'} · ${run.level} · ${run.component} · ${run.stream}`
          )
          .join('; ');
        return {
          name: entry.handler_name,
          email: entry.handler_email || '',
          dog: dog?.call_name || '',
          registrationNumber: dog?.sdda_registration_number || 'Pending',
          selections,
          receivedAt: entry.submitted_at || entry.created_at,
          confirmationStatus: entry.confirmation_status || entry.entry_status,
          amountOwing: (acceptedEntryChargeCents(entry, {
            scentComponentFeeCents: trial.scent_component_fee_cents || 0,
            scentThreeComponentFeeCents: trial.scent_three_component_fee_cents || 0,
            eliteFeeCents: trial.elite_fee_cents || 0,
          }, trial.sdda_game_offerings) + (byEntry.get(entry.id) || 0)) / 100,
        };
      });
      const bytes = createSddaMailingListWorkbook(trial.name, rows);
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${trial.name.replace(/[^a-z0-9]+/gi, '-')}-mailing-list.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to export mailing list.');
    }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const client = getSupabaseBrowser();
      const [workspace, roster, entryFinancials] = await Promise.all([
        getSddaTrialWorkspace(client, trialId),
        listSddaEntries(client, trialId),
        listSddaEntryFinancials(client, trialId),
      ]);
      setTrial(workspace);
      setEntries(roster);
      setFinancials(entryFinancials);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load SDDA entries.');
    } finally {
      setLoading(false);
    }
  }, [trialId]);
  useEffect(() => {
    void load();
  }, [load]);

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseSddaEntryCsv(await file.text());
      setPreview(parsed.entries);
      setFileErrors(parsed.errors);
      setResult(null);
    } catch (caught) {
      setPreview([]);
      setFileErrors([caught instanceof Error ? caught.message : 'Unable to read CSV.']);
    }
  };
  const runImport = async () => {
    if (!trial || !preview.length) return;
    setImporting(true);
    setError(null);
    try {
      const client = getSupabaseBrowser();
      const selected = new Set(
        trial.sdda_trial_offerings.map((offering) =>
          offeringKey({
            trialDayId: offering.trial_day_id,
            level: offering.level,
            component: offering.component,
            stream: offering.stream,
          })
        )
      );
      for (const entry of preview) {
        const day = trial.sdda_trial_days.find(
          (candidate) => candidate.day_number === entry.trialDay
        );
        if (!day) continue;
        entry.components.forEach((component) =>
          selected.add(
            offeringKey({ trialDayId: day.id, level: entry.level, component, stream: entry.stream })
          )
        );
      }
      await saveSddaTrialOfferings(client, trial.id, trial.sdda_trial_offerings, selected);
      const updatedTrial = await getSddaTrialWorkspace(client, trial.id);
      const imported = await importSddaCsvEntries(client, updatedTrial, preview);
      setResult(
        `${imported.imported} day/level selection${imported.imported === 1 ? '' : 's'} processed. Repeated dogs were combined into one entry, and offerings found in the CSV were added to the trial setup.`
      );
      setFileErrors(imported.errors);
      setPreview([]);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to import SDDA entries.');
    } finally {
      setImporting(false);
    }
  };
  const filtered = useMemo(
    () =>
      entries.filter((entry: any) => {
        const dog = Array.isArray(entry.sdda_dogs) ? entry.sdda_dogs[0] : entry.sdda_dogs;
        const matchesSearch = `${entry.handler_name} ${entry.handler_email || ''} ${dog?.call_name || ''} ${dog?.sdda_registration_number || ''}`
          .toLowerCase()
          .includes(search.toLowerCase());
        const matchesStatus = statusFilter === 'all' || entry.confirmation_status === statusFilter;
        return matchesSearch && matchesStatus;
      }),
    [entries, search, statusFilter]
  );
  const overview = useMemo(() => {
    const counts = { received: 0, accepted: 0, waitlisted: 0, rejected: 0 };
    entries.forEach((entry) => {
      const status = entry.confirmation_status as keyof typeof counts;
      if (status in counts) counts[status] += 1;
    });
    if (!trial) return { ...counts, owed: 0, collected: 0, outstanding: 0 };
    const pricing = { scentComponentFeeCents: trial.scent_component_fee_cents || 0, scentThreeComponentFeeCents: trial.scent_three_component_fee_cents || 0, eliteFeeCents: trial.elite_fee_cents || 0 };
    const owed = entries.reduce((total, entry) => total + acceptedEntryChargeCents(entry, pricing, trial.sdda_game_offerings), 0);
    const ledger = financials.reduce((totals, item) => {
      const amount = Number(item.amount_cents) || 0;
      if (item.transaction_type === 'payment') totals.collected += amount;
      if (item.transaction_type === 'refund') totals.collected -= amount;
      if (item.transaction_type === 'entry_fee' || item.transaction_type === 'adjustment') totals.adjustments += amount;
      return totals;
    }, { collected: 0, adjustments: 0 });
    return { ...counts, owed: owed + ledger.adjustments, collected: ledger.collected, outstanding: owed + ledger.adjustments - ledger.collected };
  }, [entries, financials, trial]);

  const changeConfirmation = async (entryId: string, status: 'received' | 'accepted' | 'waitlisted' | 'rejected') => {
    try {
      setSavingEntryId(entryId); setError(null);
      await setSddaEntryConfirmationStatus(getSupabaseBrowser(), entryId, status);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update entry status.');
    } finally { setSavingEntryId(null); }
  };

  return (
    <MainLayout
      title="SDDA Entries"
      breadcrumbItems={[
        { label: 'Trials', href: '/dashboard/trials' },
        { label: trial?.name || 'Trial', href: `/dashboard/trials/${trialId}` },
        { label: 'Entries' },
      ]}
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Entries</h1>
          <p className="text-gray-600">{trial?.name} · {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</p>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {result && (
          <Alert>
            <AlertDescription>{result}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {[
            ['Received', overview.received, 'text-sky-800'],
            ['Accepted', overview.accepted, 'text-blue-800'],
            ['Waitlisted', overview.waitlisted, 'text-blue-800'],
            ['Rejected', overview.rejected, 'text-gray-700'],
            ['Fees owed', money(overview.owed), 'text-[#294f73]'],
            ['Collected', money(overview.collected), 'text-blue-800'],
            ['Outstanding', money(overview.outstanding), overview.outstanding > 0 ? 'text-blue-800' : 'text-blue-800'],
          ].map(([label, value, color]) => <Card key={String(label)}><CardContent className="p-4"><p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p><p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p></CardContent></Card>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-64 max-w-md flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              className="pl-10"
              placeholder="Search handler, dog, or SDDA number"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select
            aria-label="Filter entries by status"
            className="h-10 rounded-md border border-input bg-white px-3 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">Status: All</option>
            <option value="received">Received</option>
            <option value="accepted">Accepted</option>
            <option value="waitlisted">Waitlisted</option>
            <option value="rejected">Rejected</option>
          </select>
          <Button variant="outline" onClick={exportMailingList} disabled={!entries.length}>
            <Download className="mr-2 h-4 w-4" />
            Export mailing list XLSX
          </Button>
        </div>
        <details className="rounded-lg border bg-white">
          <summary className="flex cursor-pointer list-none items-center px-5 py-4 font-semibold text-[#294f73]">
            <FileUp className="mr-2 h-5 w-5" />
            Import Google Form CSV
          </summary>
          <div className="border-t px-5 py-4">
            <p className="mb-4 text-sm text-gray-600">
              Upload the same Google Form response CSV used by the original SDDA TrialDesk. Day,
              level, component, and stream offerings found in the file are added automatically.
            </p>
            <div className="space-y-4">
              <Input type="file" accept=".csv,text/csv" onChange={chooseFile} />
              {preview.length > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <p>{preview.length} valid rows ready to import.</p>
                  <Button onClick={runImport} disabled={importing}>
                    {importing ? <PawLoader className="mr-2 h-4 w-4" /> : <FileUp className="mr-2 h-4 w-4" />}
                    Import entries
                  </Button>
                </div>
              )}
              {fileErrors.length > 0 && (
                <Alert variant="destructive"><AlertDescription><ul className="list-disc pl-5">{fileErrors.map((message) => <li key={message}>{message}</li>)}</ul></AlertDescription></Alert>
              )}
            </div>
          </div>
        </details>
        {loading ? (
          <div className="flex justify-center py-16">
            <PawLoader className="h-8 w-8" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center">
              {entries.length ? 'No entries match the current search or status filter.' : 'No entries yet.'}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filtered.map((entry: any) => {
              const dog = Array.isArray(entry.sdda_dogs) ? entry.sdda_dogs[0] : entry.sdda_dogs;
              return (
                <Card key={entry.id}>
                  <CardHeader>
                    <div className="flex justify-between">
                      <CardTitle className="flex items-center">
                        <Dog className="mr-2 h-5 w-5" />
                        {dog?.call_name}
                      </CardTitle>
                      <div className="flex flex-wrap gap-2"><Badge>{entry.entry_status}</Badge><Badge variant="outline">{entry.confirmation_status}</Badge></div>
                    </div>
                    <CardDescription>
                      {entry.handler_name} •{' '}
                      {dog?.registration_pending
                        ? 'SDDA registration pending'
                        : dog?.sdda_registration_number}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {entry.formal_alerts && (
                      <p className="rounded-md border border-[#cbd5e1] bg-white px-3 py-2 text-sm">
                        <strong>Formal alerts:</strong> {entry.formal_alerts}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {(entry.sdda_runs || []).map((run: any) => (
                        <Badge key={run.id} variant="outline">
                          {run.level} {run.component} • {run.stream}
                        </Badge>
                      ))}
                      {(entry.sdda_game_runs || []).map((run: any) => {
                        const offering = Array.isArray(run.sdda_game_offerings)
                          ? run.sdda_game_offerings[0]
                          : run.sdda_game_offerings;
                        return (
                          <Badge key={run.id} variant="outline">
                            {offering?.game_type} • {run.entry_type}
                          </Badge>
                        );
                      })}
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/sdda-entry/${trialId}?secretaryEntry=${entry.id}`}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit entry
                      </Link>
                    </Button>
                    <div className="flex flex-wrap items-center gap-2 border-t pt-3"><span className="text-sm font-semibold">Secretary decision:</span><select aria-label={`Confirmation status for ${dog?.call_name || 'entry'}`} disabled={savingEntryId === entry.id} className="h-9 rounded-md border border-input bg-white px-3 text-sm" value={entry.confirmation_status} onChange={(event) => void changeConfirmation(entry.id, event.target.value as 'received' | 'accepted' | 'waitlisted' | 'rejected')}><option value="received">Received - awaiting review</option><option value="accepted">Accepted</option><option value="waitlisted">Waitlisted</option><option value="rejected">Rejected</option></select>{savingEntryId === entry.id && <PawLoader className="h-4 w-4" />}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
