'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import {
  buildOfficialSddaWorkbook,
  officialWorkbookDogNumbers,
  reviewOfficialSddaWorkbook,
  type OfficialWorkbookRun,
} from '@/lib/sdda/officialWorkbook';
import {
  getSddaTrialWorkspace,
  listSddaOfficialWorkbookRuns,
  type SddaTrialWorkspace,
} from '@/lib/sdda/trialRepository';

const templatePath = '/templates/sdda/TrialWorkbook-20260729.xlsx';
const safeName = (value: string) => value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
const first = <T,>(value: T | T[] | null | undefined): T | undefined => Array.isArray(value) ? value[0] : value || undefined;

type PreparedRun = OfficialWorkbookRun & { entryStatus: string };

export default function SddaOfficialWorkbookPage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [runs, setRuns] = useState<PreparedRun[]>([]);
  const [registryNumbers, setRegistryNumbers] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const client = getSupabaseBrowser();
      const [workspace, records, templateResponse] = await Promise.all([
        getSddaTrialWorkspace(client, trialId),
        listSddaOfficialWorkbookRuns(client, trialId),
        fetch(templatePath),
      ]);
      if (!templateResponse.ok) throw new Error('The untouched official SDDA workbook template could not be loaded.');
      setRegistryNumbers(officialWorkbookDogNumbers(new Uint8Array(await templateResponse.arrayBuffer())));
      workspace.sdda_trial_days.sort((a, b) => a.day_number - b.day_number);
      const days = new Map(workspace.sdda_trial_days.map((day) => [day.id, day.day_number]));
      setTrial(workspace);
      setRuns(records.map((record: any) => {
        const entry = first(record.sdda_entries);
        const dog = first(entry?.sdda_dogs);
        const score = first(record.sdda_scores);
        return {
          dayNumber: days.get(record.trial_day_id) || 0,
          level: record.level,
          component: record.component,
          stream: record.stream,
          dogNumber: dog?.sdda_registration_number || '',
          runGroup: record.feo ? 'FEO' : record.run_group,
          result: score?.result,
          score: score?.score == null ? null : Number(score.score),
          timeSeconds: score?.time_seconds == null ? null : Number(score.time_seconds),
          entryStatus: entry?.entry_status || '',
        } as PreparedRun;
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load official workbook data.');
    } finally {
      setLoading(false);
    }
  }, [trialId]);

  useEffect(() => { void load(); }, [load]);

  const dayGroups = useMemo(() => {
    const days = trial?.sdda_trial_days || [];
    return Array.from({ length: Math.ceil(days.length / 2) }, (_, index) => days.slice(index * 2, index * 2 + 2));
  }, [trial]);
  const enteredRuns = useMemo(() => runs.filter((run) => run.entryStatus === 'entered'), [runs]);
  const excludedRuns = runs.length - enteredRuns.length;

  const groupInput = (index: number) => {
    if (!trial) return null;
    const days = dayGroups[index];
    const selectedDays = new Set(days.map((day) => day.day_number));
    return {
      days: days.map((day) => ({
        dayNumber: day.day_number,
        trialNumber: day.sdda_trial_number || '',
        trialDate: day.trial_date,
        judgeName: day.judge_name || undefined,
      })),
      venue: trial.venue || '',
      runs: enteredRuns.filter((run) => selectedDays.has(run.dayNumber)),
    };
  };

  const exportGroup = async (index: number) => {
    if (!trial) return;
    const days = dayGroups[index];
    const input = groupInput(index);
    if (!input) return;
    try {
      setExporting(index);
      setError(null);
      const response = await fetch(templatePath);
      if (!response.ok) throw new Error('The untouched official SDDA workbook template could not be loaded.');
      const issues = reviewOfficialSddaWorkbook(input, registryNumbers || undefined);
      if (issues.some((issue) => issue.severity === 'blocker')) throw new Error('Resolve the workbook blockers shown on this page before exporting.');
      const bytes = buildOfficialSddaWorkbook(new Uint8Array(await response.arrayBuffer()), input);
      const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${safeName(trial.name)}-official-SDDA-workbook-days-${days.map((day) => day.day_number).join('-')}.xlsx`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to export the official SDDA workbook.');
    } finally {
      setExporting(null);
    }
  };

  return <MainLayout title="Official SDDA workbook" breadcrumbItems={[{ label: 'Trials', href: '/dashboard/trials' }, { label: trial?.name || 'Trial', href: `/dashboard/trials/${trialId}` }, { label: 'Official workbook' }]}>
    <div className="mx-auto max-w-5xl space-y-6">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Card><CardHeader><CardTitle className="flex items-center"><FileSpreadsheet className="mr-2 h-5 w-5" />SDDA Trial Results Workbook</CardTitle><CardDescription>Creates a fresh copy of the untouched July 2026 official workbook and fills its designated trial, dog-number, stream, score, time, and judge cells. Official formulas, validation, print areas, Games, Summary, High-in-Trial, fees, labels, and formatted-results sheets remain in place.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Badge variant="outline">{enteredRuns.length} entered scent runs</Badge>{excludedRuns > 0 && <Badge variant="outline">{excludedRuns} waitlisted/withdrawn runs excluded</Badge>}</CardContent></Card>
      <Alert><AlertDescription>Open the downloaded workbook in Excel so its original formulas recalculate. Review the official results before submission. SDDA Games sheets are preserved exactly; Games entry and scoring will be connected as its own SDDA workflow rather than borrowing the old C-WAGS games system.</AlertDescription></Alert>
      {loading ? <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin" /></div> : dayGroups.map((days, index) => {
        const selected = new Set(days.map((day) => day.day_number));
        const count = enteredRuns.filter((run) => selected.has(run.dayNumber)).length;
        const input = groupInput(index);
        const issues = input ? reviewOfficialSddaWorkbook(input, registryNumbers || undefined) : [];
        const blockers = issues.filter((issue) => issue.severity === 'blocker');
        return <Card key={index}><CardHeader><CardTitle>Days {days.map((day) => day.day_number).join('–')}</CardTitle><CardDescription>{days.map((day) => `${day.trial_date}${day.sdda_trial_number ? ` · ${day.sdda_trial_number}` : ' · trial number pending'}`).join(' | ')}</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex items-center gap-3"><Button onClick={() => void exportGroup(index)} disabled={exporting !== null || count === 0 || blockers.length > 0}>{exporting === index ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Export official workbook</Button><Badge variant="outline">{count} runs</Badge></div>{issues.length > 0 ? <div className="space-y-2">{issues.map((issue) => <div key={issue.message} className={`rounded-md border px-3 py-2 text-sm ${issue.severity === 'blocker' ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}><strong>{issue.severity === 'blocker' ? 'Required: ' : 'Review: '}</strong>{issue.message}</div>)}</div> : <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">Workbook data checks passed.</div>}</CardContent></Card>;
      })}
    </div>
  </MainLayout>;
}
