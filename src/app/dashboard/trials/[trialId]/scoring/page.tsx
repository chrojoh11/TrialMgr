'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, ClipboardCheck, Save } from 'lucide-react';
import { PawLoader } from '@/components/ui/pawLoader';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { formatScoreTime, parseScoreTime } from '@/lib/sdda/scoreTime';
import {
  getSddaTrialWorkspace,
  listSddaGameScoringRuns,
  listSddaScoringRuns,
  saveSddaScoreClass,
  type SddaTrialWorkspace,
} from '@/lib/sdda/trialRepository';

type ScentRun = Awaited<ReturnType<typeof listSddaScoringRuns>>[number];
type GameRun = Awaited<ReturnType<typeof listSddaGameScoringRuns>>[number];
type ScentDraft = { result: string; score: string; time: string; faults: string; notes: string };
type GameDraft = { result: string; time: string; notes: string };

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}
function numberOrNull(value: string) {
  return value.trim() === '' ? null : Number(value);
}
function scoreVersion(score: { recorded_at?: string | null; amended_at?: string | null } | null) {
  return score?.amended_at || score?.recorded_at || null;
}
function savedBy(
  score: {
    sdda_profiles?:
      | { display_name?: string | null; email?: string | null }
      | Array<{ display_name?: string | null; email?: string | null }>
      | null;
  } | null
) {
  const profile = first(score?.sdda_profiles);
  return profile?.display_name || profile?.email || 'a trial secretary';
}

export default function ScoringPage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [scentRuns, setScentRuns] = useState<ScentRun[]>([]);
  const [gameRuns, setGameRuns] = useState<GameRun[]>([]);
  const [scentDrafts, setScentDrafts] = useState<Record<string, ScentDraft>>({});
  const [gameDrafts, setGameDrafts] = useState<Record<string, GameDraft>>({});
  const [format, setFormat] = useState<'scent' | 'games'>('scent');
  const [dayId, setDayId] = useState('all');
  const [classKey, setClassKey] = useState('');
  const [query, setQuery] = useState('');
  const [savingAll, setSavingAll] = useState(false);
  const [dirtyScentIds, setDirtyScentIds] = useState<Set<string>>(new Set());
  const [dirtyGameIds, setDirtyGameIds] = useState<Set<string>>(new Set());
  const [persistedScentIds, setPersistedScentIds] = useState<Set<string>>(new Set());
  const [persistedGameIds, setPersistedGameIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const recoveryKey = `sdda-score-drafts:${trialId}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const client = getSupabaseBrowser();
      const [workspace, scents, games] = await Promise.all([
        getSddaTrialWorkspace(client, trialId),
        listSddaScoringRuns(client, trialId),
        listSddaGameScoringRuns(client, trialId),
      ]);
      setTrial(workspace);
      setScentRuns(scents);
      setGameRuns(games);
      const nextScent: Record<string, ScentDraft> = {};
      for (const run of scents) {
        const score = first(run.sdda_scores);
        nextScent[run.id] = {
          result: score?.result || '',
          score: score?.score == null ? '' : String(score.score),
          time: formatScoreTime(score?.time_seconds),
          faults: String(score?.faults ?? 0),
          notes: score?.judge_notes || '',
        };
      }
      const nextGames: Record<string, GameDraft> = {};
      for (const run of games) {
        const score = first(run.sdda_game_scores);
        nextGames[run.id] = {
          result: score?.result || '',
          time: formatScoreTime(score?.time_seconds),
          notes: score?.judge_notes || '',
        };
      }
      let recovered: {
        scentDrafts?: Record<string, ScentDraft>;
        gameDrafts?: Record<string, GameDraft>;
        dirtyScentIds?: string[];
        dirtyGameIds?: string[];
      } | null = null;
      try {
        recovered = JSON.parse(localStorage.getItem(recoveryKey) || 'null');
      } catch {
        recovered = null;
      }
      const recoverScentIds = (recovered?.dirtyScentIds || []).filter((id) => id in nextScent);
      const recoverGameIds = (recovered?.dirtyGameIds || []).filter((id) => id in nextGames);
      for (const id of recoverScentIds)
        if (recovered?.scentDrafts?.[id]) nextScent[id] = recovered.scentDrafts[id];
      for (const id of recoverGameIds)
        if (recovered?.gameDrafts?.[id]) nextGames[id] = recovered.gameDrafts[id];
      setScentDrafts(nextScent);
      setGameDrafts(nextGames);
      setDirtyScentIds(new Set(recoverScentIds));
      setDirtyGameIds(new Set(recoverGameIds));
      setPersistedScentIds(
        new Set(scents.filter((run) => Boolean(first(run.sdda_scores))).map((run) => run.id))
      );
      setPersistedGameIds(
        new Set(games.filter((run) => Boolean(first(run.sdda_game_scores))).map((run) => run.id))
      );
      if (workspace.sdda_trial_days[0]) setDayId(workspace.sdda_trial_days[0].id);
      if (!scents.length && games.length) setFormat('games');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load score entry.');
    } finally {
      setLoading(false);
    }
  }, [trialId, recoveryKey]);
  useEffect(() => {
    void load();
  }, [load]);
  const unsavedCount = dirtyScentIds.size + dirtyGameIds.size;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (unsavedCount) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsavedCount]);
  useEffect(() => {
    if (loading) return;
    if (!unsavedCount) {
      localStorage.removeItem(recoveryKey);
      return;
    }
    localStorage.setItem(
      recoveryKey,
      JSON.stringify({
        scentDrafts,
        gameDrafts,
        dirtyScentIds: [...dirtyScentIds],
        dirtyGameIds: [...dirtyGameIds],
        savedAt: new Date().toISOString(),
      })
    );
  }, [loading, unsavedCount, recoveryKey, scentDrafts, gameDrafts, dirtyScentIds, dirtyGameIds]);

  const matchesSearch = useCallback(
    (run: ScentRun | GameRun) => {
      const entry = first(run.sdda_entries);
      const dog = first(entry?.sdda_dogs);
      return `${entry?.handler_name || ''} ${dog?.call_name || ''} ${dog?.registered_name || ''} ${dog?.sdda_registration_number || ''}`
        .toLowerCase()
        .includes(query.toLowerCase());
    },
    [query]
  );
  const scentClasses = useMemo(() => {
    const seen = new Set<string>();
    return scentRuns
      .filter((run) => run.trial_day_id === dayId)
      .map((run) => ({
        key: `${run.level}|${run.component}`,
        label: `${run.level} ${run.component}`,
      }))
      .filter((item) => !seen.has(item.key) && Boolean(seen.add(item.key)));
  }, [scentRuns, dayId]);
  const gameClasses = useMemo(() => {
    const seen = new Set<string>();
    return gameRuns
      .filter((run) => run.trial_day_id === dayId)
      .map((run) => {
        const offering = first(run.sdda_game_offerings);
        return { key: offering?.game_type || '', label: offering?.game_type || 'Game' };
      })
      .filter((item) => item.key && !seen.has(item.key) && Boolean(seen.add(item.key)));
  }, [gameRuns, dayId]);
  const classOptions = format === 'scent' ? scentClasses : gameClasses;
  useEffect(() => {
    if (!classOptions.some((item) => item.key === classKey))
      setClassKey(classOptions[0]?.key || '');
  }, [classOptions, classKey]);
  const shownScent = useMemo(
    () =>
      scentRuns
        .filter(
          (run) =>
            run.trial_day_id === dayId &&
            `${run.level}|${run.component}` === classKey &&
            matchesSearch(run)
        )
        .sort(
          (left, right) =>
            (left.running_position || Number.MAX_SAFE_INTEGER) -
            (right.running_position || Number.MAX_SAFE_INTEGER)
        ),
    [scentRuns, dayId, classKey, matchesSearch]
  );
  const shownGames = useMemo(
    () =>
      gameRuns
        .filter(
          (run) =>
            run.trial_day_id === dayId &&
            (first(run.sdda_game_offerings)?.game_type || '') === classKey &&
            matchesSearch(run)
        )
        .sort(
          (left, right) =>
            (left.running_position || Number.MAX_SAFE_INTEGER) -
            (right.running_position || Number.MAX_SAFE_INTEGER)
        ),
    [gameRuns, dayId, classKey, matchesSearch]
  );
  const recordedScent = persistedScentIds.size;
  const recordedGames = persistedGameIds.size;

  const updateScentDraft = (runId: string, patch: Partial<ScentDraft>) => {
    if (patch.result === 'non_qualifying') patch = { ...patch, score: '0' };
    if (patch.result === '') patch = { result: '', score: '', time: '', faults: '0', notes: '' };
    setScentDrafts((current) => ({ ...current, [runId]: { ...current[runId], ...patch } }));
    setDirtyScentIds((current) => new Set(current).add(runId));
    setMessage('');
  };
  const updateGameDraft = (runId: string, patch: Partial<GameDraft>) => {
    if (patch.result === '') patch = { result: '', time: '', notes: '' };
    setGameDrafts((current) => ({ ...current, [runId]: { ...current[runId], ...patch } }));
    setDirtyGameIds((current) => new Set(current).add(runId));
    setMessage('');
  };

  const scentInput = (run: ScentRun) => {
    const draft = scentDrafts[run.id];
    if (!draft?.result)
      throw new Error('Choose a result on every changed Scent card before saving.');
    const score = numberOrNull(draft.score),
      time = parseScoreTime(draft.time),
      faults = Number(draft.faults || 0);
    if ([score, time, faults].some((value) => value !== null && !Number.isFinite(value)))
      throw new Error(
        'Score and faults must be numbers. Enter time as total seconds (72.77) or minutes:seconds (1:12.77).'
      );
    return {
      runId: run.id,
      result: draft.result,
      score,
      timeSeconds: time,
      faults,
      notes: draft.notes,
    };
  };
  const gameInput = (run: GameRun) => {
    const draft = gameDrafts[run.id];
    if (!draft?.result)
      throw new Error('Choose a result on every changed Games card before saving.');
    const time = parseScoreTime(draft.time);
    if (time !== null && !Number.isFinite(time))
      throw new Error('Enter time as total seconds (72.77) or minutes:seconds (1:12.77).');
    return { runId: run.id, result: draft.result, timeSeconds: time, notes: draft.notes };
  };

  const saveAll = async () => {
    setError('');
    setMessage('');
    try {
      const scentToSave = scentRuns
        .filter((run) => dirtyScentIds.has(run.id))
        .map((run) => ({ run, input: scentDrafts[run.id]?.result ? scentInput(run) : null }));
      const gamesToSave = gameRuns
        .filter((run) => dirtyGameIds.has(run.id))
        .map((run) => ({ run, input: gameDrafts[run.id]?.result ? gameInput(run) : null }));
      const amendments =
        scentToSave.filter(({ run }) => Boolean(first(run.sdda_scores))).length +
        gamesToSave.filter(({ run }) => Boolean(first(run.sdda_game_scores))).length;
      let amendmentReason = '';
      if (amendments) {
        amendmentReason =
          window
            .prompt(
              `You are changing or clearing ${amendments} previously saved score${amendments === 1 ? '' : 's'}. Enter the reason for the activity journal:`
            )
            ?.trim() || '';
        if (!amendmentReason)
          throw new Error(
            'A reason is required when changing a previously saved score. Nothing was saved.'
          );
      }
      setSavingAll(true);
      const client = getSupabaseBrowser();
      await saveSddaScoreClass(client, {
        trialId,
        amendmentReason,
        scentChanges: scentToSave.map(({ run, input }) => ({
          run_id: run.id,
          action: input ? 'save' : 'clear',
          expected_version: scoreVersion(first(run.sdda_scores)),
          ...(input
            ? {
                result: input.result,
                score: input.score,
                time_seconds: input.timeSeconds,
                faults: input.faults,
                notes: input.notes,
              }
            : {}),
        })),
        gameChanges: gamesToSave.map(({ run, input }) => ({
          run_id: run.id,
          action: input ? 'save' : 'clear',
          expected_version: scoreVersion(first(run.sdda_game_scores)),
          ...(input
            ? { result: input.result, time_seconds: input.timeSeconds, notes: input.notes }
            : {}),
        })),
      });
      const saved = scentToSave.length + gamesToSave.length;
      localStorage.removeItem(recoveryKey);
      await load();
      setMessage(
        `${saved} changed score card${saved === 1 ? '' : 's'} saved together. You can safely leave and continue later.`
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to save this class. Nothing was saved.'
      );
    } finally {
      setSavingAll(false);
    }
  };

  const currentDay = trial?.sdda_trial_days.find((day) => day.id === dayId);
  const currentDirtyCount =
    format === 'scent'
      ? shownScent.filter((run) => dirtyScentIds.has(run.id)).length
      : shownGames.filter((run) => dirtyGameIds.has(run.id)).length;

  return (
    <MainLayout
      title="Score entry"
      breadcrumbItems={[
        { label: 'Trials', href: '/dashboard/trials' },
        { label: trial?.name || 'Trial', href: `/dashboard/trials/${trialId}` },
        { label: 'Score entry' },
      ]}
    >
      <div className="space-y-5">
        <Card className="sticky top-0 z-30 border-[#cbd9e5] bg-[#f8fafc]/95 shadow-md backdrop-blur">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 font-serif text-3xl text-[#294f73]">
                  <ClipboardCheck className="h-7 w-7" />
                  Class score entry
                </CardTitle>
                <CardDescription>
                  Enter one class in running order. Times display as m:ss.00 and are stored as total
                  seconds for the official workbook.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={unsavedCount ? 'destructive' : 'outline'}>
                  {unsavedCount} unsaved total
                </Badge>
                <Badge variant="outline">{currentDirtyCount} in this class</Badge>
                <Badge className="bg-[#294f73] text-white">
                  {recordedScent + recordedGames} / {scentRuns.length + gameRuns.length} recorded
                </Badge>
                <Button
                  className="bg-[#294f73]"
                  disabled={!unsavedCount || savingAll}
                  onClick={() => void saveAll()}
                >
                  {savingAll ? (
                    <PawLoader className="mr-2 h-4 w-4" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save all changes
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <select
              aria-label="Competition format"
              className="rounded-md border bg-white px-3 py-2"
              value={format}
              onChange={(event) => setFormat(event.target.value as 'scent' | 'games')}
            >
              <option value="scent">
                Scent ({recordedScent}/{scentRuns.length})
              </option>
              <option value="games">
                Games ({recordedGames}/{gameRuns.length})
              </option>
            </select>
            <select
              aria-label="Trial day"
              className="rounded-md border bg-white px-3 py-2"
              value={dayId}
              onChange={(event) => setDayId(event.target.value)}
            >
              {trial?.sdda_trial_days.map((day) => (
                <option key={day.id} value={day.id}>
                  Day {day.day_number} · {day.trial_date}
                </option>
              ))}
            </select>
            <select
              aria-label="Class"
              className="rounded-md border bg-white px-3 py-2"
              value={classKey}
              onChange={(event) => setClassKey(event.target.value)}
            >
              {classOptions.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
            <Input
              className="bg-white"
              placeholder="Find dog, handler, or SDDA number"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </CardContent>
        </Card>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {message && (
          <Alert className="border-blue-300 bg-blue-50 text-blue-900">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {loading ? (
          <div className="flex justify-center p-12">
            <PawLoader className="h-8 w-8 text-[#294f73]" />
          </div>
        ) : (
          <Card className="overflow-hidden border-[#b8c9d8]">
            <CardHeader className="border-b bg-[#e8f0f7]">
              <CardTitle>
                {currentDay ? `Day ${currentDay.day_number} · ` : ''}
                {classOptions.find((item) => item.key === classKey)?.label || 'Select a class'}
              </CardTitle>
              <CardDescription>
                {format === 'scent' ? shownScent.length : shownGames.length} accepted run
                {(format === 'scent' ? shownScent.length : shownGames.length) === 1 ? '' : 's'} in
                running order. Blank results remain Not recorded.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {format === 'scent' ? (
                <ScentClassTable
                  runs={shownScent}
                  drafts={scentDrafts}
                  dirtyIds={dirtyScentIds}
                  updateDraft={updateScentDraft}
                />
              ) : (
                <GameClassTable
                  runs={shownGames}
                  drafts={gameDrafts}
                  dirtyIds={dirtyGameIds}
                  updateDraft={updateGameDraft}
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}

function ScentClassTable({
  runs,
  drafts,
  dirtyIds,
  updateDraft,
}: {
  runs: ScentRun[];
  drafts: Record<string, ScentDraft>;
  dirtyIds: Set<string>;
  updateDraft: (runId: string, patch: Partial<ScentDraft>) => void;
}) {
  if (!runs.length)
    return (
      <p className="p-10 text-center text-[#64748b]">No accepted Scent runs match this class.</p>
    );
  return (
    <table className="w-full min-w-[1120px] border-collapse text-sm">
      <thead className="bg-[#294f73] text-left text-white">
        <tr>
          <th className="w-16 px-3 py-3 text-center">Order</th>
          <th className="min-w-48 px-3 py-3">Dog / handler</th>
          <th className="w-28 px-3 py-3">Stream</th>
          <th className="w-44 px-3 py-3">Result</th>
          <th className="w-24 px-3 py-3">Score</th>
          <th className="w-32 px-3 py-3">
            Time
            <br />
            <span className="font-normal">m:ss.00</span>
          </th>
          <th className="w-24 px-3 py-3">Faults</th>
          <th className="min-w-52 px-3 py-3">Judge notes</th>
          <th className="w-24 px-3 py-3 text-center">Status</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => {
          const entry = first(run.sdda_entries),
            dog = first(entry?.sdda_dogs),
            draft = drafts[run.id],
            dirty = dirtyIds.has(run.id),
            score = first(run.sdda_scores),
            recorded = Boolean(score);
          return (
            <tr
              key={run.id}
              className={`border-b align-middle ${dirty ? 'bg-sky-50' : 'bg-white'}`}
            >
              <td className="px-3 py-2 text-center text-lg font-bold text-[#294f73]">
                {run.running_position || '—'}
              </td>
              <td className="px-3 py-2">
                <strong className="block text-base">
                  {dog?.call_name || dog?.registered_name || 'Unnamed dog'}
                </strong>
                <span className="text-xs text-[#64748b]">
                  {entry?.handler_name} · SDDA {dog?.sdda_registration_number || 'pending'} ·{' '}
                  {run.run_group}
                </span>
              </td>
              <td className="px-3 py-2 font-semibold">{run.stream}</td>
              <td className="px-3 py-2">
                <select
                  aria-label={`Result for ${dog?.call_name || 'dog'}`}
                  className="w-full rounded-md border bg-white px-2 py-2"
                  value={draft?.result || ''}
                  onChange={(event) => updateDraft(run.id, { result: event.target.value })}
                >
                  <option value="">Not recorded</option>
                  <option value="qualifying">Qualifying</option>
                  <option value="non_qualifying">Non-qualifying</option>
                  <option value="absent">Absent</option>
                  <option value="withdrawn">Withdrawn</option>
                  <option value="excused">Excused</option>
                </select>
              </td>
              <td className="px-3 py-2">
                <Input
                  aria-label={`Score for ${dog?.call_name || 'dog'}`}
                  className="bg-white text-right font-mono"
                  inputMode="decimal"
                  value={draft?.score || ''}
                  onChange={(event) => updateDraft(run.id, { score: event.target.value })}
                />
              </td>
              <td className="px-3 py-2">
                <Input
                  aria-label={`Time for ${dog?.call_name || 'dog'}`}
                  className="bg-white text-right font-mono tabular-nums"
                  inputMode="decimal"
                  placeholder="0:00.00"
                  value={draft?.time || ''}
                  onChange={(event) => updateDraft(run.id, { time: event.target.value })}
                />
              </td>
              <td className="px-3 py-2">
                <Input
                  aria-label={`Faults for ${dog?.call_name || 'dog'}`}
                  className="bg-white text-right font-mono"
                  inputMode="numeric"
                  value={draft?.faults || '0'}
                  onChange={(event) => updateDraft(run.id, { faults: event.target.value })}
                />
              </td>
              <td className="px-3 py-2">
                <Input
                  aria-label={`Judge notes for ${dog?.call_name || 'dog'}`}
                  className="bg-white"
                  value={draft?.notes || ''}
                  onChange={(event) => updateDraft(run.id, { notes: event.target.value })}
                />
              </td>
              <td className="px-3 py-2 text-center">
                {dirty ? (
                  <Badge variant="outline" className="border-sky-500 text-sky-800">
                    Unsaved
                  </Badge>
                ) : recorded ? (
                  <>
                    <Badge className="bg-blue-700">Saved</Badge>
                    <span className="mt-1 block text-[10px] text-[#64748b]">
                      {savedBy(score)}
                      <br />
                      {new Date(scoreVersion(score)!).toLocaleString()}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-[#64748b]">Not recorded</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GameClassTable({
  runs,
  drafts,
  dirtyIds,
  updateDraft,
}: {
  runs: GameRun[];
  drafts: Record<string, GameDraft>;
  dirtyIds: Set<string>;
  updateDraft: (runId: string, patch: Partial<GameDraft>) => void;
}) {
  if (!runs.length)
    return (
      <p className="p-10 text-center text-[#64748b]">No accepted Games runs match this class.</p>
    );
  return (
    <table className="w-full min-w-[900px] border-collapse text-sm">
      <thead className="bg-[#294f73] text-left text-white">
        <tr>
          <th className="w-16 px-3 py-3 text-center">Order</th>
          <th className="min-w-52 px-3 py-3">Dog / handler</th>
          <th className="w-40 px-3 py-3">Division / entry</th>
          <th className="w-44 px-3 py-3">Result</th>
          <th className="w-32 px-3 py-3">
            Time
            <br />
            <span className="font-normal">m:ss.00</span>
          </th>
          <th className="min-w-56 px-3 py-3">Judge notes</th>
          <th className="w-24 px-3 py-3 text-center">Status</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => {
          const entry = first(run.sdda_entries),
            dog = first(entry?.sdda_dogs),
            draft = drafts[run.id],
            dirty = dirtyIds.has(run.id),
            score = first(run.sdda_game_scores),
            recorded = Boolean(score);
          return (
            <tr
              key={run.id}
              className={`border-b align-middle ${dirty ? 'bg-sky-50' : 'bg-white'}`}
            >
              <td className="px-3 py-2 text-center text-lg font-bold text-[#294f73]">
                {run.running_position || '—'}
              </td>
              <td className="px-3 py-2">
                <strong className="block text-base">
                  {dog?.call_name || dog?.registered_name || 'Unnamed dog'}
                </strong>
                <span className="text-xs text-[#64748b]">
                  {entry?.handler_name} · SDDA {dog?.sdda_registration_number || 'pending'}
                </span>
              </td>
              <td className="px-3 py-2">
                <strong>{run.aerial_division || '—'}</strong>
                <span className="block text-xs text-[#64748b]">{run.entry_type}</span>
              </td>
              <td className="px-3 py-2">
                <select
                  aria-label={`Result for ${dog?.call_name || 'dog'}`}
                  className="w-full rounded-md border bg-white px-2 py-2"
                  value={draft?.result || ''}
                  onChange={(event) => updateDraft(run.id, { result: event.target.value })}
                >
                  <option value="">Not recorded</option>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                  <option value="absent">Absent</option>
                  <option value="withdrawn">Withdrawn</option>
                  <option value="excused">Excused</option>
                </select>
              </td>
              <td className="px-3 py-2">
                <Input
                  aria-label={`Time for ${dog?.call_name || 'dog'}`}
                  className="bg-white text-right font-mono tabular-nums"
                  inputMode="decimal"
                  placeholder="0:00.00"
                  value={draft?.time || ''}
                  onChange={(event) => updateDraft(run.id, { time: event.target.value })}
                />
              </td>
              <td className="px-3 py-2">
                <Input
                  aria-label={`Judge notes for ${dog?.call_name || 'dog'}`}
                  className="bg-white"
                  value={draft?.notes || ''}
                  onChange={(event) => updateDraft(run.id, { notes: event.target.value })}
                />
              </td>
              <td className="px-3 py-2 text-center">
                {dirty ? (
                  <Badge variant="outline" className="border-sky-500 text-sky-800">
                    Unsaved
                  </Badge>
                ) : recorded ? (
                  <>
                    <Badge className="bg-blue-700">Saved</Badge>
                    <span className="mt-1 block text-[10px] text-[#64748b]">
                      {savedBy(score)}
                      <br />
                      {new Date(scoreVersion(score)!).toLocaleString()}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-[#64748b]">Not recorded</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
