'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, Database, Loader2, RefreshCw, Search, Trophy } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { getSddaTrialWorkspace, listSddaEntries, type SddaTrialWorkspace } from '@/lib/sdda/trialRepository';
import { parseSddaHistoryWorkbook, titleHistoryFlags, type SddaDogHistorySummary } from '@/lib/sdda/titleHistoryWorkbook';

type Entry = Awaited<ReturnType<typeof listSddaEntries>>[number];

function registrationKey(value: unknown) {
  return String(value || '').toUpperCase().replace(/^SD[-\s]*/i, '').replace(/[^A-Z0-9]/g, '');
}

export default function SddaTitleWatchPage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<Map<string, SddaDogHistorySummary>>(new Map());
  const [historySource, setHistorySource] = useState('');
  const [historyRefreshed, setHistoryRefreshed] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadOfficialHistory = useCallback(async () => {
    try {
      setHistoryLoading(true); setError(null);
      const response = await fetch('/api/sdda/latest-workbook', { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Unable to retrieve the latest official SDDA workbook.');
      }
      const parsed = parseSddaHistoryWorkbook(await response.arrayBuffer());
      setHistory(new Map(parsed.dogs.map((dog) => [registrationKey(dog.registrationNumber), dog])));
      setHistorySource(response.headers.get('x-sdda-source') || 'SDDA Forms');
      setHistoryRefreshed(parsed.refreshedAt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load official SDDA history.');
    } finally { setHistoryLoading(false); }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const client = getSupabaseBrowser();
      const [workspace, roster] = await Promise.all([
        getSddaTrialWorkspace(client, trialId),
        listSddaEntries(client, trialId),
      ]);
      setTrial(workspace); setEntries(roster);
      void loadOfficialHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load title watch.');
    } finally { setLoading(false); }
  }, [trialId, loadOfficialHistory]);
  useEffect(() => { void load(); }, [load]);

  const watched = useMemo(() => entries.map((entry: any) => {
    const dog = Array.isArray(entry.sdda_dogs) ? entry.sdda_dogs[0] : entry.sdda_dogs;
    const moveUp = (entry.sdda_runs || []).some((run: any) => run.move_up_approved_at || run.move_up_from_level);
    const official = history.get(registrationKey(dog?.sdda_registration_number));
    const flags = official ? titleHistoryFlags(official, entry.sdda_runs || []) : [];
    const text = `${entry.handler_name} ${dog?.call_name || ''} ${dog?.sdda_registration_number || ''} ${entry.title_watch_note || ''}`.toLowerCase();
    return { entry, dog, official, flags, moveUp, matches: text.includes(search.toLowerCase()) };
  }).filter((item) => item.matches && (item.entry.title_watch_note || item.moveUp || item.flags.length)), [entries, history, search]);

  return <MainLayout title="Title watch" breadcrumbItems={[
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Trials', href: '/dashboard/trials' },
    { label: trial?.name || 'Trial', href: `/dashboard/trials/${trialId}` },
    { label: 'Title watch' },
  ]}><div className="mx-auto max-w-6xl space-y-6">
    <div><h1 className="flex items-center text-3xl font-bold"><Trophy className="mr-3 h-7 w-7 text-[#b98935]" />Title watch</h1><p className="mt-1 text-gray-600">{trial?.name}</p></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <Card><CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="flex items-center"><Database className="mr-2 h-5 w-5" />Official SDDA history snapshot</CardTitle><CardDescription>{history.size ? `${history.size} registered dogs loaded${historyRefreshed ? ` · database refreshed ${historyRefreshed}` : ''}` : historyLoading ? 'Retrieving the latest Trial Workbook from the SDDA Forms page…' : 'Official history has not loaded.'}</CardDescription>{historySource && <p className="mt-1 break-all text-xs text-gray-500">Source: {historySource}</p>}</div><button type="button" disabled={historyLoading} onClick={() => void loadOfficialHistory()} className="flex items-center rounded-md border border-[#bac5bd] bg-white px-4 py-2 font-semibold text-[#225f45] disabled:opacity-60">{historyLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Refresh history</button></CardHeader></Card>
    <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>Component Q counts come from the current official SDDA Trial Workbook and support title proximity and level-specific Working review. The workbook does not contain the detailed component scores needed to prove Gold or Championship combinations.</AlertDescription></Alert>
    <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><Input className="bg-white pl-10" placeholder="Search handler, dog, SDDA number, or title note" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
    {loading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div> : watched.length === 0 ? <Card><CardContent className="py-14 text-center text-gray-500">No immediate title opportunities, title notes, or approved move-ups match this trial.</CardContent></Card> : <div className="grid gap-4">{watched.map(({ entry, dog, official, flags }: any) => {
      const movedRuns = (entry.sdda_runs || []).filter((run: any) => run.move_up_approved_at || run.move_up_from_level);
      return <Card key={entry.id}><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{dog?.call_name || 'Dog'}</CardTitle><CardDescription>{entry.handler_name} · {dog?.sdda_registration_number || 'Registration pending'}{official ? ` · matched as ${official.dogName}` : ''}</CardDescription></div><Badge variant="outline">{entry.entry_status}</Badge></div></CardHeader><CardContent className="space-y-3">{flags.length > 0 && <div className="space-y-2">{flags.map((flag: string) => <p key={flag} className="rounded-md border border-green-200 bg-green-50 p-3 font-medium text-green-900">{flag}</p>)}</div>}{!official && dog?.sdda_registration_number && <p className="rounded-md border bg-gray-50 p-3 text-sm text-gray-600">This SDDA number was not matched in the current official workbook snapshot.</p>}{entry.title_watch_note && <p className="rounded-md border border-amber-200 bg-amber-50 p-3"><strong>Entrant title note:</strong> {entry.title_watch_note}</p>}{movedRuns.length > 0 && <div><p className="mb-2 text-sm font-semibold">Approved component move-ups</p><div className="flex flex-wrap gap-2">{movedRuns.map((run: any) => <Badge key={run.id}>{run.component}: {run.move_up_from_level || 'Previous level'} → {run.level}</Badge>)}</div></div>}</CardContent></Card>;
    })}</div>}
  </div></MainLayout>;
}
