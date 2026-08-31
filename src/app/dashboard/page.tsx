'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/layout/mainLayout';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { listSddaTrials, type SddaTrialSummary } from '@/lib/sdda/trialRepository';

type RegistryStatus = { available: boolean; source_name?: string; source_refreshed_at?: string; imported_at?: string; row_count?: number };
const REGISTRY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const workflow = [
  ['Running orders', 'Arrange officials, regular teams, second dogs, FEO and BIS.', 'running-order'],
  ['Entries', 'Review built-in form entries or import Google Form responses.', 'entries'],
  ['Score sheets', 'Generate the correct official component-specific PDFs.', 'score-sheets'],
  ['Score entry', 'Record and amend audited Scent and Games results.', 'scoring'],
  ['Results', 'Review provisional class placements and print results.', 'results'],
  ['Title watch', 'Review component move-ups and dogs approaching titles.', 'title-watch'],
  ['Official workbook', 'Prepare the SDDA Trial Workbook submission.', 'workbook'],
  ['Finances', 'Track fees, payments, waivers and trial expenses.', 'financials'],
  ['Trial closeout', 'Verify final records, back up, complete and lock the trial.', 'closeout'],
] as const;

export default function DashboardPage() {
  const [trials, setTrials] = useState<SddaTrialSummary[]>([]);
  const [activeId, setActiveId] = useState('');
  const [error, setError] = useState('');
  const [isAdministrator, setIsAdministrator] = useState(false);
  const [registry, setRegistry] = useState<RegistryStatus | null>(null);
  const load = useCallback(async () => {
    try {
      const client = getSupabaseBrowser();
      const [loaded, adminResult, registryResult] = await Promise.all([
        listSddaTrials(client),
        client.rpc('sdda_is_administrator'),
        client.rpc('sdda_active_registry_status'),
      ]);
      setTrials(loaded);
      setActiveId((current) => current || loaded[0]?.id || '');
      setIsAdministrator(Boolean(adminResult.data));
      if (!registryResult.error) setRegistry(registryResult.data as RegistryStatus);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load SDDA trials.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const active = useMemo(() => trials.find((trial) => trial.id === activeId), [trials, activeId]);
  const registryOverdue = isAdministrator && (!registry?.available || !registry.imported_at || Date.now() - new Date(registry.imported_at).getTime() >= REGISTRY_MAX_AGE_MS);
  const activeHref = (suffix = '') => active ? `/dashboard/trials/${active.id}${suffix ? `/${suffix}` : ''}` : '/dashboard/trials/create';

  return <MainLayout fullWidth>
    <div className="min-h-full bg-[#e9eef3] p-4 text-[#17212b] lg:p-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="flex flex-col justify-between gap-6 rounded-t-[24px] rounded-b-md bg-[#294f73] px-8 py-8 text-white shadow-xl md:flex-row md:items-end">
          <div><span className="text-[11px] font-extrabold uppercase tracking-[.15em]">SDDA trial operations</span><h1 className="my-2 font-serif text-5xl leading-none md:text-6xl">TrialDesk</h1><p className="text-[#deebe2]">From entry forms and Google responses to running orders, judge packets and the official SDDA workbook.</p></div>
          <div className="grid gap-1 rounded-2xl border border-white/30 bg-white/5 px-5 py-4"><strong>Rules authority</strong><span className="font-serif text-xl">Master Rule Book v5.1</span><small className="text-[#d5e4d9]">Effective July 1, 2026</small></div>
        </header>

        {error && <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">{error}</div>}
        {isAdministrator && registryOverdue && <section className="mt-4 flex flex-col justify-between gap-3 rounded-xl border-2 border-sky-400 bg-sky-50 p-5 text-sky-950 shadow-sm sm:flex-row sm:items-center"><div><strong className="font-serif text-xl">SDDA registry refresh due</strong><p className="mt-1 text-sm">{registry?.available ? `${registry.source_name || 'The active registry'} was imported ${registry.imported_at ? new Date(registry.imported_at).toLocaleDateString('en-CA') : 'more than seven days ago'} and contains ${registry.row_count?.toLocaleString() || 0} dogs.` : 'No official SDDA dog registry is active.'}</p></div><Link href="/dashboard/registry" className="shrink-0 rounded-lg bg-[#294f73] px-5 py-3 text-center font-bold text-white">Review and refresh</Link></section>}
        {isAdministrator && registry?.available && !registryOverdue && <section className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-300 bg-blue-50 px-5 py-3 text-sm text-blue-950"><span><strong>SDDA registry current:</strong> {registry.row_count?.toLocaleString()} dogs · {registry.source_name}</span><Link href="/dashboard/registry" className="font-bold text-[#294f73] underline">Registry details</Link></section>}

        <section className="mt-4 grid gap-6 rounded-2xl border border-[#cbd5e1] bg-[#f8fafc] p-5 shadow-sm lg:grid-cols-[.7fr_1.3fr]">
          <div className="space-y-3">
            <span className="text-[11px] font-extrabold uppercase tracking-[.15em] text-[#294f73]">Trial setup</span>
            <h2 className="font-serif text-3xl">Choose your trial</h2>
            <select className="w-full rounded-lg border border-[#cfd3cc] bg-white p-3" value={activeId} onChange={(event) => setActiveId(event.target.value)}><option value="">Select a trial</option>{trials.map((trial) => <option key={trial.id} value={trial.id}>{trial.name}</option>)}</select>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link className="rounded-lg bg-[#294f73] px-4 py-3 text-center font-bold text-white" href="/dashboard/trials/create">Create trial</Link>
              <Link className="rounded-lg border border-[#94a3b8] bg-white px-4 py-3 text-center font-bold text-[#294f73]" href={activeHref()}>Open setup</Link>
            </div>
            <Link className="block rounded-lg border border-[#94a3b8] bg-white px-4 py-3 text-center font-bold text-[#294f73]" href="/dashboard/trials">All trials</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Link href={active ? `/sdda-entry/${active.id}` : '/dashboard/trials/create'} className="rounded-xl border border-[#cbd5e1] bg-[#f1f5f9] p-4 hover:border-[#294f73]"><strong className="font-serif text-xl text-[#294f73]">Built-in entry form</strong><p className="mt-2 text-sm text-[#64748b]">Open, preview and share the trial’s SDDA entry form.</p></Link>
            <Link href={activeHref('entries')} className="rounded-xl border border-[#cbd5e1] bg-[#f1f5f9] p-4 hover:border-[#294f73]"><strong className="font-serif text-xl text-[#294f73]">Google Form CSV</strong><p className="mt-2 text-sm text-[#64748b]">Import the familiar SDDA Google response file.</p></Link>
            <Link href={activeHref('entries')} className="rounded-xl border border-[#cbd5e1] bg-[#f1f5f9] p-4 hover:border-[#294f73]"><strong className="font-serif text-xl text-[#294f73]">Entry roster</strong><p className="mt-2 text-sm text-[#64748b]">Use entries from either source in one roster.</p></Link>
            <div className="rounded-xl border border-[#cbd5e1] bg-white p-4 sm:col-span-2 lg:col-span-3"><span className="text-xs font-bold uppercase tracking-wider text-[#64748b]">Current trial</span><h3 className="mt-1 font-serif text-2xl">{active?.name || 'Create or select a trial'}</h3><p className="mt-1 text-sm text-[#64748b]">{active ? `${active.host_club}${active.venue ? ` • ${active.venue}` : ''}` : 'Trial-specific links activate after a trial is selected.'}</p></div>
          </div>
        </section>

        <div className="flex flex-wrap justify-between gap-3 px-1 py-4 text-sm text-[#64748b]"><span><b className="text-[#294f73]">{trials.length}</b> trials available</span><span>Secure SDDA-only secretary workspace</span></div>

        <nav className="mb-5 flex gap-1 overflow-auto border-b border-[#cfd3cc]">{[
          ['Trial setup', ''], ['Entries', 'entries'], ['Running orders', 'running-order'], ['Score sheets', 'score-sheets'], ['Score entry', 'scoring'], ['Results', 'results'], ['Titles', 'title-watch'], ['Finances', 'financials'], ['Export', 'workbook'], ['Closeout', 'closeout'],
        ].map(([item, suffix], index) => <Link key={item} href={activeHref(suffix)} className={`whitespace-nowrap border-b-4 px-5 py-4 font-bold ${index === 0 ? 'border-[#6688a6] text-[#294f73]' : 'border-transparent text-[#64748b]'}`}>{item}</Link>)}</nav>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{workflow.map(([title, description, suffix]) => <Link key={title} href={activeHref(suffix)} className="rounded-2xl border border-[#cbd5e1] bg-[#f8fafc] p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#294f73]"><span className="text-[11px] font-extrabold uppercase tracking-[.15em] text-[#6688a6]">Operations</span><h2 className="my-2 font-serif text-3xl">{title}</h2><p className="leading-6 text-[#64748b]">{description}</p></Link>)}</section>

        <section className="mt-4 rounded-2xl border border-[#b6c8d8] bg-[#dce7f0] p-6"><h3 className="font-serif text-2xl text-[#294f73]">2026 rules workflow</h3><ul className="mt-3 grid gap-2 text-sm md:grid-cols-2 lg:grid-cols-3"><li>Officials before duties</li><li>Second dogs after first dogs</li><li>FEO after regular entries</li><li>Bitches in season last</li><li>Component-specific move-ups</li><li>Official SDDA score-sheet templates</li></ul></section>
        <footer className="py-8 text-center text-xs text-[#64748b]">SDDA TrialDesk • Local-first secretary operations</footer>
      </div>
    </div>
  </MainLayout>;
}
