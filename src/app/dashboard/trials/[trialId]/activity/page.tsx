'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowRight, Printer, Search } from 'lucide-react';
import { PawLoader } from '@/components/ui/pawLoader';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { activityFieldLabel, displayActivityFieldValue, groupEntryImportActivity, groupOfferingActivity, initialTrialSetupRecordIds, secretaryActivityChanges } from '@/lib/sdda/activityPresentation';
import { listSddaAuditRecords } from '@/lib/sdda/operationsRepository';
import { getSddaTrialWorkspace, listSddaEntries, type SddaTrialWorkspace } from '@/lib/sdda/trialRepository';

type Audit = Awaited<ReturnType<typeof listSddaAuditRecords>>[number];
type Entry = Awaited<ReturnType<typeof listSddaEntries>>[number];
type DisplayAudit = Audit & { offeringBatch?: Audit[]; importBatch?: Audit[] };
function first<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] || null : value || null; }
const title = (value: string) => value.replace(/[._]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const eventTitle = (item: DisplayAudit) => item.action === 'trial.created' ? 'Trial created and initial setup' : item.offeringBatch ? 'Trial offerings updated' : item.importBatch ? 'CSV entries imported' : item.action === 'entry.public_received' ? 'Entry received' : item.action.includes('entry') && item.action.includes('updated') ? 'Entry updated' : item.action === 'entry.confirmation_status_changed' ? 'Entry status changed' : title(item.action);

export default function SddaActivityPage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [records, setRecords] = useState<Audit[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setLoading(true); const client = getSupabaseBrowser(); const [workspace, audit, roster] = await Promise.all([getSddaTrialWorkspace(client, trialId), listSddaAuditRecords(client, trialId), listSddaEntries(client, trialId)]); setTrial(workspace); setRecords(audit); setEntries(roster); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load activity.'); } finally { setLoading(false); } }, [trialId]);
  useEffect(() => { void load(); }, [load]);

  const types = useMemo(() => [...new Set(records.map((item) => item.entity_type))].sort(), [records]);
  const initialSetupIds = useMemo(() => initialTrialSetupRecordIds(records), [records]);
  const displayRecords = useMemo(() => groupEntryImportActivity(groupOfferingActivity(records)), [records]);
  const filtered = useMemo(() => displayRecords.filter((item) => {
    if (initialSetupIds.has(item.id) && item.action !== 'trial.created') return false;
    const batch = item.offeringBatch || item.importBatch || [item];
    const hasOfferingSnapshot = Boolean(item.offeringBatch?.some((record) => record.after_state));
    if (!hasOfferingSnapshot && batch.every((record) => secretaryActivityChanges(record.before_state, record.after_state).length === 0)) return false;
    const profile = Array.isArray(item.sdda_profiles) ? item.sdda_profiles[0] : item.sdda_profiles;
    const entryIds = (item.importBatch || [item]).map((record) => record.entity_id);
    const people = entries.filter((entry) => entryIds.includes(entry.id)).map((entry) => { const dog = first(entry.sdda_dogs); return `${entry.handler_name} ${dog?.call_name || ''} ${dog?.sdda_registration_number || ''}`; }).join(' ');
    const haystack = `${item.action} ${item.entity_type} ${profile?.display_name || ''} ${profile?.email || ''} ${people}`.toLowerCase();
    return (type === 'all' || item.entity_type === type) && haystack.includes(search.toLowerCase());
  }), [displayRecords, entries, initialSetupIds, search, type]);

  return <MainLayout title="Activity journal" breadcrumbItems={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Trials', href: '/dashboard/trials' }, { label: trial?.name || 'Trial', href: `/dashboard/trials/${trialId}` }, { label: 'Activity' }]}>
    <div className="activity-journal-print-root mx-auto max-w-5xl bg-[#f8fafc] print:max-w-none">
      <header className="border-b-[3px] border-[#294f73] pb-4 print:flex print:items-end print:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[.15em] text-[#64748b]">SDDA TrialDesk</p><h1 className="font-serif text-4xl font-semibold text-[#17212b]">Activity journal</h1><p className="text-gray-600">{trial?.name || 'Trial'} · Permanent secretary-facing operational history</p></div>
        <div className="mt-3 flex gap-3 print:hidden"><button type="button" onClick={() => window.print()} className="flex items-center rounded-md border border-[#94a3b8] bg-white px-4 py-2 font-semibold text-[#294f73]"><Printer className="mr-2 h-4 w-4" />Print journal</button></div>
        <div className="hidden text-right text-sm text-gray-600 print:block"><p>Printed {new Date().toLocaleDateString('en-CA')}</p><p>{filtered.length} secretary-relevant event{filtered.length === 1 ? '' : 's'}</p></div>
      </header>
      {error && <Alert variant="destructive" className="mt-5"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="mt-5 flex flex-wrap gap-3 print:hidden"><div className="relative min-w-72 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><Input className="pl-10" placeholder="Search action, person, or record" value={search} onChange={(e) => setSearch(e.target.value)} /></div><select className="h-10 rounded-md border border-input bg-white px-3" value={type} onChange={(e) => setType(e.target.value)}><option value="all">All record types</option>{types.map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></div>
      {loading ? <div className="flex justify-center py-20"><PawLoader className="h-8 w-8" /></div> : <div className="mt-3 divide-y divide-[#cbd5e1]">{filtered.map((item) => <ActivityEvent key={item.id} item={item} trial={trial} entries={entries} />)}{!filtered.length && <Card className="my-5"><CardContent className="py-12 text-center text-gray-500">No matching secretary-facing activity.</CardContent></Card>}</div>}
      <footer className="mt-6 hidden justify-between border-t pt-3 text-xs text-gray-500 print:flex"><span>SDDA TrialDesk · {trial?.name}</span><span>{filtered.length} events</span></footer>
    </div>
  </MainLayout>;
}

function ActivityEvent({ item, trial, entries }: { item: DisplayAudit; trial: SddaTrialWorkspace | null; entries: Entry[] }) {
  const profile = Array.isArray(item.sdda_profiles) ? item.sdda_profiles[0] : item.sdda_profiles;
  const entry = entries.find((candidate) => candidate.id === item.entity_id);
  const actor = profile?.display_name || profile?.email || (item.action.startsWith('entry.public') ? entry?.handler_name : null) || 'System';
  const offeringBatch = item.offeringBatch;
  const importBatch = item.importBatch;
  const offeringTree = offeringBatch && trial ? trial.sdda_trial_days.map((day) => {
    const rows = offeringBatch.map((record) => record.after_state as Record<string, unknown>).filter((state) => state?.trial_day_id === day.id);
    const levels = [...new Set(rows.map((state) => String(state.level || 'Unspecified')))];
    return { day, levels: levels.map((level) => ({ level, components: [...new Set(rows.filter((state) => state.level === level).map((state) => `${state.component}${state.feo_allowed ? ' (FEO)' : ''}`))] })) };
  }).filter((group) => group.levels.length) : [];
  const setupSummary = item.action === 'trial.created' && trial ? trial.sdda_trial_days.flatMap((day) => {
    const scent = trial.sdda_trial_offerings.filter((offering) => offering.trial_day_id === day.id);
    const games = trial.sdda_game_offerings.filter((offering) => offering.trial_day_id === day.id);
    const scentByLevel = [...new Set(scent.map((offering) => offering.level))].map((level) => `${level}: ${[...new Set(scent.filter((offering) => offering.level === level).map((offering) => offering.component))].join(', ')}`);
    return [{ field: `day_${day.day_number}_date`, before: undefined, after: day.trial_date }, { field: `day_${day.day_number}_judge`, before: undefined, after: day.judge_name || 'Pending assignment' }, ...(scentByLevel.length ? [{ field: `day_${day.day_number}_scent_offerings`, before: undefined, after: scentByLevel.join('; ') }] : []), ...(games.length ? [{ field: `day_${day.day_number}_games_offerings`, before: undefined, after: games.map((offering) => offering.game_type).join(', ') }] : [])];
  }) : null;
  const changes = (setupSummary ? [...secretaryActivityChanges(item.before_state, item.after_state), ...setupSummary] : secretaryActivityChanges(item.before_state, item.after_state)).filter((change) => !change.field.startsWith('runs') && !change.field.startsWith('game_runs'));
  return <article className="grid gap-4 py-5 sm:grid-cols-[9rem_1fr] print:grid-cols-[8rem_1fr] print:py-3">
    <div className="text-sm"><time className="font-semibold">{new Date(item.created_at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}</time><p className="text-gray-500">{new Date(item.created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}</p></div>
    <div><div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-serif text-2xl font-semibold text-[#17212b]">{eventTitle(item)}</h2><span className="text-sm text-gray-600">by {actor}</span></div>
      {offeringTree.length ? <div className="space-y-3"><OfferingBatchCounts records={offeringBatch || []} />{offeringTree.map(({ day, levels }) => <section key={day.id} className="border-l-4 border-[#8ba99a] pl-4"><p className="font-semibold">Day {day.day_number} · {day.trial_date} · Judge: {day.judge_name || 'Pending assignment'}</p>{levels.map(({ level, components }) => <p key={level} className="text-sm"><b>{level}</b> → {components.join(', ')}</p>)}</section>)}</div> : offeringBatch ? <OfferingBatchCounts records={offeringBatch} /> : importBatch ? <ImportBatchSummary records={importBatch} entries={entries} trial={trial} /> : item.entity_type === 'sdda_entry' ? <EntryActivitySummary item={item} entry={entry} trial={trial} changes={changes} /> : <ChangeRows changes={changes} />}
    </div>
  </article>;
}

function ChangeRows({ changes }: { changes: ReturnType<typeof secretaryActivityChanges> }) {
  return <div className="space-y-1">{changes.map((change) => <div key={change.field} className="grid gap-2 py-1 text-sm sm:grid-cols-[minmax(12rem,1fr)_minmax(7rem,.55fr)_1.5rem_minmax(7rem,.55fr)] print:grid-cols-[minmax(12rem,1fr)_minmax(7rem,.55fr)_1.5rem_minmax(7rem,.55fr)]"><span className="font-semibold">{activityFieldLabel(change.field)}</span><span className="text-red-800 line-through">{displayActivityFieldValue(change.field, change.before)}</span><ArrowRight className="h-4 w-4 text-[#6688a6]" /><span className="font-semibold text-blue-800">{displayActivityFieldValue(change.field, change.after)}</span></div>)}</div>;
}

function OfferingBatchCounts({ records }: { records: Audit[] }) {
  const added = records.filter((record) => record.action.endsWith('.insert')).length;
  const updated = records.filter((record) => record.action.endsWith('.update')).length;
  const removed = records.filter((record) => record.action.endsWith('.delete')).length;
  const parts = [added && `${added} added`, updated && `${updated} updated`, removed && `${removed} removed`].filter(Boolean);
  return <p className="text-sm text-gray-600">One offering setup change: {parts.join(' · ')}</p>;
}

function entryIdentity(entry: Entry | undefined, state: Record<string, unknown>) {
  const dog = first(entry?.sdda_dogs);
  return {
    handler: String(state.handler_name || entry?.handler_name || 'Unknown handler'),
    dog: String(state.dog_call_name || dog?.call_name || 'Unknown dog'),
    registration: String(state.dog_registration_number || dog?.sdda_registration_number || 'pending'),
  };
}

function describeEntrySelections(entry: Entry | undefined, trial: SddaTrialWorkspace | null) {
  if (!entry) return [];
  const dayNumber = (dayId: string) => trial?.sdda_trial_days.find((day) => day.id === dayId)?.day_number || '?';
  const scent = entry.sdda_runs.map((run) => `Day ${dayNumber(run.trial_day_id)} · ${run.level} ${run.component} · ${run.stream} · ${run.run_group}`);
  const games = entry.sdda_game_runs.map((run) => { const offering = first(run.sdda_game_offerings); return `Day ${dayNumber(run.trial_day_id)} · ${offering?.game_type || 'Games'}${run.aerial_division ? ` ${run.aerial_division}` : ''} · ${run.entry_type}`; });
  return [...scent, ...games];
}

function payloadSelections(state: unknown, trial: SddaTrialWorkspace | null) {
  const value = (state || {}) as Record<string, unknown>;
  const scentRuns = Array.isArray(value.runs) ? value.runs as Record<string, unknown>[] : [];
  const gameRuns = Array.isArray(value.game_runs) ? value.game_runs as Record<string, unknown>[] : [];
  const dayNumber = (dayId: string) => trial?.sdda_trial_days.find((day) => day.id === dayId)?.day_number || '?';
  const scent = scentRuns.map((run) => { const offering = trial?.sdda_trial_offerings.find((candidate) => candidate.id === run.offering_id); return offering ? `Day ${dayNumber(offering.trial_day_id)} · ${offering.level} ${offering.component} · ${offering.stream} · ${run.run_group || 'Regular'}` : `Scent selection · ${run.run_group || 'Regular'}`; });
  const games = gameRuns.map((run) => { const offering = trial?.sdda_game_offerings.find((candidate) => candidate.id === run.offering_id); return offering ? `Day ${dayNumber(offering.trial_day_id)} · ${offering.game_type}${run.aerial_division ? ` ${run.aerial_division}` : ''} · ${run.entry_type || 'Regular'}` : `Games selection · ${run.entry_type || 'Regular'}`; });
  return [...scent, ...games];
}

function EntryActivitySummary({ item, entry, trial, changes }: { item: DisplayAudit; entry: Entry | undefined; trial: SddaTrialWorkspace | null; changes: ReturnType<typeof secretaryActivityChanges> }) {
  const after = (item.after_state || {}) as Record<string, unknown>;
  const identity = entryIdentity(entry, after);
  const beforeSelections = payloadSelections(item.before_state, trial);
  const afterSelections = payloadSelections(item.after_state, trial);
  const selections = afterSelections.length ? afterSelections : describeEntrySelections(entry, trial);
  const added = afterSelections.filter((selection) => !beforeSelections.includes(selection));
  const removed = beforeSelections.filter((selection) => !afterSelections.includes(selection));
  return <div className="space-y-3 text-sm">
    <div className="border-l-4 border-[#8ba99a] pl-4"><p className="text-base font-semibold">{identity.dog} · {identity.handler}</p><p className="text-gray-600">SDDA {identity.registration}</p></div>
    {(added.length > 0 || removed.length > 0) && <div><p className="font-semibold">Selection changes</p>{added.map((selection) => <p key={`added-${selection}`} className="text-blue-800">Added: {selection}</p>)}{removed.map((selection) => <p key={`removed-${selection}`} className="text-red-800">Removed: {selection}</p>)}</div>}
    {!added.length && !removed.length && selections.length > 0 && <div><p className="font-semibold">Entered selections</p>{selections.map((selection) => <p key={selection}>{selection}</p>)}</div>}
    {changes.length > 0 && <ChangeRows changes={changes} />}
  </div>;
}

function ImportBatchSummary({ records, entries, trial }: { records: Audit[]; entries: Entry[]; trial: SddaTrialWorkspace | null }) {
  const states = records.map((record) => record.after_state as Record<string, unknown> | null).filter(Boolean) as Record<string, unknown>[];
  const sources = [...new Set(states.map((state) => String(state.source || 'CSV')).filter(Boolean))];
  const rows = [...new Set(states.map((state) => String(state.source_row || '')).filter(Boolean))];
  const runs = states.reduce((total, state) => total + (Array.isArray(state.components) ? state.components.length : 1), 0);
  return <div className="border-l-4 border-[#8ba99a] pl-4 text-sm">
    <p><b>{records.length}</b> imported selection{records.length === 1 ? '' : 's'} · <b>{runs}</b> run{runs === 1 ? '' : 's'}</p>
    <p>Source: {sources.map((source) => source.replaceAll('_', ' ')).join(', ') || 'CSV import'}</p>
    {rows.length > 0 && <p className="text-gray-600">CSV response rows: {rows.join(', ')}</p>}
    <div className="mt-3 space-y-2">{[...new Set(records.map((record) => record.entity_id))].map((entryId) => { const entry = entries.find((candidate) => candidate.id === entryId); const identity = entryIdentity(entry, {}); return <div key={entryId}><p className="font-semibold">{identity.dog} · {identity.handler} · SDDA {identity.registration}</p>{describeEntrySelections(entry, trial).map((selection) => <p key={selection} className="pl-3 text-gray-700">{selection}</p>)}</div>; })}</div>
  </div>;
}
