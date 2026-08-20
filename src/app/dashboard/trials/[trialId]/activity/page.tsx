'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { listSddaAuditRecords } from '@/lib/sdda/operationsRepository';
import { getSddaTrialWorkspace, type SddaTrialWorkspace } from '@/lib/sdda/trialRepository';

type Audit = Awaited<ReturnType<typeof listSddaAuditRecords>>[number];
const title = (value: string) => value.replace(/[._]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
export default function SddaActivityPage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [records, setRecords] = useState<Audit[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setLoading(true); const client = getSupabaseBrowser(); const [workspace, audit] = await Promise.all([getSddaTrialWorkspace(client, trialId), listSddaAuditRecords(client, trialId)]); setTrial(workspace); setRecords(audit); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load activity.'); } finally { setLoading(false); } }, [trialId]);
  useEffect(() => { void load(); }, [load]);
  const types = useMemo(() => [...new Set(records.map((item: any) => item.entity_type))].sort(), [records]);
  const filtered = useMemo(() => records.filter((item: any) => { const profile = Array.isArray(item.sdda_profiles) ? item.sdda_profiles[0] : item.sdda_profiles; const haystack = `${item.action} ${item.entity_type} ${item.entity_id || ''} ${profile?.display_name || ''} ${profile?.email || ''}`.toLowerCase(); return (type === 'all' || item.entity_type === type) && haystack.includes(search.toLowerCase()); }), [records, search, type]);
  return <MainLayout title="Activity journal" breadcrumbItems={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Trials', href: '/dashboard/trials' }, { label: trial?.name || 'Trial', href: `/dashboard/trials/${trialId}` }, { label: 'Activity' }]}><div className="mx-auto max-w-6xl space-y-6">
    <div><h1 className="text-3xl font-bold">Activity journal</h1><p className="text-gray-600">Permanent operational history for {trial?.name || 'this trial'}.</p></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="flex flex-wrap gap-3"><div className="relative min-w-72 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><Input className="pl-10" placeholder="Search action, person, or record" value={search} onChange={(e) => setSearch(e.target.value)} /></div><select className="h-10 rounded-md border border-input bg-white px-3" value={type} onChange={(e) => setType(e.target.value)}><option value="all">All record types</option>{types.map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></div>
    {loading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div> : <div className="space-y-3">{filtered.map((item: any) => { const profile = Array.isArray(item.sdda_profiles) ? item.sdda_profiles[0] : item.sdda_profiles; return <Card key={item.id}><CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-2"><CardTitle className="text-base">{title(item.action)}</CardTitle><time className="text-sm text-gray-500">{new Date(item.created_at).toLocaleString('en-CA')}</time></div></CardHeader><CardContent className="space-y-2 text-sm"><p><strong>{title(item.entity_type)}</strong>{item.entity_id ? ` · ${item.entity_id}` : ''}</p><p className="text-gray-600">By {profile?.display_name || profile?.email || item.actor_id || 'System'}</p>{(item.before_state || item.after_state) && <details className="rounded-md border bg-white p-3"><summary className="cursor-pointer font-medium">View recorded details</summary><div className="mt-3 grid gap-3 md:grid-cols-2">{item.before_state && <div><p className="mb-1 font-medium">Before</p><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(item.before_state, null, 2)}</pre></div>}{item.after_state && <div><p className="mb-1 font-medium">After</p><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(item.after_state, null, 2)}</pre></div>}</div></details>}</CardContent></Card>; })}{!filtered.length && <Card><CardContent className="py-12 text-center text-gray-500">No matching activity records.</CardContent></Card>}</div>}
  </div></MainLayout>;
}
