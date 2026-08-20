'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowRight, Loader2, Printer, Search } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { listSddaAuditRecords } from '@/lib/sdda/operationsRepository';
import { getSddaTrialWorkspace, type SddaTrialWorkspace } from '@/lib/sdda/trialRepository';

type Audit = Awaited<ReturnType<typeof listSddaAuditRecords>>[number];
const title = (value: string) => value.replace(/[._]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const flatten = (value: unknown, prefix = '', result: Record<string, unknown> = {}) => {
  if (Array.isArray(value)) {
    if (!value.length && prefix) result[prefix] = [];
    value.forEach((item, index) => flatten(item, `${prefix}[${index + 1}]`, result));
  } else if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length && prefix) result[prefix] = {};
    entries.forEach(([key, item]) => flatten(item, prefix ? `${prefix}.${key}` : key, result));
  } else if (prefix) result[prefix] = value;
  return result;
};
const displayValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 'Blank';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value) && !value.length) return 'None';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};
const statementChanges = (before: unknown, after: unknown) => {
  const oldValues = flatten(before || {});
  const newValues = flatten(after || {});
  return [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])]
    .filter((field) => JSON.stringify(oldValues[field]) !== JSON.stringify(newValues[field]))
    .map((field) => ({ field, before: oldValues[field], after: newValues[field] }));
};
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
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-bold">Activity journal</h1><p className="text-gray-600">Permanent operational history for {trial?.name || 'this trial'}.</p></div><button type="button" onClick={() => window.print()} className="flex items-center rounded-md border border-[#bac5bd] bg-white px-4 py-2 font-semibold text-[#225f45] print:hidden"><Printer className="mr-2 h-4 w-4" />Print journal</button></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="flex flex-wrap gap-3"><div className="relative min-w-72 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><Input className="pl-10" placeholder="Search action, person, or record" value={search} onChange={(e) => setSearch(e.target.value)} /></div><select className="h-10 rounded-md border border-input bg-white px-3" value={type} onChange={(e) => setType(e.target.value)}><option value="all">All record types</option>{types.map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></div>
    {loading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div> : <div className="space-y-6">{filtered.map((item: any) => {
      const profile = Array.isArray(item.sdda_profiles) ? item.sdda_profiles[0] : item.sdda_profiles;
      const changes = statementChanges(item.before_state, item.after_state);
      return <article key={item.id} className="overflow-hidden rounded-sm border border-gray-300 bg-white shadow-sm print:break-inside-avoid print:shadow-none">
        <header className="border-b-2 border-[#225f45] px-6 py-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#68736c]">SDDA TrialDesk activity statement</p><h2 className="mt-1 font-serif text-2xl font-bold text-[#18231d]">{title(item.action)}</h2></div><time className="text-sm font-medium text-gray-600">{new Date(item.created_at).toLocaleString('en-CA')}</time></div></header>
        <div className="grid border-b bg-[#f7f8f4] text-sm sm:grid-cols-3"><div className="border-b px-6 py-3 sm:border-b-0 sm:border-r"><span className="block text-xs font-bold uppercase text-gray-500">Performed by</span>{profile?.display_name || profile?.email || item.actor_id || 'System'}</div><div className="border-b px-6 py-3 sm:border-b-0 sm:border-r"><span className="block text-xs font-bold uppercase text-gray-500">Record type</span>{title(item.entity_type)}</div><div className="px-6 py-3"><span className="block text-xs font-bold uppercase text-gray-500">Reference</span><span className="break-all font-mono text-xs">{item.entity_id || `Audit ${item.id}`}</span></div></div>
        <div className="p-6"><h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#225f45]">{changes.length ? `${changes.length} recorded change${changes.length === 1 ? '' : 's'}` : 'Recorded event'}</h3>
          {changes.length ? <div className="overflow-x-auto rounded-md border"><table className="w-full text-sm"><thead className="bg-[#edf2ed] text-left"><tr><th className="px-4 py-3">Field</th><th className="px-4 py-3">Before</th><th className="w-10" /><th className="px-4 py-3">After</th></tr></thead><tbody>{changes.map((change) => <tr key={change.field} className="border-t"><th className="px-4 py-3 text-left font-semibold">{title(change.field.replace(/\[(\d+)\]/g, ' $1'))}</th><td className="px-4 py-3"><span className="inline-block rounded border border-red-200 bg-red-50 px-2 py-1 text-red-900">{displayValue(change.before)}</span></td><td className="text-center text-[#b98935]"><ArrowRight className="mx-auto h-4 w-4" /></td><td className="px-4 py-3"><span className="inline-block rounded border border-green-300 bg-green-50 px-2 py-1 font-semibold text-green-900">{displayValue(change.after)}</span></td></tr>)}</tbody></table></div> : <p className="rounded-md border bg-[#f7f8f4] p-3 text-gray-600">This event did not contain a before-and-after field comparison.</p>}
        </div>
      </article>;
    })}{!filtered.length && <Card><CardContent className="py-12 text-center text-gray-500">No matching activity records.</CardContent></Card>}</div>}
  </div></MainLayout>;
}
