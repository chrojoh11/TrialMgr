'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Download, FileText, Loader2, Printer } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { buildSddaJudgePacket, type SddaScoreSheetRun } from '@/lib/sdda/scoreSheetPdf';
import { getSddaTrialWorkspace, listSddaRunningOrderRuns, type SddaTrialWorkspace } from '@/lib/sdda/trialRepository';

const safeName = (value: string) => value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');

export default function SddaScoreSheetsPage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [runs, setRuns] = useState<SddaScoreSheetRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const client = getSupabaseBrowser();
      const [workspace, records] = await Promise.all([getSddaTrialWorkspace(client, trialId), listSddaRunningOrderRuns(client, trialId)]);
      workspace.sdda_trial_days.sort((a, b) => a.day_number - b.day_number);
      const days = new Map(workspace.sdda_trial_days.map((day) => [day.id, day]));
      const prepared = records.map((record: any) => {
        const entry = Array.isArray(record.sdda_entries) ? record.sdda_entries[0] : record.sdda_entries;
        const dog = Array.isArray(entry?.sdda_dogs) ? entry.sdda_dogs[0] : entry?.sdda_dogs;
        const day = days.get(record.trial_day_id)!;
        return {
          id: record.id, dayNumber: day.day_number,
          trialNumber: day.sdda_trial_number || workspace.name,
          trialDate: day.trial_date,
          level: record.level, component: record.component, stream: record.stream,
          dogName: dog?.registered_name || dog?.call_name || '', breed: dog?.breed || '',
          dogNumber: dog?.sdda_registration_number || 'Pending', alerts: entry?.formal_alerts || '',
          order: record.running_position || Number.MAX_SAFE_INTEGER,
        } as SddaScoreSheetRun;
      }).sort((a, b) => a.dayNumber - b.dayNumber || a.level.localeCompare(b.level) || a.component.localeCompare(b.component) || a.order - b.order);
      const groupPositions = new Map<string, number>();
      prepared.forEach((run) => { const key = `${run.dayNumber}|${run.level}|${run.component}`; const position = (groupPositions.get(key) || 0) + 1; groupPositions.set(key, position); if (run.order === Number.MAX_SAFE_INTEGER) run.order = position; });
      setTrial(workspace); setRuns(prepared);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load SDDA score sheets.'); }
    finally { setLoading(false); }
  }, [trialId]);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => new Map((trial?.sdda_trial_days || []).map((day) => [day.day_number, runs.filter((run) => run.dayNumber === day.day_number).length])), [runs, trial]);

  const exportPacket = async (dayNumber?: number) => {
    const packetRuns = dayNumber ? runs.filter((run) => run.dayNumber === dayNumber) : runs;
    const key = dayNumber ? `day-${dayNumber}` : 'complete';
    try {
      setExporting(key); setError(null);
      const bytes = await buildSddaJudgePacket(packetRuns, async (path) => {
        const response = await fetch(path); if (!response.ok) throw new Error(`Official score-sheet template could not be loaded: ${path}`); return response.arrayBuffer();
      });
      const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url;
      anchor.download = `SDDA-${safeName(trial?.name || 'trial')}-${dayNumber ? `day-${dayNumber}` : 'complete'}-judge-packet.pdf`;
      anchor.click(); URL.revokeObjectURL(url);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to export SDDA score sheets.'); }
    finally { setExporting(null); }
  };

  return <MainLayout title="Official SDDA score sheets" breadcrumbItems={[{ label: 'Trials', href: '/dashboard/trials' }, { label: trial?.name || 'Trial', href: `/dashboard/trials/${trialId}` }, { label: 'Score sheets' }]}>
    <div className="mx-auto max-w-5xl space-y-6">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Card><CardHeader><CardTitle className="flex items-center"><Printer className="mr-2 h-5 w-5" />Judge packets</CardTitle><CardDescription>Prefilled official SDDA portrait score sheets. Each level and component uses its own audited PDF template and coordinate map.</CardDescription></CardHeader><CardContent className="flex flex-wrap items-center gap-3"><Button onClick={() => void exportPacket()} disabled={loading || !runs.length || exporting !== null}>{exporting === 'complete' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Export complete packet</Button><Badge variant="outline">{runs.length} score sheets</Badge></CardContent></Card>
      {loading ? <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin" /></div> : (trial?.sdda_trial_days || []).map((day) => <Card key={day.id}><CardHeader><CardTitle className="flex items-center"><FileText className="mr-2 h-5 w-5" />Day {day.day_number} - {day.trial_date}</CardTitle><CardDescription>{day.sdda_trial_number ? `SDDA trial ${day.sdda_trial_number}` : 'SDDA trial number pending'} - {counts.get(day.day_number) || 0} sheets</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => void exportPacket(day.day_number)} disabled={!counts.get(day.day_number) || exporting !== null}>{exporting === `day-${day.day_number}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Export Day {day.day_number} packet</Button></CardContent></Card>)}
    </div>
  </MainLayout>;
}
