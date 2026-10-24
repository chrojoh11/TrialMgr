'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { BadgeCheck, Dog, Download, FilePlus2, Pencil, Search } from 'lucide-react';
import { PawLoader } from '@/components/ui/pawLoader';
import Link from 'next/link';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import {
  getSddaTrialWorkspace,
  listSddaEntries,
  listSddaEntryFinancials,
  promoteSddaWaitlistedSelection,
  setSddaSelectionDayOfStatus,
  setSddaEntryConfirmationStatus,
  type SddaTrialWorkspace,
} from '@/lib/sdda/trialRepository';
import {
  createSddaMailingListWorkbook,
  formatSddaEntrySelectionColumns,
} from '@/lib/sdda/mailingListWorkbook';
import {
  acceptedEntryChargeCents,
  financialBalanceDelta,
  financialLedgerTotals,
} from '@/lib/sdda/financialSummary';

type RosterEntry = Awaited<ReturnType<typeof listSddaEntries>>[number];
type EntryFinancial = Awaited<ReturnType<typeof listSddaEntryFinancials>>[number];
const money = (cents: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);

export default function SddaEntriesPage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [financials, setFinancials] = useState<EntryFinancial[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [issueFilter, setIssueFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [entryDecisionError, setEntryDecisionError] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const exportMailingList = async () => {
    if (!trial) return;
    setError(null);
    try {
      const financials = await listSddaEntryFinancials(getSupabaseBrowser(), trialId);
      const byEntry = new Map<string, number>();
      financials.forEach((item: any) => {
        const current = byEntry.get(item.entry_id) || 0;
        const delta = financialBalanceDelta(item);
        byEntry.set(item.entry_id, current + delta);
      });
      const dayMap = new Map(trial.sdda_trial_days.map((day) => [day.id, day.day_number]));
      const rows = entries.map((entry: any) => {
        const dog = Array.isArray(entry.sdda_dogs) ? entry.sdda_dogs[0] : entry.sdda_dogs;
        const selections = formatSddaEntrySelectionColumns(
          dayMap,
          entry.sdda_runs || [],
          entry.sdda_game_runs || []
        );
        return {
          name: entry.handler_name,
          email: entry.handler_email || '',
          dog: dog?.call_name || '',
          registrationNumber: dog?.sdda_registration_number || 'Pending',
          ...selections,
          receivedAt: entry.submitted_at || entry.created_at,
          confirmationStatus: entry.confirmation_status || entry.entry_status,
          amountOwing:
            (acceptedEntryChargeCents(
              entry,
              {
                scentComponentFeeCents: trial.scent_component_fee_cents || 0,
                scentThreeComponentFeeCents: trial.scent_three_component_fee_cents || 0,
                eliteFeeCents: trial.elite_fee_cents || 0,
              },
              trial.sdda_game_offerings
            ) +
              (byEntry.get(entry.id) || 0)) /
            100,
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

  const filtered = useMemo(
    () =>
      entries.filter((entry: any) => {
        const dog = Array.isArray(entry.sdda_dogs) ? entry.sdda_dogs[0] : entry.sdda_dogs;
        const matchesSearch =
          `${entry.handler_name} ${entry.handler_email || ''} ${entry.participant_number || ''} ${dog?.call_name || ''} ${dog?.sdda_registration_number || ''}`
            .toLowerCase()
            .includes(search.toLowerCase());
        const matchesStatus = statusFilter === 'all' || entry.confirmation_status === statusFilter;
        const hasWaitlist =
          entry.sdda_runs.some((run: any) => run.selection_status === 'waitlisted') ||
          entry.sdda_game_runs.some((run: any) => run.selection_status === 'waitlisted');
        const hasDayOf =
          entry.sdda_runs.some((run: any) => run.selection_status === 'day_of_withdrawn') ||
          entry.sdda_game_runs.some((run: any) => run.selection_status === 'day_of_withdrawn');
        const registrationIssue = Boolean(
          dog?.registration_pending || !dog?.sdda_registration_number
        );
        const contactIssue = !entry.handler_email || !entry.handler_phone;
        const alertIssue = Boolean(
          entry.formal_alerts || (entry.reactivity && entry.reactivity !== 'None')
        );
        const pricing = trial
          ? {
              scentComponentFeeCents: trial.scent_component_fee_cents || 0,
              scentThreeComponentFeeCents: trial.scent_three_component_fee_cents || 0,
              eliteFeeCents: trial.elite_fee_cents || 0,
            }
          : null;
        const ledgerDelta = financials
          .filter((item) => item.entry_id === entry.id)
          .reduce((sum, item) => sum + financialBalanceDelta(item), 0);
        const paymentIssue = Boolean(
          pricing &&
          entry.confirmation_status === 'accepted' &&
          acceptedEntryChargeCents(entry, pricing, trial?.sdda_game_offerings || []) +
            ledgerDelta !==
            0
        );
        const matchesIssue =
          issueFilter === 'all' ||
          (issueFilter === 'review' && entry.confirmation_status === 'received') ||
          (issueFilter === 'registration' && registrationIssue) ||
          (issueFilter === 'waitlist' && hasWaitlist) ||
          (issueFilter === 'payment' && paymentIssue) ||
          (issueFilter === 'day_of' && hasDayOf) ||
          (issueFilter === 'contact' && contactIssue) ||
          (issueFilter === 'alerts' && alertIssue);
        return matchesSearch && matchesStatus && matchesIssue;
      }),
    [entries, search, statusFilter, issueFilter, financials, trial]
  );
  const overview = useMemo(() => {
    const counts = { received: 0, accepted: 0, waitlisted: 0, rejected: 0 };
    entries.forEach((entry) => {
      const status = entry.confirmation_status as keyof typeof counts;
      if (status in counts) counts[status] += 1;
    });
    if (!trial) return { ...counts, owed: 0, collected: 0, outstanding: 0 };
    const pricing = {
      scentComponentFeeCents: trial.scent_component_fee_cents || 0,
      scentThreeComponentFeeCents: trial.scent_three_component_fee_cents || 0,
      eliteFeeCents: trial.elite_fee_cents || 0,
    };
    const owed = entries.reduce(
      (total, entry) => total + acceptedEntryChargeCents(entry, pricing, trial.sdda_game_offerings),
      0
    );
    const ledger = financialLedgerTotals(financials);
    const charges = owed + ledger.adjustments - ledger.waived;
    const collected = ledger.payments - ledger.refunds;
    return { ...counts, owed: charges, collected, outstanding: charges - collected };
  }, [entries, financials, trial]);
  const waitlistGroups = useMemo(() => {
    if (!trial) return [];
    const dayById = new Map(trial.sdda_trial_days.map((day) => [day.id, day]));
    const groups = new Map<
      string,
      {
        label: string;
        items: Array<{ entry: RosterEntry; kind: 'scent' | 'game'; selectionId: string }>;
      }
    >();
    const add = (
      key: string,
      label: string,
      entry: RosterEntry,
      kind: 'scent' | 'game',
      selectionId: string
    ) => {
      const group = groups.get(key) || { label, items: [] };
      group.items.push({ entry, kind, selectionId });
      groups.set(key, group);
    };
    entries.forEach((entry) => {
      entry.sdda_runs
        .filter((run) => run.selection_status === 'waitlisted')
        .forEach((run) => {
          const day = dayById.get(run.trial_day_id);
          const dayLabel = day ? `Day ${day.day_number} · ${day.trial_date}` : 'Trial day';
          add(
            `scent|${run.trial_day_id}|${run.level}|${run.component}`,
            `${dayLabel} · ${run.level} ${run.component} (Amateur and Working share capacity)`,
            entry,
            'scent',
            run.id
          );
        });
      entry.sdda_game_runs
        .filter((run) => run.selection_status === 'waitlisted')
        .forEach((run) => {
          const day = dayById.get(run.trial_day_id);
          const dayLabel = day ? `Day ${day.day_number} · ${day.trial_date}` : 'Trial day';
          const offering = Array.isArray(run.sdda_game_offerings)
            ? run.sdda_game_offerings[0]
            : run.sdda_game_offerings;
          add(
            `game|${run.offering_id}`,
            `${dayLabel} · ${offering?.game_type || 'Game'}`,
            entry,
            'game',
            run.id
          );
        });
    });
    return [...groups.values()].map((group) => ({
      ...group,
      items: group.items.sort((a, b) =>
        String(a.entry.submitted_at || a.entry.created_at).localeCompare(
          String(b.entry.submitted_at || b.entry.created_at)
        )
      ),
    }));
  }, [entries, trial]);
  const waitlistedSelectionCount = useMemo(
    () => waitlistGroups.reduce((total, group) => total + group.items.length, 0),
    [waitlistGroups]
  );

  const changeConfirmation = async (
    entryId: string,
    status: 'received' | 'accepted' | 'waitlisted' | 'rejected'
  ) => {
    try {
      setSavingEntryId(entryId);
      setError(null);
      setEntryDecisionError((current) => ({ ...current, [entryId]: '' }));
      await setSddaEntryConfirmationStatus(getSupabaseBrowser(), entryId, status);
      await load();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to update entry status.';
      setError(message);
      setEntryDecisionError((current) => ({ ...current, [entryId]: message }));
    } finally {
      setSavingEntryId(null);
    }
  };

  const promoteSelection = async (entryId: string, kind: 'scent' | 'game', selectionId: string) => {
    try {
      setSavingEntryId(entryId);
      setEntryDecisionError((current) => ({ ...current, [entryId]: '' }));
      await promoteSddaWaitlistedSelection(getSupabaseBrowser(), kind, selectionId);
      await load();
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'Unable to promote this selection.';
      setError(message);
      setEntryDecisionError((current) => ({ ...current, [entryId]: message }));
    } finally {
      setSavingEntryId(null);
    }
  };

  const changeDayOfSelection = async (
    entryId: string,
    kind: 'scent' | 'game',
    selectionId: string,
    action: 'withdraw' | 'restore'
  ) => {
    const reason = window
      .prompt(
        action === 'withdraw'
          ? 'Why is this run being withdrawn? This removes it from trial operations and recalculates the entry fees.'
          : 'Why is this run being restored?'
      )
      ?.trim();
    if (!reason) return;
    try {
      setSavingEntryId(entryId);
      setError(null);
      setEntryDecisionError((current) => ({ ...current, [entryId]: '' }));
      await setSddaSelectionDayOfStatus(getSupabaseBrowser(), kind, selectionId, action, reason);
      await load();
      setResult(
        action === 'withdraw'
          ? 'Run withdrawn from trial operations.'
          : 'Run restored. Add it to the running order when ready.'
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to change this run.';
      setError(message);
      setEntryDecisionError((current) => ({ ...current, [entryId]: message }));
    } finally {
      setSavingEntryId(null);
    }
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
          <p className="text-gray-600">
            {trial?.name} · {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
          </p>
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
            [
              'Outstanding',
              money(overview.outstanding),
              overview.outstanding > 0 ? 'text-blue-800' : 'text-blue-800',
            ],
          ].map(([label, value, color]) => (
            <Card key={String(label)}>
              <CardContent className="p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
                <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="border-2 border-[#6f8fac] bg-[#f4f8fb]">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Selection waitlist</CardTitle>
                <CardDescription>
                  FIFO queues are kept separately for every trial day and offering. Scent Amateur
                  and Working share the same component capacity.
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-white text-[#294f73]">
                {waitlistedSelectionCount} waitlisted selection
                {waitlistedSelectionCount === 1 ? '' : 's'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {waitlistGroups.length === 0 ? (
              <div className="rounded-md border border-dashed border-[#9db2c6] bg-white px-4 py-5 text-sm text-gray-600">
                No selections are currently waitlisted. When an entry is accepted after an offering
                reaches capacity, only the full selections will appear here; any selections with
                space remain accepted.
              </div>
            ) : (
              <div className="space-y-4">
                {waitlistGroups.map((group) => (
                  <section key={group.label} className="overflow-hidden rounded-md border bg-white">
                    <h3 className="border-b bg-[#e8f0f7] px-4 py-3 font-semibold text-[#203f5e]">
                      {group.label}
                    </h3>
                    <div className="divide-y">
                      {group.items.map((item, index) => {
                        const dog = Array.isArray(item.entry.sdda_dogs)
                          ? item.entry.sdda_dogs[0]
                          : item.entry.sdda_dogs;
                        return (
                          <div
                            key={`${item.kind}-${item.selectionId}`}
                            className="flex flex-wrap items-center gap-3 px-4 py-3"
                          >
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#294f73] font-bold text-white">
                              {index + 1}
                            </span>
                            <div className="min-w-48 flex-1">
                              <p className="font-semibold">
                                {dog?.call_name || 'Dog name pending'}
                              </p>
                              <p className="text-sm text-gray-600">
                                {item.entry.handler_name} · received{' '}
                                {new Date(
                                  item.entry.submitted_at || item.entry.created_at
                                ).toLocaleString('en-CA')}
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              disabled={savingEntryId === item.entry.id}
                              onClick={() =>
                                void promoteSelection(item.entry.id, item.kind, item.selectionId)
                              }
                            >
                              {savingEntryId === item.entry.id ? (
                                <PawLoader className="mr-2 h-4 w-4" />
                              ) : null}
                              Promote
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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
          <select
            aria-label="Filter entries by issue"
            className="h-10 rounded-md border border-input bg-white px-3 text-sm"
            value={issueFilter}
            onChange={(event) => setIssueFilter(event.target.value)}
          >
            <option value="all">Issues: All</option>
            <option value="review">Needs review</option>
            <option value="registration">Registration issues</option>
            <option value="waitlist">Waitlisted selections</option>
            <option value="payment">Payment issues</option>
            <option value="day_of">Day-of changes</option>
            <option value="contact">Missing contact details</option>
            <option value="alerts">Alerts / reactive</option>
          </select>
          <Button variant="outline" onClick={exportMailingList} disabled={!entries.length}>
            <Download className="mr-2 h-4 w-4" />
            Export mailing list XLSX
          </Button>
          <Button asChild>
            <Link href={`/sdda-entry/${trialId}?secretaryNew=1`}>
              <FilePlus2 className="mr-2 h-4 w-4" />
              Add secretary entry
            </Link>
          </Button>
        </div>
        {loading ? (
          <div className="flex justify-center py-16">
            <PawLoader className="h-8 w-8" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center">
              {entries.length
                ? 'No entries match the current search or status filter.'
                : 'No entries yet.'}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filtered.map((entry: any) => {
              const dog = Array.isArray(entry.sdda_dogs) ? entry.sdda_dogs[0] : entry.sdda_dogs;
              const selections = [...(entry.sdda_runs || []), ...(entry.sdda_game_runs || [])];
              const waitlistedCount = selections.filter(
                (run: any) => run.selection_status === 'waitlisted'
              ).length;
              const waitlistLabel =
                waitlistedCount === 0
                  ? ''
                  : waitlistedCount === selections.length
                    ? 'Fully waitlisted'
                    : 'Partially waitlisted';
              return (
                <Card key={entry.id}>
                  <CardHeader>
                    <div className="flex justify-between">
                      <CardTitle className="flex items-center">
                        <Dog className="mr-2 h-5 w-5" />
                        {dog?.call_name}
                      </CardTitle>
                      <div className="flex flex-wrap gap-2">
                        <Badge>{entry.entry_status}</Badge>
                        <Badge variant="outline">{entry.confirmation_status}</Badge>
                        {waitlistLabel && (
                          <Badge className="bg-amber-600 text-white">{waitlistLabel}</Badge>
                        )}
                      </div>
                    </div>
                    <CardDescription>
                      {entry.handler_name} · Participant {entry.participant_number || 'pending'} ·
                      Dog{' '}
                      {dog?.registration_pending
                        ? 'registration pending'
                        : dog?.sdda_registration_number || 'number pending'}
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
                        <span key={run.id} className="inline-flex items-center gap-1">
                          <Badge variant="outline">
                            {run.level} {run.component} • {run.stream} •{' '}
                            {run.selection_status === 'day_of_withdrawn'
                              ? 'day-of withdrawn'
                              : run.selection_status}
                          </Badge>
                          {run.selection_status === 'waitlisted' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={savingEntryId === entry.id}
                              onClick={() => void promoteSelection(entry.id, 'scent', run.id)}
                            >
                              Promote
                            </Button>
                          )}
                          {run.selection_status === 'accepted' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={savingEntryId === entry.id}
                              onClick={() =>
                                void changeDayOfSelection(entry.id, 'scent', run.id, 'withdraw')
                              }
                            >
                              Withdraw run
                            </Button>
                          )}
                          {run.selection_status === 'day_of_withdrawn' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={savingEntryId === entry.id}
                              onClick={() =>
                                void changeDayOfSelection(entry.id, 'scent', run.id, 'restore')
                              }
                            >
                              Restore run
                            </Button>
                          )}
                        </span>
                      ))}
                      {(entry.sdda_game_runs || []).map((run: any) => {
                        const offering = Array.isArray(run.sdda_game_offerings)
                          ? run.sdda_game_offerings[0]
                          : run.sdda_game_offerings;
                        return (
                          <span key={run.id} className="inline-flex items-center gap-1">
                            <Badge variant="outline">
                              {offering?.game_type} • {run.entry_type} •{' '}
                              {run.selection_status === 'day_of_withdrawn'
                                ? 'day-of withdrawn'
                                : run.selection_status}
                            </Badge>
                            {run.selection_status === 'waitlisted' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={savingEntryId === entry.id}
                                onClick={() => void promoteSelection(entry.id, 'game', run.id)}
                              >
                                Promote
                              </Button>
                            )}
                            {run.selection_status === 'accepted' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={savingEntryId === entry.id}
                                onClick={() =>
                                  void changeDayOfSelection(entry.id, 'game', run.id, 'withdraw')
                                }
                              >
                                Withdraw run
                              </Button>
                            )}
                            {run.selection_status === 'day_of_withdrawn' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={savingEntryId === entry.id}
                                onClick={() =>
                                  void changeDayOfSelection(entry.id, 'game', run.id, 'restore')
                                }
                              >
                                Restore run
                              </Button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/sdda-entry/${trialId}?secretaryEntry=${entry.id}`}>
                        {dog?.registration_pending || !dog?.sdda_registration_number ? (
                          <BadgeCheck className="mr-2 h-4 w-4" />
                        ) : (
                          <Pencil className="mr-2 h-4 w-4" />
                        )}
                        {dog?.registration_pending || !dog?.sdda_registration_number
                          ? 'Assign / verify SDDA number'
                          : 'Edit entry'}
                      </Link>
                    </Button>
                    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                      <span className="text-sm font-semibold">Secretary decision:</span>
                      <select
                        aria-label={`Confirmation status for ${dog?.call_name || 'entry'}`}
                        disabled={savingEntryId === entry.id}
                        className="h-9 rounded-md border border-input bg-white px-3 text-sm"
                        value={entry.confirmation_status}
                        onChange={(event) =>
                          void changeConfirmation(
                            entry.id,
                            event.target.value as
                              | 'received'
                              | 'accepted'
                              | 'waitlisted'
                              | 'rejected'
                          )
                        }
                      >
                        <option value="received">Received - awaiting review</option>
                        <option value="accepted">Accepted</option>
                        <option value="waitlisted">Waitlisted</option>
                        <option value="rejected">Rejected</option>
                      </select>
                      {savingEntryId === entry.id && <PawLoader className="h-4 w-4" />}
                      {entryDecisionError[entry.id] && (
                        <p className="w-full rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800">
                          Could not change this entry: {entryDecisionError[entry.id]}
                        </p>
                      )}
                    </div>
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
