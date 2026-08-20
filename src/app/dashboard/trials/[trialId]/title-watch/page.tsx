'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, Loader2, Search, Trophy } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { getSddaTrialWorkspace, listSddaEntries, type SddaTrialWorkspace } from '@/lib/sdda/trialRepository';

type Entry = Awaited<ReturnType<typeof listSddaEntries>>[number];

export default function SddaTitleWatchPage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const client = getSupabaseBrowser();
      const [workspace, roster] = await Promise.all([
        getSddaTrialWorkspace(client, trialId),
        listSddaEntries(client, trialId),
      ]);
      setTrial(workspace); setEntries(roster);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load title watch.');
    } finally { setLoading(false); }
  }, [trialId]);
  useEffect(() => { void load(); }, [load]);

  const watched = useMemo(() => entries.filter((entry: any) => {
    const dog = Array.isArray(entry.sdda_dogs) ? entry.sdda_dogs[0] : entry.sdda_dogs;
    const moveUp = (entry.sdda_runs || []).some((run: any) => run.move_up_approved_at || run.move_up_from_level);
    const text = `${entry.handler_name} ${dog?.call_name || ''} ${dog?.sdda_registration_number || ''} ${entry.title_watch_note || ''}`.toLowerCase();
    return (entry.title_watch_note || moveUp) && text.includes(search.toLowerCase());
  }), [entries, search]);

  return <MainLayout title="Title watch" breadcrumbItems={[
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Trials', href: '/dashboard/trials' },
    { label: trial?.name || 'Trial', href: `/dashboard/trials/${trialId}` },
    { label: 'Title watch' },
  ]}><div className="mx-auto max-w-6xl space-y-6">
    <div><h1 className="flex items-center text-3xl font-bold"><Trophy className="mr-3 h-7 w-7 text-[#b98935]" />Title watch</h1><p className="mt-1 text-gray-600">{trial?.name}</p></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>This screen shows competitor title-watch notes and approved component move-ups. Automatic title qualification requires completed score entry and historical SDDA results, which are the next title-workflow milestone.</AlertDescription></Alert>
    <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><Input className="bg-white pl-10" placeholder="Search handler, dog, SDDA number, or title note" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
    {loading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div> : watched.length === 0 ? <Card><CardContent className="py-14 text-center text-gray-500">No title-watch notes or approved move-ups match this trial.</CardContent></Card> : <div className="grid gap-4">{watched.map((entry: any) => {
      const dog = Array.isArray(entry.sdda_dogs) ? entry.sdda_dogs[0] : entry.sdda_dogs;
      const movedRuns = (entry.sdda_runs || []).filter((run: any) => run.move_up_approved_at || run.move_up_from_level);
      return <Card key={entry.id}><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{dog?.call_name || 'Dog'}</CardTitle><CardDescription>{entry.handler_name} · {dog?.sdda_registration_number || 'Registration pending'}</CardDescription></div><Badge variant="outline">{entry.entry_status}</Badge></div></CardHeader><CardContent className="space-y-3">{entry.title_watch_note && <p className="rounded-md border border-amber-200 bg-amber-50 p-3"><strong>Title note:</strong> {entry.title_watch_note}</p>}{movedRuns.length > 0 && <div><p className="mb-2 text-sm font-semibold">Approved component move-ups</p><div className="flex flex-wrap gap-2">{movedRuns.map((run: any) => <Badge key={run.id}>{run.component}: {run.move_up_from_level || 'Previous level'} → {run.level}</Badge>)}</div></div>}</CardContent></Card>;
    })}</div>}
  </div></MainLayout>;
}
