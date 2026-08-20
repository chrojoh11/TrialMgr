'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Calendar, Check, ChevronDown, ChevronRight, CircleDollarSign, ClipboardCheck, ClipboardList, Copy, ExternalLink, FileSpreadsheet, FileText, Home, ListOrdered, Plus, Trophy, Users, X } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { listSddaTrials, type SddaTrialSummary } from '@/lib/sdda/trialRepository';

interface SidebarProps { className?: string; isMobileOpen?: boolean; onCloseMobile?: () => void }
const trialItems = (id: string) => [
  { label: 'Trial setup', href: `/dashboard/trials/${id}`, icon: ClipboardList },
  { label: 'Entries & CSV', href: `/dashboard/trials/${id}/entries`, icon: Users },
  { label: 'Running orders', href: `/dashboard/trials/${id}/running-order`, icon: ListOrdered },
  { label: 'Score sheets', href: `/dashboard/trials/${id}/score-sheets`, icon: FileText },
  { label: 'Score entry', href: `/dashboard/trials/${id}/scoring`, icon: ClipboardCheck },
  { label: 'Title watch', href: `/dashboard/trials/${id}/title-watch`, icon: Trophy },
  { label: 'Official workbook', href: `/dashboard/trials/${id}/workbook`, icon: FileSpreadsheet },
  { label: 'Finances', href: `/dashboard/trials/${id}/financials`, icon: CircleDollarSign },
  { label: 'Activity journal', href: `/dashboard/trials/${id}/activity`, icon: Activity },
];

export function Sidebar({ className = '', isMobileOpen = false, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const [trials, setTrials] = useState<SddaTrialSummary[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const activeTrialId = pathname.match(/\/dashboard\/trials\/([^/]+)/)?.[1] || null;
  const load = useCallback(async () => { try { setTrials(await listSddaTrials(getSupabaseBrowser())); } catch (error) { console.error('Unable to load SDDA trials for navigation:', error); setTrials([]); } }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (activeTrialId) setExpanded((current) => new Set(current).add(activeTrialId)); }, [activeTrialId]);
  const toggle = (id: string) => setExpanded((current) => { const next = new Set(current); if (next.has(id) && id !== activeTrialId) next.delete(id); else next.add(id); return next; });
  const copyEntryLink = async (id: string) => { await navigator.clipboard.writeText(`${window.location.origin}/sdda-entry/${id}`); setCopied(id); setTimeout(() => setCopied(null), 2000); };

  return <aside className={`${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-[#cfd8d1] bg-[#f7f8f4] transition-transform lg:static ${className}`}>
    <div className="flex items-center justify-between border-b border-[#cfd8d1] bg-[#225f45] px-5 py-5 text-white"><Link href="/dashboard" className="flex items-center gap-3" onClick={onCloseMobile}><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#b98935] text-[10px] font-black">SDDA</span><span><strong className="block font-serif text-xl">TrialDesk</strong><small className="text-[#dce9e1]">Secretary program</small></span></Link><button type="button" className="lg:hidden" onClick={onCloseMobile} aria-label="Close navigation"><X className="h-5 w-5" /></button></div>
    <nav className="flex-1 overflow-y-auto p-4">
      <div className="space-y-1"><Link href="/dashboard" onClick={onCloseMobile} className={`flex items-center gap-3 rounded-lg px-3 py-3 font-semibold ${pathname === '/dashboard' ? 'bg-[#dfece4] text-[#225f45]' : 'text-[#45554b] hover:bg-white'}`}><Home className="h-5 w-5" />Dashboard</Link><Link href="/dashboard/trials" onClick={onCloseMobile} className={`flex items-center gap-3 rounded-lg px-3 py-3 font-semibold ${pathname === '/dashboard/trials' ? 'bg-[#dfece4] text-[#225f45]' : 'text-[#45554b] hover:bg-white'}`}><Calendar className="h-5 w-5" />All SDDA trials</Link><Link href="/dashboard/trials/create" onClick={onCloseMobile} className="flex items-center gap-3 rounded-lg px-3 py-3 font-semibold text-[#45554b] hover:bg-white"><Plus className="h-5 w-5" />Create trial</Link></div>
      <div className="mt-6 border-t border-[#d9ded9] pt-4"><p className="mb-2 px-3 text-xs font-extrabold uppercase tracking-wider text-[#68736c]">SDDA trials & operations</p>{trials.length === 0 && <p className="px-3 py-2 text-sm text-[#68736c]">No trials yet.</p>}{trials.map((trial) => { const open = expanded.has(trial.id) || trial.id === activeTrialId; return <div key={trial.id} className="mb-1"><button type="button" onClick={() => toggle(trial.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-semibold text-[#35443a] hover:bg-white">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}<span className="min-w-0 flex-1 truncate">{trial.name}</span></button>{open && <div className="ml-5 border-l border-[#cfd8d1] pl-2"><Link href={`/sdda-entry/${trial.id}`} target="_blank" onClick={onCloseMobile} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[#526057] hover:bg-white"><ExternalLink className="h-4 w-4" />Competitor entry form</Link>{trialItems(trial.id).map((item) => <Link key={item.href} href={item.href} onClick={onCloseMobile} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${pathname === item.href ? 'bg-[#dfece4] font-bold text-[#225f45]' : item.label === 'Finances' ? 'bg-[#fff7df] font-semibold text-[#7a5718] hover:bg-[#ffefbd]' : 'text-[#526057] hover:bg-white'}`}><item.icon className="h-4 w-4" />{item.label}</Link>)}<button type="button" onClick={() => void copyEntryLink(trial.id)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[#526057] hover:bg-white">{copied === trial.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied === trial.id ? 'Entry link copied' : 'Copy SDDA entry link'}</button></div>}</div>; })}</div>
    </nav>
  </aside>;
}
export default Sidebar;
