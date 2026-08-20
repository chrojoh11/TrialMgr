'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/layout/mainLayout';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { listSddaTrials, type SddaTrialSummary } from '@/lib/sdda/trialRepository';

const workflow = [
  ['Running orders', 'Arrange officials, regular teams, second dogs, FEO and BIS.', 'running-order'],
  ['Entries', 'Review built-in form entries or import Google Form responses.', 'entries'],
  ['Score sheets', 'Generate the correct official component-specific PDFs.', 'score-sheets'],
  ['Score entry', 'Record and amend audited Scent and Games results.', 'scoring'],
  ['Title watch', 'Review component move-ups and dogs approaching titles.', 'title-watch'],
  ['Official workbook', 'Prepare the SDDA Trial Workbook submission.', 'workbook'],
  ['Finances', 'Track fees, payments, waivers and trial expenses.', 'financials'],
] as const;

export default function DashboardPage() {
  const [trials, setTrials] = useState<SddaTrialSummary[]>([]);
  const [activeId, setActiveId] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const loaded = await listSddaTrials(getSupabaseBrowser());
      setTrials(loaded);
      setActiveId((current) => current || loaded[0]?.id || '');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load SDDA trials.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const active = useMemo(() => trials.find((trial) => trial.id === activeId), [trials, activeId]);
  const activeHref = (suffix = '') => active ? `/dashboard/trials/${active.id}${suffix ? `/${suffix}` : ''}` : '/dashboard/trials/create';

  return <MainLayout fullWidth>
    <div className="min-h-full bg-[#f3f0e8] p-4 text-[#18231d] lg:p-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="flex flex-col justify-between gap-6 rounded-t-[24px] rounded-b-md bg-[#225f45] px-8 py-8 text-white shadow-xl md:flex-row md:items-end">
          <div><span className="text-[11px] font-extrabold uppercase tracking-[.15em]">SDDA trial operations</span><h1 className="my-2 font-serif text-5xl leading-none md:text-6xl">TrialDesk</h1><p className="text-[#deebe2]">From entry forms and Google responses to running orders, judge packets and the official SDDA workbook.</p></div>
          <div className="grid gap-1 rounded-2xl border border-white/30 bg-white/5 px-5 py-4"><strong>Rules authority</strong><span className="font-serif text-xl">Master Rule Book v5.1</span><small className="text-[#d5e4d9]">Effective July 1, 2026</small></div>
        </header>

        {error && <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">{error}</div>}

        <section className="mt-4 grid gap-6 rounded-2xl border border-[#d9d8cf] bg-[#fffdf7] p-5 shadow-sm lg:grid-cols-[.7fr_1.3fr]">
          <div className="space-y-3">
            <span className="text-[11px] font-extrabold uppercase tracking-[.15em] text-[#225f45]">Trial setup</span>
            <h2 className="font-serif text-3xl">Choose your trial</h2>
            <select className="w-full rounded-lg border border-[#cfd3cc] bg-white p-3" value={activeId} onChange={(event) => setActiveId(event.target.value)}><option value="">Select a trial</option>{trials.map((trial) => <option key={trial.id} value={trial.id}>{trial.name}</option>)}</select>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link className="rounded-lg bg-[#225f45] px-4 py-3 text-center font-bold text-white" href="/dashboard/trials/create">Create trial</Link>
              <Link className="rounded-lg border border-[#bac5bd] bg-white px-4 py-3 text-center font-bold text-[#225f45]" href={activeHref()}>Open setup</Link>
            </div>
            <Link className="block rounded-lg border border-[#bac5bd] bg-white px-4 py-3 text-center font-bold text-[#225f45]" href="/dashboard/trials">All trials</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Link href={active ? `/sdda-entry/${active.id}` : '/dashboard/trials/create'} className="rounded-xl border border-[#d9d8cf] bg-[#f7f8f4] p-4 hover:border-[#225f45]"><strong className="font-serif text-xl text-[#225f45]">Built-in entry form</strong><p className="mt-2 text-sm text-[#68736c]">Open, preview and share the trial’s SDDA entry form.</p></Link>
            <Link href={activeHref('entries')} className="rounded-xl border border-[#d9d8cf] bg-[#f7f8f4] p-4 hover:border-[#225f45]"><strong className="font-serif text-xl text-[#225f45]">Google Form CSV</strong><p className="mt-2 text-sm text-[#68736c]">Import the familiar SDDA Google response file.</p></Link>
            <Link href={activeHref('entries')} className="rounded-xl border border-[#d9d8cf] bg-[#f7f8f4] p-4 hover:border-[#225f45]"><strong className="font-serif text-xl text-[#225f45]">Entry roster</strong><p className="mt-2 text-sm text-[#68736c]">Use entries from either source in one roster.</p></Link>
            <div className="rounded-xl border border-[#d9d8cf] bg-white p-4 sm:col-span-2 lg:col-span-3"><span className="text-xs font-bold uppercase tracking-wider text-[#68736c]">Current trial</span><h3 className="mt-1 font-serif text-2xl">{active?.name || 'Create or select a trial'}</h3><p className="mt-1 text-sm text-[#68736c]">{active ? `${active.host_club}${active.venue ? ` • ${active.venue}` : ''}` : 'Trial-specific links activate after a trial is selected.'}</p></div>
          </div>
        </section>

        <div className="flex flex-wrap justify-between gap-3 px-1 py-4 text-sm text-[#68736c]"><span><b className="text-[#225f45]">{trials.length}</b> trials available</span><span>Secure SDDA-only secretary workspace</span></div>

        <nav className="mb-5 flex gap-1 overflow-auto border-b border-[#cfd3cc]">{[
          ['Trial setup', ''], ['Entries', 'entries'], ['Running orders', 'running-order'], ['Score sheets', 'score-sheets'], ['Score entry', 'scoring'], ['Titles', 'title-watch'], ['Finances', 'financials'], ['Export', 'workbook'],
        ].map(([item, suffix], index) => <Link key={item} href={activeHref(suffix)} className={`whitespace-nowrap border-b-4 px-5 py-4 font-bold ${index === 0 ? 'border-[#b98935] text-[#225f45]' : 'border-transparent text-[#68736c]'}`}>{item}</Link>)}</nav>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{workflow.map(([title, description, suffix]) => <Link key={title} href={activeHref(suffix)} className="rounded-2xl border border-[#d9d8cf] bg-[#fffdf7] p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#225f45]"><span className="text-[11px] font-extrabold uppercase tracking-[.15em] text-[#b98935]">Operations</span><h2 className="my-2 font-serif text-3xl">{title}</h2><p className="leading-6 text-[#68736c]">{description}</p></Link>)}</section>

        <section className="mt-4 rounded-2xl border border-[#b9ceb9] bg-[#dfeadf] p-6"><h3 className="font-serif text-2xl text-[#225f45]">2026 rules workflow</h3><ul className="mt-3 grid gap-2 text-sm md:grid-cols-2 lg:grid-cols-3"><li>Officials before duties</li><li>Second dogs after first dogs</li><li>FEO after regular entries</li><li>Bitches in season last</li><li>Component-specific move-ups</li><li>Official SDDA score-sheet templates</li></ul></section>
        <footer className="py-8 text-center text-xs text-[#68736c]">SDDA TrialDesk • Local-first secretary operations</footer>
      </div>
    </div>
  </MainLayout>;
}
