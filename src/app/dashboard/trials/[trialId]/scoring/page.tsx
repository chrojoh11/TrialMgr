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
      if (!scents.length && games.length) setFormat('games');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load score entry.'); }
    finally { setLoading(false); }
  }, [trialId]);
  useEffect(() => { void load(); }, [load]);

  const matches = useCallback((run: ScentRun | GameRun) => {
    if (dayId !== 'all' && run.trial_day_id !== dayId) return false;
    const entry = first(run.sdda_entries); const dog = first(entry?.sdda_dogs);
    return `${entry?.handler_name || ''} ${dog?.call_name || ''} ${dog?.registered_name || ''}`.toLowerCase().includes(query.toLowerCase());
  }, [dayId, query]);
  const shownScent = useMemo(() => scentRuns.filter(matches), [scentRuns, matches]);
  const shownGames = useMemo(() => gameRuns.filter(matches), [gameRuns, matches]);
  const recordedScent = scentRuns.filter((run) => Boolean(first(run.sdda_scores))).length;
  const recordedGames = gameRuns.filter((run) => Boolean(first(run.sdda_game_scores))).length;

  const saveScent = async (run: ScentRun) => {
    const draft = scentDrafts[run.id]; if (!draft?.result) { setError('Choose a result before saving.'); return; }
    const score = numberOrNull(draft.score), time = numberOrNull(draft.time), faults = Number(draft.faults || 0);
    if ([score, time, faults].some((value) => value !== null && !Number.isFinite(value))) { setError('Score, time and faults must be valid numbers.'); return; }
    setSavingId(run.id); setError(''); setMessage('');
    try { await recordSddaScentScore(getSupabaseBrowser(), { runId: run.id, result: draft.result, score, timeSeconds: time, faults, notes: draft.notes }); setMessage('Scent result saved and recorded in the activity journal.'); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save Scent result.'); }
    finally { setSavingId(null); }
  };
  const saveGame = async (run: GameRun) => {
    const draft = gameDrafts[run.id]; if (!draft?.result) { setError('Choose a result before saving.'); return; }
    const time = numberOrNull(draft.time); if (time !== null && !Number.isFinite(time)) { setError('Time must be a valid number.'); return; }
    setSavingId(run.id); setError(''); setMessage('');
    try { await recordSddaGameScore(getSupabaseBrowser(), { runId: run.id, result: draft.result, timeSeconds: time, notes: draft.notes }); setMessage('Games result saved and recorded in the activity journal.'); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save Games result.'); }
    finally { setSavingId(null); }
  };

  return <MainLayout title="Score entry" breadcrumbItems={[{ label: 'Trials', href: '/dashboard/trials' }, { label: trial?.name || 'Trial', href: `/dashboard/trials/${trialId}` }, { label: 'Score entry' }]}>
    <div className="space-y-5">
      <Card className="border-[#c8d7cd] bg-[#fffdf7]"><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 font-serif text-3xl text-[#225f45]"><ClipboardCheck className="h-7 w-7" />Audited score entry</CardTitle><CardDescription>Accepted entries only. Every save and correction is preserved in the activity journal and feeds the official workbook.</CardDescription></div><Badge className="bg-[#225f45] text-white">{recordedScent + recordedGames} / {scentRuns.length + gameRuns.length} recorded</Badge></div></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4"><select className="rounded-md border bg-white px-3 py-2" value={format} onChange={(event) => setFormat(event.target.value as 'scent' | 'games')}><option value="scent">Scent ({recordedScent}/{scentRuns.length})</option><option value="games">Games ({recordedGames}/{gameRuns.length})</option></select><select className="rounded-md border bg-white px-3 py-2" value={dayId} onChange={(event) => setDayId(event.target.value)}><option value="all">All trial days</option>{trial?.sdda_trial_days.map((day) => <option key={day.id} value={day.id}>Day {day.day_number} · {day.trial_date}</option>)}</select><Input className="bg-white md:col-span-2" placeholder="Search dog or handler" value={query} onChange={(event) => setQuery(event.target.value)} /></CardContent>
      </Card>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {message && <Alert className="border-green-300 bg-green-50 text-green-900"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{message}</AlertDescription></Alert>}
      {loading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-[#225f45]" /></div> : format === 'scent' ?
        <div className="space-y-3">{shownScent.map((run) => { const entry=first(run.sdda_entries), dog=first(entry?.sdda_dogs), day=first(run.sdda_trial_days), draft=scentDrafts[run.id]; return <Card key={run.id} className="border-[#d9d8cf] bg-white"><CardContent className="p-4"><div className="grid gap-3 xl:grid-cols-[1.3fr_1fr_.7fr_.7fr_.55fr_1.3fr_auto] xl:items-end"><div><strong className="block text-lg text-[#225f45]">{dog?.call_name || dog?.registered_name || 'Unnamed dog'}</strong><span className="text-sm text-[#68736c]">{entry?.handler_name} · Day {day?.day_number} · {run.level} {run.component} · {run.stream}</span></div><label className="text-xs font-bold text-[#526057]">Result<select className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm" value={draft?.result || ''} onChange={(e)=>setScentDrafts((current)=>({...current,[run.id]:{...draft,result:e.target.value}}))}><option value="">Not recorded</option><option value="qualifying">Qualifying</option><option value="non_qualifying">Non-qualifying</option><option value="absent">Absent</option><option value="withdrawn">Withdrawn</option><option value="excused">Excused</option></select></label><label className="text-xs font-bold text-[#526057]">Score<Input className="mt-1 bg-white" inputMode="decimal" value={draft?.score || ''} onChange={(e)=>setScentDrafts((current)=>({...current,[run.id]:{...draft,score:e.target.value}}))} /></label><label className="text-xs font-bold text-[#526057]">Time (sec)<Input className="mt-1 bg-white" inputMode="decimal" value={draft?.time || ''} onChange={(e)=>setScentDrafts((current)=>({...current,[run.id]:{...draft,time:e.target.value}}))} /></label><label className="text-xs font-bold text-[#526057]">Faults<Input className="mt-1 bg-white" inputMode="numeric" value={draft?.faults || '0'} onChange={(e)=>setScentDrafts((current)=>({...current,[run.id]:{...draft,faults:e.target.value}}))} /></label><label className="text-xs font-bold text-[#526057]">Judge notes<Input className="mt-1 bg-white" value={draft?.notes || ''} onChange={(e)=>setScentDrafts((current)=>({...current,[run.id]:{...draft,notes:e.target.value}}))} /></label><Button className="bg-[#225f45]" disabled={savingId===run.id} onClick={()=>void saveScent(run)}>{savingId===run.id?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}</Button></div></CardContent></Card>; })}{!shownScent.length && <Empty label="No accepted Scent runs match this view." />}</div>
        : <div className="space-y-3">{shownGames.map((run) => { const entry=first(run.sdda_entries), dog=first(entry?.sdda_dogs), day=first(run.sdda_trial_days), offering=first(run.sdda_game_offerings), draft=gameDrafts[run.id]; return <Card key={run.id} className="border-[#d9d8cf] bg-white"><CardContent className="p-4"><div className="grid gap-3 xl:grid-cols-[1.4fr_1fr_.8fr_1.5fr_auto] xl:items-end"><div><strong className="block text-lg text-[#225f45]">{dog?.call_name || dog?.registered_name || 'Unnamed dog'}</strong><span className="text-sm text-[#68736c]">{entry?.handler_name} · Day {day?.day_number} · {offering?.game_type}{run.aerial_division ? ` ${run.aerial_division}` : ''} · {run.entry_type}</span></div><label className="text-xs font-bold text-[#526057]">Result<select className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm" value={draft?.result || ''} onChange={(e)=>setGameDrafts((current)=>({...current,[run.id]:{...draft,result:e.target.value}}))}><option value="">Not recorded</option><option value="pass">Pass</option><option value="fail">Fail</option><option value="absent">Absent</option><option value="withdrawn">Withdrawn</option><option value="excused">Excused</option></select></label><label className="text-xs font-bold text-[#526057]">Time (sec)<Input className="mt-1 bg-white" inputMode="decimal" value={draft?.time || ''} onChange={(e)=>setGameDrafts((current)=>({...current,[run.id]:{...draft,time:e.target.value}}))} /></label><label className="text-xs font-bold text-[#526057]">Judge notes<Input className="mt-1 bg-white" value={draft?.notes || ''} onChange={(e)=>setGameDrafts((current)=>({...current,[run.id]:{...draft,notes:e.target.value}}))} /></label><Button className="bg-[#225f45]" disabled={savingId===run.id} onClick={()=>void saveGame(run)}>{savingId===run.id?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}</Button></div></CardContent></Card>; })}{!shownGames.length && <Empty label="No accepted Games runs match this view." />}</div>}
    </div>
  </MainLayout>;
}

function Empty({ label }: { label: string }) { return <Card className="border-dashed bg-[#fffdf7]"><CardContent className="p-10 text-center text-[#68736c]">{label}</CardContent></Card>; }
