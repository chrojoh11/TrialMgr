'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ClipboardList, RefreshCw } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PawLoader } from '@/components/ui/pawLoader';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import {
  getSddaTrialWorkspace,
  listSddaChecklistItems,
  listSddaEntries,
  listSddaGameScoringRuns,
  listSddaScoringRuns,
  setSddaChecklistItem,
  type SddaChecklistItem,
  type SddaTrialWorkspace,
} from '@/lib/sdda/trialRepository';

const SANCTION_ITEMS = [
  ['application_submitted', 'Application submitted'],
  ['approval_received', 'Sanction approval received'],
  ['trial_numbers', 'All trial numbers recorded'],
  ['premium_approved', 'Premium list approved'],
  ['rp_notified', 'Registered participants notified'],
  ['supplies_ordered', 'Ribbons and supplies ordered'],
  ['judges_confirmed', 'Judges confirmed'],
] as const;
const first = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] || null : value || null;

export default function TrialOperationsPage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof listSddaEntries>>>([]);
  const [scentRuns, setScentRuns] = useState<Awaited<ReturnType<typeof listSddaScoringRuns>>>([]);
  const [gameRuns, setGameRuns] = useState<Awaited<ReturnType<typeof listSddaGameScoringRuns>>>([]);
  const [checklist, setChecklist] = useState<SddaChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const client = getSupabaseBrowser();
      const [workspace, roster, scents, games, items] = await Promise.all([
        getSddaTrialWorkspace(client, trialId),
        listSddaEntries(client, trialId),
        listSddaScoringRuns(client, trialId),
        listSddaGameScoringRuns(client, trialId),
        listSddaChecklistItems(client, trialId),
      ]);
      setTrial(workspace);
      setEntries(roster);
      setScentRuns(scents);
      setGameRuns(games);
      setChecklist(items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load trial operations.');
    } finally {
      setLoading(false);
    }
  }, [trialId]);
  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const accepted = entries.filter((entry) => entry.confirmation_status === 'accepted');
    return {
      review: entries.filter((entry) => entry.confirmation_status === 'received').length,
      registry: entries.filter(
        (entry) =>
          !entry.sdda_dogs?.sdda_registration_number || entry.sdda_dogs?.registration_pending
      ).length,
      waitlist: entries.reduce(
        (sum, entry) =>
          sum +
          entry.sdda_runs.filter((run) => run.selection_status === 'waitlisted').length +
          entry.sdda_game_runs.filter((run) => run.selection_status === 'waitlisted').length,
        0
      ),
      reactive: accepted.filter((entry) => entry.reactivity && entry.reactivity !== 'None').length,
      partners: accepted.reduce(
        (sum, entry) =>
          sum +
          entry.sdda_game_runs.filter(
            (run) =>
              first(run.sdda_game_offerings)?.game_type === 'Team' &&
              !run.requested_team_partner?.trim()
          ).length,
        0
      ),
      withdrawals: entries.reduce(
        (sum, entry) =>
          sum +
          entry.sdda_runs.filter((run) => run.selection_status === 'day_of_withdrawn').length +
          entry.sdda_game_runs.filter((run) => run.selection_status === 'day_of_withdrawn').length,
        0
      ),
      missingScores:
        scentRuns.filter((run) => run.run_group !== 'FEO' && !first(run.sdda_scores)).length +
        gameRuns.filter((run) => run.entry_type !== 'FEO' && !first(run.sdda_game_scores)).length,
    };
  }, [entries, scentRuns, gameRuns]);
  const toggle = async (itemKey: string, completed: boolean) => {
    setSaving(itemKey);
    setError('');
    try {
      await setSddaChecklistItem(getSupabaseBrowser(), {
        trialId,
        checklist: 'sanction',
        itemKey,
        completed,
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update checklist.');
    } finally {
      setSaving('');
    }
  };
  const statusCards = [
    ['Needs review', counts.review, 'entries'],
    ['Registration issues', counts.registry, 'entries'],
    ['Waitlisted selections', counts.waitlist, 'entries'],
    ['Reactive teams', counts.reactive, 'running-order#reactive-alerts'],
    ['Incomplete Team partners', counts.partners, 'entries'],
    ['Day-of withdrawals', counts.withdrawals, 'entries'],
    ['Missing scores', counts.missingScores, 'scoring'],
  ] as const;

  return (
    <MainLayout
      title="Trial-day operations"
      breadcrumbItems={[
        { label: 'Trials', href: '/dashboard/trials' },
        { label: trial?.name || 'Trial', href: `/dashboard/trials/${trialId}` },
        { label: 'Operations' },
      ]}
    >
      <div className="mx-auto max-w-6xl space-y-5">
        <Card className="border-[#cbd9e5] bg-[#f8fafc]">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 font-serif text-3xl text-[#294f73]">
                  <ClipboardList className="h-7 w-7" />
                  Trial-day operations
                </CardTitle>
                <CardDescription>
                  One place for items requiring secretary attention before and during the trial.
                </CardDescription>
              </div>
              <Button variant="outline" onClick={() => void load()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </CardHeader>
        </Card>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {loading ? (
          <div className="flex justify-center p-12">
            <PawLoader className="h-8 w-8" />
          </div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {statusCards.map(([label, count, path]) => (
                <Link
                  key={label}
                  href={`/dashboard/trials/${trialId}/${path}`}
                  className={`rounded-lg border p-4 shadow-sm ${count ? 'border-amber-300 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}
                >
                  <div className="flex items-center justify-between">
                    <strong>{label}</strong>
                    {count ? (
                      <AlertTriangle className="h-5 w-5 text-amber-700" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-blue-700" />
                    )}
                  </div>
                  <p className="mt-2 text-3xl font-bold text-[#294f73]">{count}</p>
                </Link>
              ))}
            </section>
            <Alert className="border-amber-300 bg-amber-50 text-amber-950">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Scheduling reminder: Started and Advanced Container should be completed before that
                level’s Interior or Exterior search. Confirm ring timing with the judges whenever
                orders change.
              </AlertDescription>
            </Alert>
            <Card>
              <CardHeader>
                <CardTitle>Premium and sanction checklist</CardTitle>
                <CardDescription>
                  Secretary reminders only. TrialDesk does not submit anything to SDDA
                  automatically; every change is retained in the activity journal.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {SANCTION_ITEMS.map(([key, label]) => {
                  const current = checklist.find(
                    (item) => item.checklist === 'sanction' && item.item_key === key
                  );
                  return (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-3 rounded-md border bg-white p-3"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(current?.completed)}
                        disabled={saving === key}
                        onChange={(event) => void toggle(key, event.target.checked)}
                        className="h-5 w-5"
                      />
                      <span className="flex-1 font-semibold">{label}</span>
                      {current?.completed_at && (
                        <Badge variant="outline">
                          {new Date(current.completed_at).toLocaleString()}
                        </Badge>
                      )}
                    </label>
                  );
                })}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}
