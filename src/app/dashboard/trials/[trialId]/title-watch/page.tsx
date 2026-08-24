'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Database, Loader2, RefreshCw, Search, Trophy } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { getSddaTrialWorkspace, listSddaEntries, type SddaTrialWorkspace } from '@/lib/sdda/trialRepository';
import { parseSddaHistoryWorkbook, possibleTitleAwards, SDDA_HISTORY_COMPONENTS, SDDA_HISTORY_LEVELS, titleHistoryFlags, workingStreamConflicts, type SddaDogHistorySummary } from '@/lib/sdda/titleHistoryWorkbook';

type Entry = Awaited<ReturnType<typeof listSddaEntries>>[number];

function registrationKey(value: unknown) {
  return String(value || '').toUpperCase().replace(/^SD[-\s]*/i, '').replace(/[^A-Z0-9]/g, '');
}

type TitleFlagKind = 'history' | 'working' | 'component' | 'special' | 'rule';

const titleFlagStyles: Record<TitleFlagKind, string> = {
  history: 'border-sky-200 bg-sky-50 text-sky-950',
  working: 'border-orange-300 bg-orange-50 text-orange-950',
  component: 'border-emerald-300 bg-emerald-50 text-emerald-950',
  special: 'border-violet-300 bg-violet-50 text-violet-950',
  rule: 'border-slate-300 bg-slate-50 text-slate-800',
};

function titleFlagKind(flag: string): TitleFlagKind {
  if (flag.includes('already titled') || flag.includes('must be Working')) return 'working';
  if (flag.startsWith('Special ')) return 'special';
  if (flag.startsWith('Can complete ')) return 'component';
  if (flag.includes('historical titling score')) return 'history';
  return 'rule';
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
    const actionableFlags = flags.filter((flag) => titleFlagKind(flag) !== 'history');
    const workingConflicts = official ? workingStreamConflicts(official, entry.sdda_runs || []) : [];
    const reportedGold = ['reported_advanced_gold_count', 'reported_excellent_gold_count', 'reported_elite_gold_count'].some((key) => Number(entry[key]) > 0);
    const text = `${entry.handler_name} ${dog?.call_name || ''} ${dog?.sdda_registration_number || ''} ${entry.title_watch_note || ''}`.toLowerCase();
    return { entry, dog, official, flags: actionableFlags, workingConflicts, moveUp, reportedGold, matches: text.includes(search.toLowerCase()) };
  }).filter((item) => item.matches && (item.entry.title_watch_note || item.moveUp || item.reportedGold || item.flags.length)), [entries, history, search]);
  const workingReview = useMemo(() => watched.flatMap((item) => item.workingConflicts.map((conflict) => ({ ...item, conflict }))), [watched]);
  const potentialAwards = useMemo(() => entries.flatMap((entry: any) => {
    const dog = Array.isArray(entry.sdda_dogs) ? entry.sdda_dogs[0] : entry.sdda_dogs;
    const official = history.get(registrationKey(dog?.sdda_registration_number));
    return possibleTitleAwards(official, entry.sdda_runs || []).map((award) => ({ entry, dog, award }));
  }), [entries, history]);
  const ribbonTotals = useMemo(() => [...potentialAwards.reduce((totals, item) => totals.set(item.award.title, (totals.get(item.award.title) || 0) + 1), new Map<string, number>())], [potentialAwards]);

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
    <Card><CardContent className="flex flex-wrap gap-2 py-4 text-sm font-semibold">
      <span className={`rounded-full border px-3 py-1 ${titleFlagStyles.working}`}>Title achieved · Working required</span>
      <span className={`rounded-full border px-3 py-1 ${titleFlagStyles.component}`}>Component title opportunity</span>
      <span className={`rounded-full border px-3 py-1 ${titleFlagStyles.special}`}>Special Excellent opportunity</span>
    </CardContent></Card>
    <Card className={workingReview.length ? 'border-orange-400 bg-orange-50' : 'border-emerald-300 bg-emerald-50'}><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>Amateur entries requiring Working review</CardTitle><CardDescription>{workingReview.length ? `${workingReview.length} entered level${workingReview.length === 1 ? '' : 's'} conflict with the current official history snapshot.` : 'No Amateur entries conflict with completed-level history.'}</CardDescription></div><Link href={`/dashboard/trials/${trialId}/entries`} className="rounded-md border border-[#bac5bd] bg-white px-4 py-2 text-sm font-semibold text-[#225f45]">Open Entry Roster</Link></div></CardHeader>{workingReview.length > 0 && <CardContent><div className="overflow-x-auto rounded-md border border-orange-200 bg-white"><table className="w-full text-sm"><thead className="bg-orange-100 text-left"><tr><th className="px-4 py-3">Dog</th><th className="px-4 py-3">Handler</th><th className="px-4 py-3">Level</th><th className="px-4 py-3">Amateur components entered</th><th className="px-4 py-3">Review</th></tr></thead><tbody>{workingReview.map(({entry,dog,conflict}) => <tr key={`${entry.id}-${conflict.level}`} className="border-t border-orange-100"><td className="px-4 py-3 font-semibold">{dog?.call_name || 'Dog'}<span className="block text-xs font-normal text-gray-500">{dog?.sdda_registration_number}</span></td><td className="px-4 py-3">{entry.handler_name}</td><td className="px-4 py-3 font-semibold">{conflict.level}</td><td className="px-4 py-3">{conflict.components.join(', ')}</td><td className="px-4 py-3 text-orange-900">Confirm SDDA processing, then change these runs to Working.</td></tr>)}</tbody></table></div></CardContent>}</Card>
    <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><Input className="bg-white pl-10" placeholder="Search handler, dog, SDDA number, or title note" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
    {loading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div> : watched.length === 0 ? <Card><CardContent className="py-14 text-center text-gray-500">No immediate title opportunities, Working reviews, title notes, or approved move-ups match this trial.</CardContent></Card> : <div className="grid gap-4">{watched.map(({ entry, dog, official, flags }: any) => {
      const movedRuns = (entry.sdda_runs || []).filter((run: any) => run.move_up_approved_at || run.move_up_from_level);
      return <Card key={entry.id}><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{dog?.call_name || 'Dog'}</CardTitle><CardDescription>{entry.handler_name} · {dog?.sdda_registration_number || 'Registration pending'}{official ? ` · matched as ${official.dogName}` : ''}</CardDescription></div><Badge variant="outline">{entry.entry_status}</Badge></div></CardHeader><CardContent className="space-y-3">{flags.length > 0 && <div className="space-y-2">{flags.map((flag: string) => {
        const kind = titleFlagKind(flag);
        return <p key={flag} className={`rounded-md border-l-4 p-3 font-medium ${titleFlagStyles[kind]}`}>{flag}</p>;
      })}</div>}{official && <details className="rounded-md border bg-[#f7f8f4] p-3"><summary className="cursor-pointer font-semibold text-[#225f45]">View official component history</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="px-2 py-1 text-left">Level</th>{SDDA_HISTORY_COMPONENTS.map((component) => <th key={component} className="px-2 py-1 text-left">{component}</th>)}</tr></thead><tbody>{SDDA_HISTORY_LEVELS.map((level) => <tr key={level} className="border-t"><th className="px-2 py-2 text-left">{level}</th>{SDDA_HISTORY_COMPONENTS.map((component) => <td key={component} className="px-2 py-2">{official.qualifyingCounts[`${level}|${component}`] || 0} Q</td>)}</tr>)}</tbody></table></div><p className="mt-2 text-xs text-gray-500">Reference counts from the current official workbook snapshot; detailed scores are not included.</p></details>}{!official && dog?.sdda_registration_number && <p className="rounded-md border bg-gray-50 p-3 text-sm text-gray-600">This SDDA number was not matched in the current official workbook snapshot.</p>}{entry.title_watch_note && <p className="rounded-md border border-amber-200 bg-amber-50 p-3"><strong>Entrant title note:</strong> {entry.title_watch_note}</p>}{movedRuns.length > 0 && <div><p className="mb-2 text-sm font-semibold">Approved component move-ups</p><div className="flex flex-wrap gap-2">{movedRuns.map((run: any) => <Badge key={run.id}>{run.component}: {run.move_up_from_level || 'Previous level'} → {run.level}</Badge>)}</div></div>}</CardContent></Card>;
    })}</div>}
    {!loading && <Card><CardHeader><CardTitle>Maximum possible title ribbons</CardTitle><CardDescription>Preparation estimate if every required entered component qualifies. Review results before presenting any ribbon.</CardDescription></CardHeader><CardContent className="space-y-4">{ribbonTotals.length > 0 ? <><div className="flex flex-wrap gap-2">{ribbonTotals.map(([titleName,count]) => <Badge key={titleName} className="bg-[#225f45] text-white">{titleName}: {count}</Badge>)}<Badge className="bg-[#b98935] text-white">Maximum total: {potentialAwards.length}</Badge></div><div className="overflow-x-auto rounded-md border"><table className="w-full text-sm"><thead className="bg-[#edf2ed] text-left"><tr><th className="px-4 py-3">Dog</th><th className="px-4 py-3">Handler</th><th className="px-4 py-3">Possible title</th><th className="px-4 py-3">Must qualify in</th><th className="px-4 py-3">History check</th></tr></thead><tbody>{potentialAwards.map(({entry,dog,award}) => <tr key={`${entry.id}-${award.title}`} className="border-t"><td className="px-4 py-3 font-semibold">{dog?.call_name || 'Dog'}<span className="block text-xs font-normal text-gray-500">{dog?.sdda_registration_number || 'Registration pending'}</span></td><td className="px-4 py-3">{entry.handler_name}</td><td className="px-4 py-3 font-semibold">{award.title}</td><td className="px-4 py-3">{award.requiredComponents.join(', ')}</td><td className="px-4 py-3">{award.historyVerified ? 'Official component counts compared' : 'Verify prior Elite status manually'}</td></tr>)}</tbody></table></div></> : <p className="rounded-md border bg-[#f7f8f4] p-4 text-gray-600">No title ribbons are currently projected from the entered runs and official component history.</p>}</CardContent></Card>}
  </div></MainLayout>;
}
