'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { Award, Loader2, Printer } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { rankSddaGameResults, rankSddaScentResults } from '@/lib/sdda/results';
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
  const scored = scentRuns.filter((run)=>Boolean(first(run.sdda_scores))).length + gameRuns.filter((run)=>Boolean(first(run.sdda_game_scores))).length;
  const total = scentRuns.length + gameRuns.length;

  return <MainLayout title="Results & placements" breadcrumbItems={[{label:'Trials',href:'/dashboard/trials'},{label:trial?.name||'Trial',href:`/dashboard/trials/${trialId}`},{label:'Results'}]}>
    <div className="space-y-5 print:bg-white">
      <Card className="border-[#c8d7cd] bg-[#fffdf7]"><CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2 font-serif text-3xl text-[#225f45]"><Award className="h-7 w-7" />{trial?.name || 'Trial results'}</CardTitle><CardDescription>Provisional placements use qualifying/pass results only. Scent: highest score, then fastest time. Games: fastest time. Exact ties share a place. FEO runs are not placed.</CardDescription></div><div className="flex items-center gap-2"><Badge className={scored===total&&total>0?'bg-green-700 text-white':'bg-[#b98935] text-white'}>{scored}/{total} scored</Badge><Button variant="outline" onClick={()=>window.print()}><Printer className="mr-2 h-4 w-4" />Print / Save PDF</Button></div></div></CardHeader></Card>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {loading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-[#225f45]" /></div> : <>
        {scentGroups.map(([key,runs])=><ScentSection key={key} groupKey={key} runs={runs}/>) }
        {gameGroups.map(([key,runs])=><GameSection key={key} groupKey={key} runs={runs}/>) }
        {!total && <Card className="border-dashed"><CardContent className="p-12 text-center text-[#68736c]">No accepted runs are available. Accept entries before preparing results.</CardContent></Card>}
      </>}
    </div>
  </MainLayout>;
}

function ScentSection({groupKey,runs}:{groupKey:string;runs:ScentRun[]}) {
  const [day,level,component,stream]=groupKey.split('|');
  const ranked=rankSddaScentResults(runs.map((run)=>{const score=first(run.sdda_scores);return {run,id:run.id,result:score?.result||'',score:score?.score==null?null:Number(score.score),timeSeconds:score?.time_seconds==null?null:Number(score.time_seconds),runGroup:run.run_group};}));
  const placements=new Map(ranked.map((item)=>[item.id,item.placement]));
  const ordered=[...runs].sort((a,b)=>(placements.get(a.id)??999)-(placements.get(b.id)??999));
  return <ResultCard title={`Day ${Number(day)} · ${level} ${component} · ${stream}`} description={`${ranked.length} placement-eligible qualifying run${ranked.length===1?'':'s'}`}><ResultHeader scent/>{ordered.map((run)=>{const entry=first(run.sdda_entries),dog=first(entry?.sdda_dogs),score=first(run.sdda_scores),place=placements.get(run.id);return <div key={run.id} className="grid grid-cols-[55px_1.5fr_1fr_90px_100px] gap-2 border-t px-3 py-2 text-sm"><b className="text-[#225f45]">{place?`${place}${ordinal(place)}`:'—'}</b><span><strong>{dog?.call_name||dog?.registered_name}</strong><small className="block text-[#68736c]">{entry?.handler_name}</small></span><span>{resultLabel(score?.result)}{run.run_group==='FEO'?' · FEO':''}</span><span>{score?.score??'—'}</span><span>{score?.time_seconds==null?'—':`${score.time_seconds}s`}</span></div>;})}</ResultCard>;
}
function GameSection({groupKey,runs}:{groupKey:string;runs:GameRun[]}) {
  const [day,game]=groupKey.split('|');
  const ranked=rankSddaGameResults(runs.map((run)=>{const score=first(run.sdda_game_scores);return {run,id:run.id,result:score?.result||'',timeSeconds:score?.time_seconds==null?null:Number(score.time_seconds),entryType:run.entry_type};}));
  const placements=new Map(ranked.map((item)=>[item.id,item.placement]));
  const ordered=[...runs].sort((a,b)=>(placements.get(a.id)??999)-(placements.get(b.id)??999));
  return <ResultCard title={`Day ${Number(day)} · Games · ${game}`} description={`${ranked.length} placement-eligible passing run${ranked.length===1?'':'s'}`}><ResultHeader/>{ordered.map((run)=>{const entry=first(run.sdda_entries),dog=first(entry?.sdda_dogs),score=first(run.sdda_game_scores),place=placements.get(run.id);return <div key={run.id} className="grid grid-cols-[55px_1.5fr_1fr_100px] gap-2 border-t px-3 py-2 text-sm"><b className="text-[#225f45]">{place?`${place}${ordinal(place)}`:'—'}</b><span><strong>{dog?.call_name||dog?.registered_name}</strong><small className="block text-[#68736c]">{entry?.handler_name}</small></span><span>{resultLabel(score?.result)}{run.entry_type==='FEO'?' · FEO':''}</span><span>{score?.time_seconds==null?'—':`${score.time_seconds}s`}</span></div>;})}</ResultCard>;
}
function ResultCard({title,description,children}:{title:string;description:string;children:ReactNode}) { return <Card className="break-inside-avoid border-[#d9d8cf] bg-white"><CardHeader className="pb-2"><CardTitle className="font-serif text-2xl text-[#225f45]">{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="overflow-x-auto p-0">{children}</CardContent></Card>; }
function ResultHeader({scent=false}:{scent?:boolean}) { return <div className={`grid ${scent?'grid-cols-[55px_1.5fr_1fr_90px_100px]':'grid-cols-[55px_1.5fr_1fr_100px]'} gap-2 bg-[#eef3ef] px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-[#526057]`}><span>Place</span><span>Team</span><span>Result</span>{scent&&<span>Score</span>}<span>Time</span></div>; }
function ordinal(value:number){const mod100=value%100;if(mod100>=11&&mod100<=13)return'th';return value%10===1?'st':value%10===2?'nd':value%10===3?'rd':'th';}
