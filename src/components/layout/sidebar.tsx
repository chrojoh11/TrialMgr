'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Calendar, Check, ChevronDown, ChevronRight, CircleDollarSign, ClipboardCheck, ClipboardList, Copy, Database, ExternalLink, FileSpreadsheet, FileText, Home, ListOrdered, LockKeyhole, Plus, Trophy, UserPlus, Users, X } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { listSddaTrials, type SddaTrialSummary } from '@/lib/sdda/trialRepository';

interface SidebarProps { className?: string; isMobileOpen?: boolean; onCloseMobile?: () => void }
const beforeEntryLinks = (id: string) => [
  { label: 'Trial Details', href: `/dashboard/trials/${id}`, icon: ClipboardList },
  { label: 'Activity Journal', href: `/dashboard/trials/${id}/activity`, icon: Activity },
  { label: 'Entries', href: `/dashboard/trials/${id}/entries`, icon: Users },
  { label: 'Trial Team', href: `/dashboard/trials/${id}/team`, icon: UserPlus },
];
const afterEntryLinks = (id: string) => [
  { label: 'Close to Titles & Ribbons', href: `/dashboard/trials/${id}/title-watch`, icon: Trophy },
  { label: 'Running Orders', href: `/dashboard/trials/${id}/running-order`, icon: ListOrdered },
  { label: 'Score Sheets', href: `/dashboard/trials/${id}/score-sheets`, icon: FileText },
  { label: 'Score Entry', href: `/dashboard/trials/${id}/scoring`, icon: ClipboardCheck },
  { label: 'Results Summary', href: `/dashboard/trials/${id}/results`, icon: Trophy },
  { label: 'Official Workbook', href: `/dashboard/trials/${id}/workbook`, icon: FileSpreadsheet },
  { label: 'Financial Summary', href: `/dashboard/trials/${id}/financials`, icon: CircleDollarSign },
  { label: 'Trial Closeout', href: `/dashboard/trials/${id}/closeout`, icon: LockKeyhole },
];

export function Sidebar({ className = '', isMobileOpen = false, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const [trials, setTrials] = useState<SddaTrialSummary[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [isAdministrator, setIsAdministrator] = useState(false);
  const activeTrialId = pathname.match(/\/dashboard\/trials\/([^/]+)/)?.[1] || null;
  const load = useCallback(async () => { try { setTrials(await listSddaTrials(getSupabaseBrowser())); } catch (error) { console.error('Unable to load SDDA trials for navigation:', error); setTrials([]); } }, []);
  useEffect(() => { void load(); getSupabaseBrowser().rpc('sdda_is_administrator').then(({ data }) => setIsAdministrator(Boolean(data))); }, [load]);
  useEffect(() => { if (activeTrialId) setExpanded((current) => new Set(current).add(activeTrialId)); }, [activeTrialId]);
  const visibleTrials = useMemo(() => { const recent = trials.slice(0, 5); if (!activeTrialId || recent.some((trial) => trial.id === activeTrialId)) return recent; const active = trials.find((trial) => trial.id === activeTrialId); return active ? [...recent.slice(0, 4), active] : recent; }, [trials, activeTrialId]);
  const toggle = (id: string) => setExpanded((current) => { const next = new Set(current); if (next.has(id) && id !== activeTrialId) next.delete(id); else next.add(id); return next; });
  const copyEntryLink = async (id: string) => { await navigator.clipboard.writeText(`${window.location.origin}/sdda-entry/${id}`); setCopied(id); setTimeout(() => setCopied(null), 2000); };
  const trialLink = (item: ReturnType<typeof beforeEntryLinks>[number]) => <Link key={item.href} href={item.href} onClick={onCloseMobile} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${pathname === item.href ? 'bg-[#dbe8f2] font-bold text-[#294f73]' : item.label === 'Financial Summary' ? 'bg-slate-200 font-semibold text-[#294f73] hover:bg-blue-100' : 'text-[#475569] hover:bg-white'}`}><item.icon className="h-4 w-4 shrink-0" /><span>{item.label}</span></Link>;

  return <aside className={`${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-[#cbd5e1] bg-[#f1f5f9] transition-transform lg:static ${className}`}>
    <div className="flex items-center justify-between border-b border-[#cbd5e1] bg-[#294f73] px-5 py-5 text-white"><Link href="/dashboard" className="flex items-center gap-3" onClick={onCloseMobile}><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#6688a6] text-[10px] font-black">SDDA</span><span><strong className="block font-serif text-xl">TrialDesk</strong><small className="text-[#dbe7f1]">Secretary program</small></span></Link><button type="button" className="lg:hidden" onClick={onCloseMobile} aria-label="Close navigation"><X className="h-5 w-5" /></button></div>
    <nav className="flex-1 overflow-y-auto p-4">
      <Link href="/dashboard" onClick={onCloseMobile} className={`flex items-center gap-3 rounded-lg px-3 py-3 font-semibold ${pathname === '/dashboard' ? 'bg-[#dbe8f2] text-[#294f73]' : 'text-[#475569] hover:bg-white'}`}><Home className="h-5 w-5" />Dashboard</Link>
      {isAdministrator && <Link href="/dashboard/registry" onClick={onCloseMobile} className={`mt-1 flex items-center gap-3 rounded-lg px-3 py-3 font-semibold ${pathname === '/dashboard/registry' ? 'bg-[#dbe8f2] text-[#294f73]' : 'text-[#475569] hover:bg-white'}`}><Database className="h-5 w-5" />SDDA Dog Registry</Link>}
      <section className="mt-5"><div className="mb-2 flex items-center justify-between px-3"><h2 className="text-xs font-extrabold uppercase tracking-wider text-[#64748b]">Trials</h2><Link href="/dashboard/trials" onClick={onCloseMobile} className="text-xs font-semibold text-[#294f73]">View all</Link></div>
        <div className="space-y-1">{visibleTrials.length === 0 && <p className="px-3 py-2 text-sm text-[#64748b]">No trials yet.</p>}{visibleTrials.map((trial) => { const open = expanded.has(trial.id) || trial.id === activeTrialId; const active = trial.id === activeTrialId; return <div key={trial.id}><button type="button" onClick={() => toggle(trial.id)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-semibold ${active ? 'bg-[#e5edf5] text-[#294f73]' : 'text-[#334155] hover:bg-white'}`}><Calendar className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{trial.name}</span>{open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}</button>{open && <div className="ml-4 mt-1 space-y-1 border-l-2 border-[#cbd5e1] pl-2">
          {beforeEntryLinks(trial.id).map(trialLink)}
          <Link href={`/sdda-entry/${trial.id}`} target="_blank" onClick={onCloseMobile} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[#475569] hover:bg-white"><ExternalLink className="h-4 w-4 shrink-0" />Competitor Entry Form</Link>
          <button type="button" onClick={() => void copyEntryLink(trial.id)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[#475569] hover:bg-white">{copied === trial.id ? <Check className="h-4 w-4 shrink-0 text-blue-700" /> : <Copy className="h-4 w-4 shrink-0" />}<span className={copied === trial.id ? 'text-blue-700' : ''}>{copied === trial.id ? 'Entry Link Copied' : 'Copy Entry Link'}</span></button>
          {afterEntryLinks(trial.id).map(trialLink)}
        </div>}</div>; })}
          <Link href="/dashboard/trials/create" onClick={onCloseMobile} className="mt-3 flex items-center gap-2 rounded-lg border-2 border-dashed border-[#afc1d1] px-3 py-3 font-semibold text-[#294f73] hover:bg-white"><Plus className="h-4 w-4" />Create New Trial</Link>
        </div>
      </section>
    </nav>
  </aside>;
}

export default Sidebar;
