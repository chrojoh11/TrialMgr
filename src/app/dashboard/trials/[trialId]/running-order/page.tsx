'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowDown, ArrowUp, ListOrdered, Loader2, Save, Wand2 } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { SDDA_COMPONENTS, SDDA_LEVELS, type SddaComponent, type SddaLevel } from '@/lib/sdda/offerings';
import { findSddaScheduleConflicts, moveSddaRun, orderSddaRuns } from '@/lib/sdda/runningOrder';
import { getSddaTrialWorkspace, listSddaRunningOrderRuns, saveSddaRunningOrder, type SddaTrialWorkspace } from '@/lib/sdda/trialRepository';

type Run = Awaited<ReturnType<typeof listSddaRunningOrderRuns>>[number];

export default function RunningOrderPage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [allRuns, setAllRuns] = useState<Run[]>([]);
  const [dayId, setDayId] = useState(''); const [level, setLevel] = useState<SddaLevel>('Started');
  const [component, setComponent] = useState<SddaComponent>('Container'); const [ordered, setOrdered] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => { try { setLoading(true); const client=getSupabaseBrowser(); const [workspace,runs]=await Promise.all([getSddaTrialWorkspace(client,trialId),listSddaRunningOrderRuns(client,trialId)]); workspace.sdda_trial_days.sort((a,b)=>a.day_number-b.day_number); setTrial(workspace); setDayId((value)=>value||workspace.sdda_trial_days[0]?.id||''); setAllRuns(runs); setError(null); } catch(caught){setError(caught instanceof Error?caught.message:'Unable to load running orders.');} finally{setLoading(false);} },[trialId]);
  useEffect(()=>{void load();},[load]);
  const group = useMemo(()=>allRuns.filter((run:any)=>run.trial_day_id===dayId&&run.level===level&&run.component===component),[allRuns,dayId,level,component]);
  useEffect(()=>{setOrdered([...group].sort((a:any,b:any)=>(a.running_position??9999)-(b.running_position??9999)));},[group]);

  const normalize = (runs: Run[]) => runs.map((run:any,index)=>{const entry=Array.isArray(run.sdda_entries)?run.sdda_entries[0]:run.sdda_entries; return {id:run.id,dayIndex:trial?.sdda_trial_days.findIndex((day)=>day.id===run.trial_day_id)??0,level:run.level,component:run.component,handlerId:entry?.handler_name||'',dogId:entry?.dog_id||'',group:run.run_group,order:run.running_position??index+1,raw:run};});
  const conflicts = findSddaScheduleConflicts(normalize(ordered));
  const autoOrder=()=>setOrdered(orderSddaRuns(normalize(group)).map((item:any)=>item.raw));
  const save=async()=>{try{setSaving(true);setError(null);await saveSddaRunningOrder(getSupabaseBrowser(),{trialId,trialDayId:dayId,level,component,runIds:ordered.map((run:any)=>run.id)});await load();}catch(caught){setError(caught instanceof Error?caught.message:'Unable to save running order.');}finally{setSaving(false);}};

  return <MainLayout title="SDDA Running Orders" breadcrumbItems={[{label:'Trials',href:'/dashboard/trials'},{label:trial?.name||'Trial',href:`/dashboard/trials/${trialId}`},{label:'Running orders'}]}><div className="mx-auto max-w-5xl space-y-6">
    <div><h1 className="flex items-center text-3xl font-bold"><ListOrdered className="mr-3 h-7 w-7" />SDDA Running Orders</h1><p className="text-gray-600">Officials, Regular, Second dog, FEO, then BIS—with conflict warnings.</p></div>
    {error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <Card><CardContent className="grid gap-3 pt-6 md:grid-cols-3"><Select value={dayId} onValueChange={setDayId}><SelectTrigger><SelectValue placeholder="Trial day" /></SelectTrigger><SelectContent>{trial?.sdda_trial_days.map((day)=><SelectItem key={day.id} value={day.id}>Day {day.day_number}: {day.trial_date}</SelectItem>)}</SelectContent></Select><Select value={level} onValueChange={(value)=>setLevel(value as SddaLevel)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SDDA_LEVELS.map((value)=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Select value={component} onValueChange={(value)=>setComponent(value as SddaComponent)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SDDA_COMPONENTS.map((value)=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></CardContent></Card>
    {conflicts.length>0&&<Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription><ul>{conflicts.map((conflict)=><li key={conflict.runIds.join('-')}>{conflict.message}</li>)}</ul></AlertDescription></Alert>}
    <Card><CardHeader><div className="flex items-center justify-between"><div><CardTitle>{level} {component}</CardTitle><CardDescription>{ordered.length} runs</CardDescription></div><div className="flex gap-2"><Button variant="outline" onClick={autoOrder} disabled={!ordered.length}><Wand2 className="mr-2 h-4 w-4" />Apply SDDA order</Button><Button onClick={save} disabled={saving||!ordered.length}>{saving?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Save className="mr-2 h-4 w-4"/>}Save</Button></div></div></CardHeader><CardContent className="space-y-2">{loading?<Loader2 className="mx-auto h-8 w-8 animate-spin"/>:ordered.length===0?<p className="py-8 text-center text-gray-500">No runs for this offering.</p>:ordered.map((run:any,index)=>{const entry=Array.isArray(run.sdda_entries)?run.sdda_entries[0]:run.sdda_entries;const dog=Array.isArray(entry?.sdda_dogs)?entry.sdda_dogs[0]:entry?.sdda_dogs;return <div key={run.id} className="flex items-center gap-3 rounded-md border p-3"><span className="w-8 text-center font-bold">{index+1}</span><div className="flex-1"><p className="font-medium">{dog?.call_name} — {entry?.handler_name}</p><p className="text-sm text-gray-500">{dog?.sdda_registration_number||'Registration pending'}</p></div><Badge variant="outline">{run.run_group}</Badge><Button size="sm" variant="ghost" disabled={index===0} onClick={()=>setOrdered(moveSddaRun(ordered,index,index-1))}><ArrowUp className="h-4 w-4"/></Button><Button size="sm" variant="ghost" disabled={index===ordered.length-1} onClick={()=>setOrdered(moveSddaRun(ordered,index,index+1))}><ArrowDown className="h-4 w-4"/></Button></div>;})}</CardContent></Card>
  </div></MainLayout>;
}
