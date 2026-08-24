'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, ClipboardCheck, Loader2, Save } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import {
  getSddaTrialWorkspace,
  listSddaGameScoringRuns,
  listSddaScoringRuns,
  recordSddaGameScore,
  recordSddaScentScore,
  type SddaTrialWorkspace,
} from '@/lib/sdda/trialRepository';

type ScentRun = Awaited<ReturnType<typeof listSddaScoringRuns>>[number];
type GameRun = Awaited<ReturnType<typeof listSddaGameScoringRuns>>[number];
type ScentDraft = { result: string; score: string; time: string; faults: string; notes: string };
type GameDraft = { result: string; time: string; notes: string };

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}
function numberOrNull(value: string) { return value.trim() === '' ? null : Number(value); }

export default function ScoringPage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [scentRuns, setScentRuns] = useState<ScentRun[]>([]);
  const [gameRuns, setGameRuns] = useState<GameRun[]>([]);
  const [scentDrafts, setScentDrafts] = useState<Record<string, ScentDraft>>({});
  const [gameDrafts, setGameDrafts] = useState<Record<string, GameDraft>>({});
  const [format, setFormat] = useState<'scent' | 'games'>('scent');
  const [dayId, setDayId] = useState('all');
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [dirtyScentIds, setDirtyScentIds] = useState<Set<string>>(new Set());
  const [dirtyGameIds, setDirtyGameIds] = useState<Set<string>>(new Set());
  const [persistedScentIds, setPersistedScentIds] = useState<Set<string>>(new Set());
  const [persistedGameIds, setPersistedGameIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const client = getSupabaseBrowser();
      const [workspace, scents, games] = await Promise.all([
        getSddaTrialWorkspace(client, trialId), listSddaScoringRuns(client, trialId), listSddaGameScoringRuns(client, trialId),
      ]);
      setTrial(workspace); setScentRuns(scents); setGameRuns(games);
      const nextScent: Record<string, ScentDraft> = {};
      for (const run of scents) { const score = first(run.sdda_scores); nextScent[run.id] = { result: score?.result || '', score: score?.score == null ? '' : String(score.score), time: score?.time_seconds == null ? '' : String(score.time_seconds), faults: String(score?.faults ?? 0), notes: score?.judge_notes || '' }; }
      const nextGames: Record<string, GameDraft> = {};
      for (const run of games) { const score = first(run.sdda_game_scores); nextGames[run.id] = { result: score?.result || '', time: score?.time_seconds == null ? '' : String(score.time_seconds), notes: score?.judge_notes || '' }; }
      setScentDrafts(nextScent); setGameDrafts(nextGames);
      setDirtyScentIds(new Set()); setDirtyGameIds(new Set());
      setPersistedScentIds(new Set(scents.filter((run) => Boolean(first(run.sdda_scores))).map((run) => run.id)));
      setPersistedGameIds(new Set(games.filter((run) => Boolean(first(run.sdda_game_scores))).map((run) => run.id)));
      if (!scents.length && games.length) setFormat('games');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load score entry.'); }
    finally { setLoading(false); }
  }, [trialId]);
  useEffect(() => { void load(); }, [load]);
  const unsavedCount = dirtyScentIds.size + dirtyGameIds.size;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (unsavedCount) event.preventDefault(); };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [unsavedCount]);

  const matches = useCallback((run: ScentRun | GameRun) => {
    if (dayId !== 'all' && run.trial_day_id !== dayId) return false;
    const entry = first(run.sdda_entries); const dog = first(entry?.sdda_dogs);
    return `${entry?.handler_name || ''} ${dog?.call_name || ''} ${dog?.registered_name || ''}`.toLowerCase().includes(query.toLowerCase());
  }, [dayId, query]);
  const shownScent = useMemo(() => scentRuns.filter(matches), [scentRuns, matches]);
  const shownGames = useMemo(() => gameRuns.filter(matches), [gameRuns, matches]);
  const recordedScent = persistedScentIds.size;
  const recordedGames = persistedGameIds.size;

  const updateScentDraft = (runId: string, patch: Partial<ScentDraft>) => {
    setScentDrafts((current) => ({ ...current, [runId]: { ...current[runId], ...patch } }));
    setDirtyScentIds((current) => new Set(current).add(runId)); setMessage('');
  };
  const updateGameDraft = (runId: string, patch: Partial<GameDraft>) => {
    setGameDrafts((current) => ({ ...current, [runId]: { ...current[runId], ...patch } }));
    setDirtyGameIds((current) => new Set(current).add(runId)); setMessage('');
  };

  const scentInput = (run: ScentRun) => {
    const draft = scentDrafts[run.id]; if (!draft?.result) throw new Error('Choose a result on every changed Scent card before saving.');
    const score = numberOrNull(draft.score), time = numberOrNull(draft.time), faults = Number(draft.faults || 0);
    if ([score, time, faults].some((value) => value !== null && !Number.isFinite(value))) throw new Error('Score, time and faults must be valid numbers.');
    return { runId: run.id, result: draft.result, score, timeSeconds: time, faults, notes: draft.notes };
  };
  const gameInput = (run: GameRun) => {
    const draft = gameDrafts[run.id]; if (!draft?.result) throw new Error('Choose a result on every changed Games card before saving.');
    const time = numberOrNull(draft.time); if (time !== null && !Number.isFinite(time)) throw new Error('Time must be a valid number.');
    return { runId: run.id, result: draft.result, timeSeconds: time, notes: draft.notes };
  };

  const saveScent = async (run: ScentRun) => {
    setSavingId(run.id); setError(''); setMessage('');
    try { await recordSddaScentScore(getSupabaseBrowser(), scentInput(run)); setDirtyScentIds((current) => { const next=new Set(current); next.delete(run.id); return next; }); setPersistedScentIds((current)=>new Set(current).add(run.id)); setMessage('Scent result saved. Other unsaved cards were left in place.'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save Scent result.'); }
    finally { setSavingId(null); }
  };
  const saveGame = async (run: GameRun) => {
    setSavingId(run.id); setError(''); setMessage('');
    try { await recordSddaGameScore(getSupabaseBrowser(), gameInput(run)); setDirtyGameIds((current) => { const next=new Set(current); next.delete(run.id); return next; }); setPersistedGameIds((current)=>new Set(current).add(run.id)); setMessage('Games result saved. Other unsaved cards were left in place.'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save Games result.'); }
    finally { setSavingId(null); }
  };

  const saveAll = async () => {
    setError(''); setMessage('');
    try {
      const scentToSave = scentRuns.filter((run) => dirtyScentIds.has(run.id)).map((run) => ({ run, input: scentInput(run) }));
      const gamesToSave = gameRuns.filter((run) => dirtyGameIds.has(run.id)).map((run) => ({ run, input: gameInput(run) }));
      setSavingAll(true); const client = getSupabaseBrowser(); let saved = 0;
      for (const item of scentToSave) { await recordSddaScentScore(client, item.input); saved++; setDirtyScentIds((current) => { const next=new Set(current); next.delete(item.run.id); return next; }); setPersistedScentIds((current)=>new Set(current).add(item.run.id)); }
      for (const item of gamesToSave) { await recordSddaGameScore(client, item.input); saved++; setDirtyGameIds((current) => { const next=new Set(current); next.delete(item.run.id); return next; }); setPersistedGameIds((current)=>new Set(current).add(item.run.id)); }
      setMessage(`${saved} changed score card${saved === 1 ? '' : 's'} saved. You can safely leave and continue later.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save all changed scores. Cards saved before the error remain saved.'); }
    finally { setSavingAll(false); }
  };

  return <MainLayout title="Score entry" breadcrumbItems={[{ label: 'Trials', href: '/dashboard/trials' }, { label: trial?.name || 'Trial', href: `/dashboard/trials/${trialId}` }, { label: 'Score entry' }]}>
    <div className="space-y-5">
      <Card className="sticky top-0 z-30 border-[#c8d7cd] bg-[#fffdf7]/95 shadow-md backdrop-blur"><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 font-serif text-3xl text-[#225f45]"><ClipboardCheck className="h-7 w-7" />Audited score entry</CardTitle><CardDescription>Accepted entries only. Save all changed cards before taking a break; saved scores reload when you return.</CardDescription></div><div className="flex flex-wrap items-center gap-2"><Badge variant={unsavedCount ? 'destructive' : 'outline'}>{unsavedCount} unsaved</Badge><Badge className="bg-[#225f45] text-white">{recordedScent + recordedGames} / {scentRuns.length + gameRuns.length} recorded</Badge><Button className="bg-[#225f45]" disabled={!unsavedCount || savingAll || Boolean(savingId)} onClick={() => void saveAll()}>{savingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save all changes</Button></div></div></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4"><select className="rounded-md border bg-white px-3 py-2" value={format} onChange={(event) => setFormat(event.target.value as 'scent' | 'games')}><option value="scent">Scent ({recordedScent}/{scentRuns.length})</option><option value="games">Games ({recordedGames}/{gameRuns.length})</option></select><select className="rounded-md border bg-white px-3 py-2" value={dayId} onChange={(event) => setDayId(event.target.value)}><option value="all">All trial days</option>{trial?.sdda_trial_days.map((day) => <option key={day.id} value={day.id}>Day {day.day_number} · {day.trial_date}</option>)}</select><Input className="bg-white md:col-span-2" placeholder="Search dog or handler" value={query} onChange={(event) => setQuery(event.target.value)} /></CardContent>
      </Card>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {message && <Alert className="border-green-300 bg-green-50 text-green-900"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{message}</AlertDescription></Alert>}
      {loading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-[#225f45]" /></div> : format === 'scent' ?
        <div className="space-y-3">{shownScent.map((run) => { const entry=first(run.sdda_entries), dog=first(entry?.sdda_dogs), day=first(run.sdda_trial_days), draft=scentDrafts[run.id]; return <Card key={run.id} className={dirtyScentIds.has(run.id)?'border-amber-400 bg-amber-50':'border-[#d9d8cf] bg-white'}><CardContent className="p-4"><div className="grid gap-3 xl:grid-cols-[1.3fr_1fr_.7fr_.7fr_.55fr_1.3fr_auto] xl:items-end"><div><strong className="block text-lg text-[#225f45]">{dog?.call_name || dog?.registered_name || 'Unnamed dog'}</strong><span className="text-sm text-[#68736c]">{entry?.handler_name} · Day {day?.day_number} · {run.level} {run.component} · {run.stream}</span>{dirtyScentIds.has(run.id)&&<Badge variant="outline" className="ml-2 border-amber-500 text-amber-800">Unsaved</Badge>}</div><label className="text-xs font-bold text-[#526057]">Result<select className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm" value={draft?.result || ''} onChange={(e)=>updateScentDraft(run.id,{result:e.target.value})}><option value="">Not recorded</option><option value="qualifying">Qualifying</option><option value="non_qualifying">Non-qualifying</option><option value="absent">Absent</option><option value="withdrawn">Withdrawn</option><option value="excused">Excused</option></select></label><label className="text-xs font-bold text-[#526057]">Score<Input className="mt-1 bg-white" inputMode="decimal" value={draft?.score || ''} onChange={(e)=>updateScentDraft(run.id,{score:e.target.value})} /></label><label className="text-xs font-bold text-[#526057]">Time (sec)<Input className="mt-1 bg-white" inputMode="decimal" value={draft?.time || ''} onChange={(e)=>updateScentDraft(run.id,{time:e.target.value})} /></label><label className="text-xs font-bold text-[#526057]">Faults<Input className="mt-1 bg-white" inputMode="numeric" value={draft?.faults || '0'} onChange={(e)=>updateScentDraft(run.id,{faults:e.target.value})} /></label><label className="text-xs font-bold text-[#526057]">Judge notes<Input className="mt-1 bg-white" value={draft?.notes || ''} onChange={(e)=>updateScentDraft(run.id,{notes:e.target.value})} /></label><Button className="bg-[#225f45]" disabled={savingId===run.id||savingAll} onClick={()=>void saveScent(run)}>{savingId===run.id?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}</Button></div></CardContent></Card>; })}{!shownScent.length && <Empty label="No accepted Scent runs match this view." />}</div>
        : <div className="space-y-3">{shownGames.map((run) => { const entry=first(run.sdda_entries), dog=first(entry?.sdda_dogs), day=first(run.sdda_trial_days), offering=first(run.sdda_game_offerings), draft=gameDrafts[run.id]; return <Card key={run.id} className={dirtyGameIds.has(run.id)?'border-amber-400 bg-amber-50':'border-[#d9d8cf] bg-white'}><CardContent className="p-4"><div className="grid gap-3 xl:grid-cols-[1.4fr_1fr_.8fr_1.5fr_auto] xl:items-end"><div><strong className="block text-lg text-[#225f45]">{dog?.call_name || dog?.registered_name || 'Unnamed dog'}</strong><span className="text-sm text-[#68736c]">{entry?.handler_name} · Day {day?.day_number} · {offering?.game_type}{run.aerial_division ? ` ${run.aerial_division}` : ''} · {run.entry_type}</span>{dirtyGameIds.has(run.id)&&<Badge variant="outline" className="ml-2 border-amber-500 text-amber-800">Unsaved</Badge>}</div><label className="text-xs font-bold text-[#526057]">Result<select className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm" value={draft?.result || ''} onChange={(e)=>updateGameDraft(run.id,{result:e.target.value})}><option value="">Not recorded</option><option value="pass">Pass</option><option value="fail">Fail</option><option value="absent">Absent</option><option value="withdrawn">Withdrawn</option><option value="excused">Excused</option></select></label><label className="text-xs font-bold text-[#526057]">Time (sec)<Input className="mt-1 bg-white" inputMode="decimal" value={draft?.time || ''} onChange={(e)=>updateGameDraft(run.id,{time:e.target.value})} /></label><label className="text-xs font-bold text-[#526057]">Judge notes<Input className="mt-1 bg-white" value={draft?.notes || ''} onChange={(e)=>updateGameDraft(run.id,{notes:e.target.value})} /></label><Button className="bg-[#225f45]" disabled={savingId===run.id||savingAll} onClick={()=>void saveGame(run)}>{savingId===run.id?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}</Button></div></CardContent></Card>; })}{!shownGames.length && <Empty label="No accepted Games runs match this view." />}</div>}
    </div>
  </MainLayout>;
}

function Empty({ label }: { label: string }) { return <Card className="border-dashed bg-[#fffdf7]"><CardContent className="p-10 text-center text-[#68736c]">{label}</CardContent></Card>; }
