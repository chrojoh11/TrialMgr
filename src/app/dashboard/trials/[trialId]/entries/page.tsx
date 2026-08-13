'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Dog, FileUp, Loader2, Search } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { parseSddaEntryCsv, type SddaCsvEntry } from '@/lib/sdda/entryCsv';
import { getSddaTrialWorkspace, importSddaCsvEntries, listSddaEntries, saveSddaTrialOfferings, type SddaTrialWorkspace } from '@/lib/sdda/trialRepository';
import { offeringKey } from '@/lib/sdda/offerings';

type RosterEntry = Awaited<ReturnType<typeof listSddaEntries>>[number];

export default function SddaEntriesPage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [preview, setPreview] = useState<SddaCsvEntry[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setLoading(true); setError(null); const client = getSupabaseBrowser();
      const [workspace, roster] = await Promise.all([getSddaTrialWorkspace(client, trialId), listSddaEntries(client, trialId)]);
      setTrial(workspace); setEntries(roster);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load SDDA entries.'); }
    finally { setLoading(false); }
  }, [trialId]);
  useEffect(() => { void load(); }, [load]);

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try { const parsed = parseSddaEntryCsv(await file.text()); setPreview(parsed.entries); setFileErrors(parsed.errors); setResult(null); }
    catch (caught) { setPreview([]); setFileErrors([caught instanceof Error ? caught.message : 'Unable to read CSV.']); }
  };
  const runImport = async () => {
    if (!trial || !preview.length) return;
    setImporting(true); setError(null);
    try {
      const client = getSupabaseBrowser();
      const selected = new Set(trial.sdda_trial_offerings.map((offering) => offeringKey({
        trialDayId: offering.trial_day_id, level: offering.level, component: offering.component, stream: offering.stream,
      })));
      for (const entry of preview) {
        const day = trial.sdda_trial_days.find((candidate) => candidate.day_number === entry.trialDay);
        if (!day) continue;
        entry.components.forEach((component) => selected.add(offeringKey({ trialDayId: day.id, level: entry.level, component, stream: entry.stream })));
      }
      await saveSddaTrialOfferings(client, trial.id, trial.sdda_trial_offerings, selected);
      const updatedTrial = await getSddaTrialWorkspace(client, trial.id);
      const imported = await importSddaCsvEntries(client, updatedTrial, preview);
      setResult(`${imported.imported} day/level selection${imported.imported === 1 ? '' : 's'} processed. Repeated dogs were combined into one entry, and offerings found in the CSV were added to the trial setup.`);
      setFileErrors(imported.errors); setPreview([]); await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to import SDDA entries.');
    } finally { setImporting(false); }
  };
  const filtered = useMemo(() => entries.filter((entry: any) => {
    const dog = Array.isArray(entry.sdda_dogs) ? entry.sdda_dogs[0] : entry.sdda_dogs;
    return `${entry.handler_name} ${entry.handler_email || ''} ${dog?.call_name || ''} ${dog?.sdda_registration_number || ''}`.toLowerCase().includes(search.toLowerCase());
  }), [entries, search]);

  return <MainLayout title="SDDA Entries" breadcrumbItems={[{ label: 'Trials', href: '/dashboard/trials' }, { label: trial?.name || 'Trial', href: `/dashboard/trials/${trialId}` }, { label: 'Entries' }]}>
    <div className="mx-auto max-w-6xl space-y-6">
      <div><h1 className="text-3xl font-bold">SDDA Entry Roster</h1><p className="text-gray-600">{trial?.name}</p></div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {result && <Alert><AlertDescription>{result}</AlertDescription></Alert>}
      <Card><CardHeader><CardTitle className="flex items-center"><FileUp className="mr-2 h-5 w-5" />Import Google Form CSV</CardTitle><CardDescription>Upload the same Google Form response CSV used by the original SDDA TrialDesk. Day, level, component, and stream offerings found in the file are added to this trial automatically.</CardDescription></CardHeader>
        <CardContent className="space-y-4"><Input type="file" accept=".csv,text/csv" onChange={chooseFile} />
          {preview.length > 0 && <div className="flex items-center justify-between"><p>{preview.length} valid rows ready to import.</p><Button onClick={runImport} disabled={importing}>{importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}Import entries</Button></div>}
          {fileErrors.length > 0 && <Alert variant="destructive"><AlertDescription><ul className="list-disc pl-5">{fileErrors.map((message) => <li key={message}>{message}</li>)}</ul></AlertDescription></Alert>}
        </CardContent></Card>
      <div className="relative max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><Input className="pl-10" placeholder="Search handler, dog, or SDDA number" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      {loading ? <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin" /></div> : filtered.length === 0 ? <Card><CardContent className="py-14 text-center">No SDDA entries yet.</CardContent></Card> :
        <div className="grid gap-4">{filtered.map((entry: any) => { const dog = Array.isArray(entry.sdda_dogs) ? entry.sdda_dogs[0] : entry.sdda_dogs; return <Card key={entry.id}><CardHeader><div className="flex justify-between"><CardTitle className="flex items-center"><Dog className="mr-2 h-5 w-5" />{dog?.call_name}</CardTitle><Badge>{entry.entry_status}</Badge></div><CardDescription>{entry.handler_name} • {dog?.registration_pending ? 'SDDA registration pending' : dog?.sdda_registration_number}</CardDescription></CardHeader><CardContent><div className="flex flex-wrap gap-2">{(entry.sdda_runs || []).map((run: any) => <Badge key={run.id} variant="outline">{run.level} {run.component} • {run.stream}</Badge>)}</div></CardContent></Card>; })}</div>}
    </div>
  </MainLayout>;
}
