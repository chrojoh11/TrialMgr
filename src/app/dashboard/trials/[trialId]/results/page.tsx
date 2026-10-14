'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { Award, Printer } from 'lucide-react';
import { PawLoader } from '@/components/ui/pawLoader';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { rankSddaGameResults, rankSddaHighInTrial, rankSddaScentResults } from '@/lib/sdda/results';
import { getSddaTrialWorkspace, listSddaGameScoringRuns, listSddaScoringRuns, type SddaTrialWorkspace } from '@/lib/sdda/trialRepository';

type ScentRun = Awaited<ReturnType<typeof listSddaScoringRuns>>[number];
type GameRun = Awaited<ReturnType<typeof listSddaGameScoringRuns>>[number];
function first<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] || null : value || null; }
function resultLabel(value: string | undefined) { return value ? value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()) : 'Not scored'; }

export default function ResultsPage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [scentRuns, setScentRuns] = useState<ScentRun[]>([]);
  const [gameRuns, setGameRuns] = useState<GameRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); try { const client=getSupabaseBrowser(); const [workspace, scents, games]=await Promise.all([getSddaTrialWorkspace(client,trialId),listSddaScoringRuns(client,trialId),listSddaGameScoringRuns(client,trialId)]); setTrial(workspace); setScentRuns(scents); setGameRuns(games); } catch(caught) { setError(caught instanceof Error?caught.message:'Unable to load results.'); } finally { setLoading(false); } }, [trialId]);
  useEffect(()=>{void load();},[load]);

  const scentGroups = useMemo(() => {
    const groups = new Map<string, ScentRun[]>();
    for (const run of scentRuns) { const day=first(run.sdda_trial_days); const key=`${String(day?.day_number || 0).padStart(2,'0')}|${run.level}|${run.component}|${run.stream}`; groups.set(key,[...(groups.get(key)||[]),run]); }
    return [...groups].sort(([left],[right])=>left.localeCompare(right));
  },[scentRuns]);
  const gameGroups = useMemo(() => {
    const groups = new Map<string, GameRun[]>();
    for (const run of gameRuns) { const day=first(run.sdda_trial_days), offering=first(run.sdda_game_offerings); const key=`${String(day?.day_number || 0).padStart(2,'0')}|${offering?.game_type || 'Game'}${run.aerial_division?` ${run.aerial_division}`:''}`; groups.set(key,[...(groups.get(key)||[]),run]); }
    return [...groups].sort(([left],[right])=>left.localeCompare(right));
  },[gameRuns]);
  const highInTrialGroups = useMemo(() => {
    const ranked = rankSddaHighInTrial(scentRuns.flatMap((run) => {
      const day = first(run.sdda_trial_days), entry = first(run.sdda_entries), score = first(run.sdda_scores);
      if (!day?.day_number || !entry?.dog_id) return [];
      return [{
        run, id: run.id, dogId: entry.dog_id, dayNumber: Number(day.day_number), level: run.level,
        component: run.component, result: score?.result || '', score: score?.score == null ? null : Number(score.score),
        timeSeconds: score?.time_seconds == null ? null : Number(score.time_seconds), runGroup: run.run_group,
      }];
    }));
    const groups = new Map<number, typeof ranked>();
    for (const result of ranked) groups.set(result.dayNumber, [...(groups.get(result.dayNumber) || []), result]);
    return [...groups].sort(([left], [right]) => left - right);
  }, [scentRuns]);
  const scored = scentRuns.filter((run)=>Boolean(first(run.sdda_scores))).length + gameRuns.filter((run)=>Boolean(first(run.sdda_game_scores))).length;
  const total = scentRuns.length + gameRuns.length;

  return <MainLayout title="Results & placements" breadcrumbItems={[{label:'Trials',href:'/dashboard/trials'},{label:trial?.name||'Trial',href:`/dashboard/trials/${trialId}`},{label:'Results'}]}>
    <div className="space-y-5 print:bg-white">
      <Card className="border-[#cbd9e5] bg-[#f8fafc]"><CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2 font-serif text-3xl text-[#294f73]"><Award className="h-7 w-7" />{trial?.name || 'Trial results'}</CardTitle><CardDescription>Provisional placements use qualifying/pass results only. Scent: highest score, then fastest time. Games: fastest time. Exact ties share a place. FEO runs are not placed.</CardDescription></div><div className="flex items-center gap-2"><Badge className={scored===total&&total>0?'bg-blue-700 text-white':'bg-[#6688a6] text-white'}>{scored}/{total} scored</Badge><Button variant="outline" onClick={()=>window.print()}><Printer className="mr-2 h-4 w-4" />Print / Save PDF</Button></div></div></CardHeader></Card>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {loading ? <div className="flex justify-center p-12"><PawLoader className="h-8 w-8 text-[#294f73]" /></div> : <>
        <Card className="border-blue-300 bg-blue-50"><CardHeader><CardTitle className="font-serif text-2xl text-[#294f73]">High in Trial</CardTitle><CardDescription>Calculated separately for each trial day across Started, Advanced, and Excellent. Eligible teams must qualify in all three components. Amateur and Working are combined. Highest percentage of maximum score wins; percentage of maximum allowed time breaks a score tie.</CardDescription></CardHeader></Card>
        {highInTrialGroups.map(([day,results])=><HighInTrialSection key={day} day={day} results={results}/>) }
        {!highInTrialGroups.length && total > 0 && <Card className="border-dashed"><CardContent className="p-6 text-center text-[#64748b]">No High in Trial team is eligible yet. A team appears after qualifying in Container, Interior, and Exterior on the same day and level.</CardContent></Card>}
        {scentGroups.map(([key,runs])=><ScentSection key={key} groupKey={key} runs={runs}/>) }
        {gameGroups.map(([key,runs])=><GameSection key={key} groupKey={key} runs={runs}/>) }
        {!total && <Card className="border-dashed"><CardContent className="p-12 text-center text-[#64748b]">No accepted runs are available. Accept entries before preparing results.</CardContent></Card>}
      </>}
    </div>
  </MainLayout>;
}

function HighInTrialSection({day,results}:{day:number;results:ReturnType<typeof rankSddaHighInTrial<{
  run:ScentRun;id:string;dogId:string;dayNumber:number;level:string;component:string;result:string;score:number|null;timeSeconds:number|null;runGroup:string;
}>>}) {
  return <ResultCard title={`Day ${day} · High in Trial`} description={`${results.length} eligible team${results.length===1?'':'s'} · Amateur and Working combined`}>
    <div className="grid min-w-[760px] grid-cols-[65px_1.4fr_110px_120px_120px_130px] gap-2 bg-[#dbeafe] px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-[#334155]"><span>Place</span><span>Team</span><span>Level</span><span>Total score</span><span>Score %</span><span>Time (seconds)</span></div>
    {results.map((result)=>{const representative=result.runs[0].run,entry=first(representative.sdda_entries),dog=first(entry?.sdda_dogs);return <div key={`${result.dayNumber}-${result.level}-${result.dogId}`} className="grid min-w-[760px] grid-cols-[65px_1.4fr_110px_120px_120px_130px] gap-2 border-t px-3 py-3 text-sm"><b className="text-[#294f73]">{result.placement}{ordinal(result.placement)}</b><span><strong>{dog?.call_name||dog?.registered_name||'Unnamed dog'}</strong><small className="block text-[#64748b]">{entry?.handler_name}</small></span><span>{result.level}</span><span>{result.totalScore}/{result.maximumScore}</span><span>{formatPercentage(result.scorePercentage)}</span><span>{formatSeconds(result.totalTimeSeconds)}</span></div>;})}
  </ResultCard>;
}

function ScentSection({groupKey,runs}:{groupKey:string;runs:ScentRun[]}) {
  const [day,level,component,stream]=groupKey.split('|');
  const ranked=rankSddaScentResults(runs.map((run)=>{const score=first(run.sdda_scores);return {run,id:run.id,result:score?.result||'',score:score?.score==null?null:Number(score.score),timeSeconds:score?.time_seconds==null?null:Number(score.time_seconds),runGroup:run.run_group};}));
  const placements=new Map(ranked.map((item)=>[item.id,item.placement]));
  const ordered=[...runs].sort((a,b)=>(placements.get(a.id)??999)-(placements.get(b.id)??999));
  return <ResultCard title={`Day ${Number(day)} · ${level} ${component} · ${stream}`} description={`${ranked.length} placement-eligible qualifying run${ranked.length===1?'':'s'}`}><ResultHeader scent/>{ordered.map((run)=>{const entry=first(run.sdda_entries),dog=first(entry?.sdda_dogs),score=first(run.sdda_scores),place=placements.get(run.id);return <div key={run.id} className="grid grid-cols-[55px_1.5fr_1fr_90px_100px] gap-2 border-t px-3 py-2 text-sm"><b className="text-[#294f73]">{place?`${place}${ordinal(place)}`:'—'}</b><span><strong>{dog?.call_name||dog?.registered_name}</strong><small className="block text-[#64748b]">{entry?.handler_name}</small></span><span>{resultLabel(score?.result)}{run.run_group==='FEO'?' · FEO':''}</span><span>{score?.score??'—'}</span><span>{score?.time_seconds==null?'—':`${score.time_seconds}s`}</span></div>;})}</ResultCard>;
}
function GameSection({groupKey,runs}:{groupKey:string;runs:GameRun[]}) {
  const [day,game]=groupKey.split('|');
  const ranked=rankSddaGameResults(runs.map((run)=>{const score=first(run.sdda_game_scores);return {run,id:run.id,result:score?.result||'',timeSeconds:score?.time_seconds==null?null:Number(score.time_seconds),entryType:run.entry_type};}));
  const placements=new Map(ranked.map((item)=>[item.id,item.placement]));
  const ordered=[...runs].sort((a,b)=>(placements.get(a.id)??999)-(placements.get(b.id)??999));
  return <ResultCard title={`Day ${Number(day)} · Games · ${game}`} description={`${ranked.length} placement-eligible passing run${ranked.length===1?'':'s'}`}><ResultHeader/>{ordered.map((run)=>{const entry=first(run.sdda_entries),dog=first(entry?.sdda_dogs),score=first(run.sdda_game_scores),place=placements.get(run.id);return <div key={run.id} className="grid grid-cols-[55px_1.5fr_1fr_100px] gap-2 border-t px-3 py-2 text-sm"><b className="text-[#294f73]">{place?`${place}${ordinal(place)}`:'—'}</b><span><strong>{dog?.call_name||dog?.registered_name}</strong><small className="block text-[#64748b]">{entry?.handler_name}</small></span><span>{resultLabel(score?.result)}{run.entry_type==='FEO'?' · FEO':''}</span><span>{score?.time_seconds==null?'—':`${score.time_seconds}s`}</span></div>;})}</ResultCard>;
}
function ResultCard({title,description,children}:{title:string;description:string;children:ReactNode}) { return <Card className="break-inside-avoid border-[#cbd5e1] bg-white"><CardHeader className="pb-2"><CardTitle className="font-serif text-2xl text-[#294f73]">{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="overflow-x-auto p-0">{children}</CardContent></Card>; }
function ResultHeader({scent=false}:{scent?:boolean}) { return <div className={`grid ${scent?'grid-cols-[55px_1.5fr_1fr_90px_100px]':'grid-cols-[55px_1.5fr_1fr_100px]'} gap-2 bg-[#eef3ef] px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-[#475569]`}><span>Place</span><span>Team</span><span>Result</span>{scent&&<span>Score</span>}<span>Time</span></div>; }
function ordinal(value:number){const mod100=value%100;if(mod100>=11&&mod100<=13)return'th';return value%10===1?'st':value%10===2?'nd':value%10===3?'rd':'th';}
function formatPercentage(value:number){return `${(value*100).toFixed(2)}%`;}
function formatSeconds(value:number){return `${value.toFixed(2)}s`;}
