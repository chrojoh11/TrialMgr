'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Activity, AlertTriangle, Calendar, Check, Circle, CircleDollarSign, ClipboardList, Copy, ExternalLink, FileSpreadsheet, FileText, ListOrdered, LockKeyhole, MapPin, Save, Trophy, UserPlus, Users } from 'lucide-react';
import { PawLoader } from '@/components/ui/pawLoader';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { SDDA_COMPONENTS, SDDA_LEVELS, SDDA_STREAMS, offeringKey } from '@/lib/sdda/offerings';
import { formatSddaTrialStatus } from '@/lib/sdda/trialSetup';
import { acceptedEntryChargeCents, financialBalanceDelta } from '@/lib/sdda/financialSummary';
import { findSddaScheduleConflicts } from '@/lib/sdda/runningOrder';
import { listSddaFinancialTransactions } from '@/lib/sdda/operationsRepository';
import { gameOfferingKey, getSddaTrialWorkspace, listSddaEntries, listSddaGameScoringRuns, listSddaScoringRuns, saveSddaGameOfferings, saveSddaTrialDayDetails, saveSddaTrialEntrySchedule, saveSddaTrialOfferings, saveSddaTrialPricing, saveSddaTrialPublicDetails, SDDA_GAME_TYPES, setSddaTrialDayEntriesOpen, setSddaTrialEntryStatus, type SddaTrialWorkspace } from '@/lib/sdda/trialRepository';

const scentElementKey = (trialDayId: string, level: string, component: string) => `${trialDayId}|${level}|${component}`;
const firstRelation = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? value[0] || null : value || null;
const localDateTimeInput = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export default function SddaTrialWorkspacePage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gamesSelected, setGamesSelected] = useState<Set<string>>(new Set());
  const [gameConfiguration, setGameConfiguration] = useState<Record<string, { judge_name: string | null; capacity: number | null; entry_fee_cents: number; feo_fee_cents: number; feo_allowed: boolean }>>({});
  const [gameConfigurationDirty, setGameConfigurationDirty] = useState(false);
  const [scentConfiguration, setScentConfiguration] = useState<Record<string, { judge_name: string | null; feo_allowed: boolean }>>({});
  const [scentConfigurationDirty, setScentConfigurationDirty] = useState(false);
  const [pricing, setPricing] = useState({ componentFee: '', threeComponentFee: '', eliteFee: '' });
  const [pricingDirty, setPricingDirty] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [dayDetails, setDayDetails] = useState<Record<string, { trialDate: string; trialNumber: string; judgeName: string }>>({});
  const [savingDay, setSavingDay] = useState<string | null>(null);
  const [publicDetails, setPublicDetails] = useState({ secretaryName: '', secretaryEmail: '', secretaryPhone: '', paymentInstructions: '', cancellationPolicy: '', generalOpenAt: '', closeAt: '' });
  const [savingPublicDetails, setSavingPublicDetails] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [changingEntryStatus, setChangingEntryStatus] = useState(false);
  const [changingDayId, setChangingDayId] = useState<string | null>(null);
  const [entryLinkCopied, setEntryLinkCopied] = useState(false);
  const [workflow, setWorkflow] = useState({ entries: 0, received: 0, accepted: 0, waitlisted: 0, rejected: 0, reactive: 0, runs: 0, ordered: 0, scored: 0, requiredScores: 0, conflicts: 0, outstandingCents: 0 });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const client = getSupabaseBrowser();
      const [workspace, roster, scentRuns, gameRuns, transactions] = await Promise.all([
        getSddaTrialWorkspace(client, trialId),
        listSddaEntries(client, trialId),
        listSddaScoringRuns(client, trialId),
        listSddaGameScoringRuns(client, trialId),
        listSddaFinancialTransactions(client, trialId),
      ]);
      workspace.sdda_trial_days.sort((a, b) => a.day_number - b.day_number);
      setTrial(workspace);
      const normalizedScent = new Set<string>();
      workspace.sdda_trial_offerings.forEach((item) => {
        const streams = item.level === 'Elite' ? (['Amateur'] as const) : SDDA_STREAMS;
        streams.forEach((stream) => normalizedScent.add(offeringKey({ trialDayId: item.trial_day_id, level: item.level, component: item.component, stream })));
      });
      setSelected(normalizedScent);
      const scentConfig: Record<string, { judge_name: string | null; feo_allowed: boolean }> = {};
      workspace.sdda_trial_offerings.forEach((item) => {
        const key = scentElementKey(item.trial_day_id, item.level, item.component);
        if (!scentConfig[key]) scentConfig[key] = { judge_name: item.judge_name || null, feo_allowed: item.feo_allowed || false };
      });
      setScentConfiguration(scentConfig);
      setScentConfigurationDirty(false);
      setGamesSelected(new Set(workspace.sdda_game_offerings.map((item) => gameOfferingKey(item.trial_day_id, item.game_type))));
      setGameConfiguration(Object.fromEntries(workspace.sdda_game_offerings.map((item) => [gameOfferingKey(item.trial_day_id, item.game_type), {
        judge_name: item.judge_name, capacity: item.capacity, entry_fee_cents: item.entry_fee_cents, feo_fee_cents: item.feo_fee_cents, feo_allowed: item.feo_allowed || false,
      }])));
      setGameConfigurationDirty(false);
      setPricing({ componentFee: workspace.scent_component_fee_cents ? (workspace.scent_component_fee_cents / 100).toFixed(2) : '', threeComponentFee: workspace.scent_three_component_fee_cents ? (workspace.scent_three_component_fee_cents / 100).toFixed(2) : '', eliteFee: workspace.elite_fee_cents ? (workspace.elite_fee_cents / 100).toFixed(2) : '' });
      setPricingDirty(false);
      setDayDetails(Object.fromEntries(workspace.sdda_trial_days.map((day) => [day.id, { trialDate: day.trial_date, trialNumber: day.sdda_trial_number || '', judgeName: day.judge_name || '' }])));
      setPublicDetails({ secretaryName: workspace.secretary_name || '', secretaryEmail: workspace.secretary_email || '', secretaryPhone: workspace.secretary_phone || '', paymentInstructions: workspace.payment_instructions || '', cancellationPolicy: workspace.cancellation_policy || '', generalOpenAt: localDateTimeInput(workspace.general_entry_open_at), closeAt: localDateTimeInput(workspace.entry_close_at) });
      const accepted = roster.filter((entry) => entry.confirmation_status === 'accepted').length;
      const scentRequired = scentRuns.filter((run) => run.run_group !== 'FEO');
      const gamesRequired = gameRuns.filter((run) => run.entry_type !== 'FEO');
      const scheduled = scentRuns.map((run, index) => {
        const entry = firstRelation(run.sdda_entries);
        const dog = firstRelation(entry?.sdda_dogs);
        return { id: run.id, dayIndex: workspace.sdda_trial_days.findIndex((day) => day.id === run.trial_day_id), level: run.level, component: run.component, handlerId: entry?.handler_name || '', dogId: dog?.sdda_registration_number || dog?.call_name || '', group: run.run_group, order: run.running_position ?? index + 1 };
      });
      const pricing = { scentComponentFeeCents: workspace.scent_component_fee_cents || 0, scentThreeComponentFeeCents: workspace.scent_three_component_fee_cents || 0, eliteFeeCents: workspace.elite_fee_cents || 0 };
      const automaticCharges = roster.reduce((total, entry) => total + acceptedEntryChargeCents(entry, pricing, workspace.sdda_game_offerings), 0);
      const ledgerBalance = transactions.reduce((balance, item) => {
        return balance + financialBalanceDelta(item);
      }, 0);
      setWorkflow({
        entries: roster.length,
        received: roster.filter((entry) => entry.confirmation_status === 'received').length,
        accepted,
        waitlisted: roster.filter((entry) => entry.confirmation_status === 'waitlisted').length,
        rejected: roster.filter((entry) => entry.confirmation_status === 'rejected').length,
        reactive: roster.filter((entry) => entry.reactivity && entry.reactivity !== 'None').length,
        runs: scentRuns.length + gameRuns.length,
        ordered: scentRuns.filter((run) => run.running_position != null).length + gameRuns.filter((run) => run.running_position != null).length,
        scored: scentRequired.filter((run) => firstRelation(run.sdda_scores)).length + gamesRequired.filter((run) => firstRelation(run.sdda_game_scores)).length,
        requiredScores: scentRequired.length + gamesRequired.length,
        conflicts: findSddaScheduleConflicts(scheduled).length,
        outstandingCents: automaticCharges + ledgerBalance,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load the SDDA trial.');
    } finally { setLoading(false); }
  }, [trialId]);

  useEffect(() => { void load(); }, [load]);

  const original = useMemo(() => new Set((trial?.sdda_trial_offerings || []).map((item) => offeringKey({
    trialDayId: item.trial_day_id, level: item.level, component: item.component, stream: item.stream,
  }))), [trial]);
  const dirty = selected.size !== original.size || [...selected].some((key) => !original.has(key));
  const originalGames = useMemo(() => new Set((trial?.sdda_game_offerings || []).map((item) => gameOfferingKey(item.trial_day_id, item.game_type))), [trial]);
  const gamesDirty = gamesSelected.size !== originalGames.size || [...gamesSelected].some((key) => !originalGames.has(key));
  const hasScent = trial?.trial_format !== 'games';
  const hasGames = trial?.trial_format === 'games' || trial?.trial_format === 'combined';
  const scentReady = !hasScent || selected.size > 0;
  const gamesReady = !hasGames || gamesSelected.size > 0;
  const scentPricingReady = !hasScent || Number(pricing.componentFee) > 0 || Number(pricing.threeComponentFee) > 0 || Number(pricing.eliteFee) > 0;
  const gamesPricingReady = !hasGames || [...gamesSelected].every((key) => (gameConfiguration[key]?.entry_fee_cents || 0) > 0);
  const dayAssignmentsComplete = (trial?.sdda_trial_days || []).every((day) => dayDetails[day.id]?.trialNumber.trim() && dayDetails[day.id]?.judgeName.trim());
  const competitorDetailsReady = Boolean(publicDetails.secretaryName.trim() && publicDetails.secretaryEmail.trim() && publicDetails.paymentInstructions.trim() && publicDetails.cancellationPolicy.trim());

  const toggleScentElement = (trialDayId: string, level: typeof SDDA_LEVELS[number], component: typeof SDDA_COMPONENTS[number]) => {
    setSaved(false);
    setSelected((current) => {
      const next = new Set(current);
      const keys = (level === 'Elite' ? (['Amateur'] as const) : SDDA_STREAMS).map((stream) => offeringKey({ trialDayId, level, component, stream }));
      if (keys.every((key) => next.has(key))) keys.forEach((key) => next.delete(key));
      else keys.forEach((key) => next.add(key));
      return next;
    });
  };

  const updateScentJudge = (key: string, value: string) => {
    setSaved(false); setScentConfigurationDirty(true);
    setScentConfiguration((current) => ({ ...current, [key]: { judge_name: value.trimStart() || null, feo_allowed: current[key]?.feo_allowed || false } }));
  };

  const toggleScentFeo = (key: string) => {
    setSaved(false); setScentConfigurationDirty(true);
    setScentConfiguration((current) => ({ ...current, [key]: { judge_name: current[key]?.judge_name || null, feo_allowed: !current[key]?.feo_allowed } }));
  };

  const allOfferingKeys = useMemo(() => new Set(
    (trial?.sdda_trial_days || []).flatMap((day) =>
      SDDA_LEVELS.flatMap((level) =>
        SDDA_COMPONENTS.flatMap((component) =>
          (level === 'Elite' ? (['Amateur'] as const) : SDDA_STREAMS).map((stream) => offeringKey({ trialDayId: day.id, level, component, stream })),
        ),
      ),
    ),
  ), [trial]);

  const selectAllOfferings = () => {
    setSaved(false);
    setSelected(new Set(allOfferingKeys));
  };

  const clearAllOfferings = () => {
    setSaved(false);
    setSelected(new Set());
  };

  const toggleGame = (key: string) => {
    setSaved(false);
    setGamesSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const updateGameConfiguration = (key: string, field: 'judge_name' | 'capacity' | 'entry_fee_cents' | 'feo_fee_cents', value: string) => {
    setSaved(false);
    setGameConfigurationDirty(true);
    setGameConfiguration((current) => ({
      ...current,
      [key]: {
        judge_name: current[key]?.judge_name || null,
        capacity: current[key]?.capacity || null,
        entry_fee_cents: current[key]?.entry_fee_cents || 0,
        feo_fee_cents: current[key]?.feo_fee_cents || 0,
        feo_allowed: current[key]?.feo_allowed || false,
        [field]: field === 'judge_name' ? (value.trimStart() || null) : field === 'capacity' ? (value ? Math.max(1, Number(value)) : null) : Math.max(0, Math.round(Number(value || 0) * 100)),
      },
    }));
  };

  const toggleGameFeo = (key: string) => {
    setSaved(false); setGameConfigurationDirty(true);
    setGameConfiguration((current) => ({ ...current, [key]: { judge_name: current[key]?.judge_name || null, capacity: current[key]?.capacity || null, entry_fee_cents: current[key]?.entry_fee_cents || 0, feo_fee_cents: current[key]?.feo_fee_cents || 0, feo_allowed: !current[key]?.feo_allowed } }));
  };

  const allGameKeys = useMemo(() => new Set(
    (trial?.sdda_trial_days || []).flatMap((day) => SDDA_GAME_TYPES.map((game) => gameOfferingKey(day.id, game))),
  ), [trial]);

  const updatePricing = (field: keyof typeof pricing, value: string) => {
    if (!/^\d*(?:\.\d{0,2})?$/.test(value)) return;
    setPricing((current) => ({ ...current, [field]: value }));
    setPricingDirty(true); setSaved(false);
  };

  const savePricing = async () => {
    if (!trial || !hasScent) return;
    try {
      setSavingPricing(true); setError(null); setSaved(false);
      await saveSddaTrialPricing(getSupabaseBrowser(), trial.id, {
        componentFeeCents: Math.round(Number(pricing.componentFee || 0) * 100),
        threeComponentFeeCents: Math.round(Number(pricing.threeComponentFee || 0) * 100),
        eliteFeeCents: Math.round(Number(pricing.eliteFee || 0) * 100),
      });
      await load(); setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save Scent entry pricing.');
    } finally { setSavingPricing(false); }
  };

  const save = async () => {
    if (!trial) return;
    try {
      setSaving(true); setError(null);
      const client = getSupabaseBrowser();
      if (hasScent && (dirty || scentConfigurationDirty)) await saveSddaTrialOfferings(client, trial.id, trial.sdda_trial_offerings, selected, scentConfiguration);
      if (hasGames && (gamesDirty || gameConfigurationDirty)) await saveSddaGameOfferings(client, trial.id, trial.sdda_game_offerings, gamesSelected, gameConfiguration);
      if (hasScent && pricingDirty) await saveSddaTrialPricing(client, trial.id, {
        componentFeeCents: Math.round(Number(pricing.componentFee || 0) * 100),
        threeComponentFeeCents: Math.round(Number(pricing.threeComponentFee || 0) * 100),
        eliteFeeCents: Math.round(Number(pricing.eliteFee || 0) * 100),
      });
      await load(); setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save SDDA offerings.');
    } finally { setSaving(false); }
  };

  const changeEntryStatus = async (status: 'entries_open' | 'entries_closed') => {
    if (!trial) return;
    if (status === 'entries_open' && (!scentReady || !gamesReady)) {
      setError('Choose and save at least one offering for every trial format before opening entries.');
      return;
    }
    if (status === 'entries_open' && (!scentPricingReady || !gamesPricingReady) && !window.confirm('Some offered runs do not have entry pricing. Open entries anyway?')) return;
    if (status === 'entries_open' && !competitorDetailsReady && !window.confirm('Secretary contact, payment instructions, or cancellation terms are incomplete. Open entries anyway?')) return;
    if (status === 'entries_open' && !dayAssignmentsComplete && !window.confirm('One or more SDDA trial numbers or judges are still pending. You can add them later. Open entries now?')) return;
    try {
      setChangingEntryStatus(true); setError(null); setSaved(false);
      await setSddaTrialEntryStatus(getSupabaseBrowser(), trial.id, status);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to change entry status.');
    } finally { setChangingEntryStatus(false); }
  };

  const saveDayDetails = async (dayId: string) => {
    try {
      setSavingDay(dayId); setError(null); setSaved(false);
      const details = dayDetails[dayId];
      if (!details?.trialDate) throw new Error('Choose a date for this trial day.');
      await saveSddaTrialDayDetails(getSupabaseBrowser(), dayId, details);
      await load(); setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save trial day details.');
    } finally { setSavingDay(null); }
  };

  const savePublicDetails = async () => {
    if (!trial) return;
    try {
      setSavingPublicDetails(true); setError(null); setSaved(false);
      if ((publicDetails.generalOpenAt || publicDetails.closeAt) && (!publicDetails.generalOpenAt || !publicDetails.closeAt)) throw new Error('Enter both the general opening and closing date/time.');
      await saveSddaTrialPublicDetails(getSupabaseBrowser(), trial.id, publicDetails);
      if (publicDetails.generalOpenAt || publicDetails.closeAt) {
        await saveSddaTrialEntrySchedule(
          getSupabaseBrowser(),
          trial.id,
          new Date(publicDetails.generalOpenAt).toISOString(),
          new Date(publicDetails.closeAt).toISOString(),
        );
      }
      await load(); setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save competitor-facing details.');
    } finally { setSavingPublicDetails(false); }
  };

  const copyEntryFormLink = async () => {
    if (!trial) return;
    const link = `${window.location.origin}/sdda-entry/${trial.id}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const input = document.createElement('textarea');
      input.value = link; input.style.position = 'fixed'; input.style.opacity = '0';
      document.body.appendChild(input); input.select(); document.execCommand('copy'); input.remove();
    }
    setEntryLinkCopied(true);
    window.setTimeout(() => setEntryLinkCopied(false), 2500);
  };

  const changeDayEntryStatus = async (dayId: string, open: boolean) => {
    try {
      setChangingDayId(dayId);
      setError(null);
      await setSddaTrialDayEntriesOpen(getSupabaseBrowser(), dayId, open);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to change this day’s entry status.');
    } finally {
      setChangingDayId(null);
    }
  };

  if (loading) return <MainLayout title="SDDA Trial"><div className="flex justify-center py-20"><PawLoader className="h-8 w-8" /></div></MainLayout>;
  if (!trial) return <MainLayout title="SDDA Trial"><Alert variant="destructive"><AlertDescription>{error || 'Trial not found.'}</AlertDescription></Alert></MainLayout>;

  return (
    <MainLayout breadcrumbItems={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Trials', href: '/dashboard/trials' }, { label: trial.name }]}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="sticky top-0 z-30 -mx-2 flex flex-col gap-3 border-b border-[#cbd9e5] bg-[#f8fafc]/95 px-4 py-4 shadow-sm backdrop-blur sm:flex-row sm:items-start sm:justify-between lg:-mx-4">
          <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold">{trial.name}</h1><Badge>{formatSddaTrialStatus(trial.status)}</Badge><Badge variant="outline">{trial.trial_format === 'combined' ? 'Combined' : trial.trial_format === 'games' ? 'Games' : 'Scent'}</Badge></div><p className="mt-1 text-gray-600">{trial.host_club}</p>{trial.venue && <p className="mt-1 flex items-center text-sm text-gray-600"><MapPin className="mr-2 h-4 w-4" />{trial.venue}</p>}</div>
          <Button onClick={save} disabled={(!dirty && !gamesDirty && !gameConfigurationDirty && !scentConfigurationDirty && !pricingDirty) || saving}>{saving ? <PawLoader className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}Save setup</Button>
        </div>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {saved && <Alert><Check className="h-4 w-4" /><AlertDescription>SDDA trial setup saved.</AlertDescription></Alert>}
        <WorkflowStrip
          trialId={trial.id}
          trialStatus={trial.status}
          setupReady={scentReady && gamesReady && scentPricingReady && gamesPricingReady && competitorDetailsReady}
          workflow={workflow}
        />
        <OperationalSummary trialId={trial.id} workflow={workflow} />
        <Card><CardHeader><CardTitle>Secretary setup checklist</CardTitle><CardDescription>Complete the required setup first; trial numbers and judge assignments can remain pending until SDDA confirms them.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{[
          { ready: scentReady && gamesReady, label: 'Offerings selected', detail: 'Required before opening entries.' },
          { ready: scentPricingReady && gamesPricingReady, label: 'Entry fees configured', detail: 'Strongly recommended before sharing the form.' },
          { ready: competitorDetailsReady, label: 'Secretary, payment, and cancellation details', detail: 'Displayed to competitors before submission.' },
          { ready: dayAssignmentsComplete, label: 'Trial numbers and judges assigned', detail: 'May be completed or changed later.' },
          { ready: trial?.status === 'entries_open', label: 'Competitor entry form open', detail: trial?.status === 'entries_open' ? 'The public form is accepting entries.' : 'Open after reviewing offerings and fees.' },
        ].map((item) => <div key={item.label} className={`flex gap-3 rounded-md border p-3 ${item.ready ? 'border-blue-200 bg-blue-50' : 'border-sky-200 bg-sky-50'}`}>{item.ready ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />}<div><p className="font-semibold">{item.label}</p><p className="text-sm text-gray-600">{item.detail}</p></div></div>)}</CardContent></Card>
        {trial.status === 'entries_open' && (!dayAssignmentsComplete || !scentPricingReady || !gamesPricingReady || !competitorDetailsReady) && <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>Entries are open while some setup remains pending. Complete the highlighted checklist items before producing final running orders, judge packets, and financial reports.</AlertDescription></Alert>}
        <Card><CardHeader><CardTitle>Competitor-facing trial details</CardTitle><CardDescription>These details appear on the public entry form. Update them whenever contact or payment arrangements change.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-3">
          <div><Label htmlFor="secretary-name">Trial secretary</Label><Input id="secretary-name" className="mt-1 bg-white" value={publicDetails.secretaryName} onChange={(event) => setPublicDetails((current) => ({ ...current, secretaryName: event.target.value }))} /></div>
          <div><Label htmlFor="secretary-email">Secretary email</Label><Input id="secretary-email" type="email" className="mt-1 bg-white" value={publicDetails.secretaryEmail} onChange={(event) => setPublicDetails((current) => ({ ...current, secretaryEmail: event.target.value }))} /></div>
          <div><Label htmlFor="secretary-phone">Secretary phone</Label><Input id="secretary-phone" className="mt-1 bg-white" value={publicDetails.secretaryPhone} onChange={(event) => setPublicDetails((current) => ({ ...current, secretaryPhone: event.target.value }))} /></div>
        </div><div className="grid gap-4 rounded-md border border-[#cbd9e5] bg-[#f1f5f9] p-4 md:grid-cols-2"><div><Label htmlFor="general-open-at">General entries open</Label><Input id="general-open-at" type="datetime-local" className="mt-1 bg-white" value={publicDetails.generalOpenAt} onChange={(event) => setPublicDetails((current) => ({ ...current, generalOpenAt: event.target.value }))} /><p className="mt-1 text-xs text-gray-600">Verified registered participants automatically open three days earlier.</p></div><div><Label htmlFor="entry-close-at">Public entries close</Label><Input id="entry-close-at" type="datetime-local" className="mt-1 bg-white" value={publicDetails.closeAt} onChange={(event) => setPublicDetails((current) => ({ ...current, closeAt: event.target.value }))} /><p className="mt-1 text-xs text-gray-600">Secretary entry and editing remain available outside this public window.</p></div></div><div><Label htmlFor="payment-instructions">Payment instructions</Label><textarea id="payment-instructions" rows={4} className="mt-1 w-full rounded-md border border-input bg-white px-3 py-2 text-sm" placeholder="When to pay, accepted method, address, deadline, and reference information" value={publicDetails.paymentInstructions} onChange={(event) => setPublicDetails((current) => ({ ...current, paymentInstructions: event.target.value }))} /></div><div><Label htmlFor="cancellation-policy">Cancellation and refund policy</Label><textarea id="cancellation-policy" rows={4} className="mt-1 w-full rounded-md border border-input bg-white px-3 py-2 text-sm" value={publicDetails.cancellationPolicy} onChange={(event) => setPublicDetails((current) => ({ ...current, cancellationPolicy: event.target.value }))} /></div><Button type="button" variant="outline" disabled={savingPublicDetails} onClick={() => void savePublicDetails()}>{savingPublicDetails ? <PawLoader className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}Save public details &amp; entry schedule</Button></CardContent></Card>
        <Card><CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Trial offering setup</CardTitle><CardDescription>{hasScent && hasGames ? 'Select each Scent level/component and Game offered on each trial day.' : hasGames ? 'Select every SDDA Game offered on each trial day.' : 'Select each level and component offered. Amateur and Working are automatically available on the competitor entry form; Elite has no stream.'}</CardDescription></div><div className="flex flex-wrap gap-2">{hasScent && <><Button type="button" variant="outline" onClick={selectAllOfferings} disabled={selected.size === allOfferingKeys.size}>Select all scent</Button><Button type="button" variant="outline" onClick={clearAllOfferings} disabled={selected.size === 0}>Clear scent</Button></>}{hasGames && <><Button type="button" variant="outline" onClick={() => setGamesSelected(new Set(allGameKeys))} disabled={gamesSelected.size === allGameKeys.size}>Select all Games</Button><Button type="button" variant="outline" onClick={() => setGamesSelected(new Set())} disabled={gamesSelected.size === 0}>Clear Games</Button></>}</div></CardHeader></Card>
        {hasScent && <Card><CardHeader><CardTitle>Scent entry pricing</CardTitle><CardDescription>Trial-level fees used on the entry form, receipts, and in Finances. These are separate from public details and day assignments. A three-component price of $0 uses the individual component price three times.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-3">
          <div><Label htmlFor="component-fee">Per component ($)</Label><Input id="component-fee" inputMode="decimal" className="mt-1 bg-white" value={pricing.componentFee} placeholder="0.00" onChange={(event) => updatePricing('componentFee', event.target.value)} /></div>
          <div><Label htmlFor="package-fee">All 3 components ($)</Label><Input id="package-fee" inputMode="decimal" className="mt-1 bg-white" value={pricing.threeComponentFee} placeholder="0.00" onChange={(event) => updatePricing('threeComponentFee', event.target.value)} /></div>
          <div><Label htmlFor="elite-fee">Elite per dog ($)</Label><Input id="elite-fee" inputMode="decimal" className="mt-1 bg-white" value={pricing.eliteFee} placeholder="0.00" onChange={(event) => updatePricing('eliteFee', event.target.value)} /></div>
          <div className="sm:col-span-3"><Button type="button" variant="outline" disabled={!pricingDirty || savingPricing} onClick={() => void savePricing()}>{savingPricing ? <PawLoader className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}Save Scent pricing</Button></div>
        </CardContent></Card>}
        <Card><CardHeader><CardTitle>Trial operations</CardTitle><CardDescription>Open every secretary workflow for this trial, including its financial ledger.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/entries`)}><Users className="mr-2 h-4 w-4" />Entries & CSV import</Button>
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/team`)}><UserPlus className="mr-2 h-4 w-4" />Trial team</Button>
          {trial.status === 'entries_open' ? <><Button onClick={() => window.open(`/sdda-entry/${trial.id}`, '_blank')}><ExternalLink className="mr-2 h-4 w-4" />Competitor entry form</Button><Button variant="outline" onClick={() => void copyEntryFormLink()}>{entryLinkCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}{entryLinkCopied ? 'Link copied' : 'Copy entry form link'}</Button><Button variant="outline" disabled={changingEntryStatus} onClick={() => void changeEntryStatus('entries_closed')}><LockKeyhole className="mr-2 h-4 w-4" />Close entries</Button></> : <Button disabled={changingEntryStatus} onClick={() => void changeEntryStatus('entries_open')}><ExternalLink className="mr-2 h-4 w-4" />Open entries & enable form</Button>}
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/running-order`)}><ListOrdered className="mr-2 h-4 w-4" />Running orders</Button>
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/score-sheets`)}><FileText className="mr-2 h-4 w-4" />Print score sheets</Button>
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/scoring`)}><ClipboardList className="mr-2 h-4 w-4" />Enter scores</Button>
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/results`)}><Trophy className="mr-2 h-4 w-4" />Results</Button>
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/title-watch`)}><Trophy className="mr-2 h-4 w-4" />Close to Titles & Ribbons</Button>
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/workbook`)}><FileSpreadsheet className="mr-2 h-4 w-4" />Official workbook</Button>
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/financials`)}><CircleDollarSign className="mr-2 h-4 w-4" />Finances</Button>
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/activity`)}><Activity className="mr-2 h-4 w-4" />Activity journal</Button>
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/closeout`)}><LockKeyhole className="mr-2 h-4 w-4" />Trial closeout</Button>
        </CardContent></Card>
        {trial.sdda_trial_days.map((day) => (
          <Card key={day.id}>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="flex items-center"><Calendar className="mr-2 h-5 w-5" />Day {day.day_number}: {day.trial_date}</CardTitle><CardDescription>{day.sdda_trial_number ? `SDDA trial ${day.sdda_trial_number}` : 'SDDA trial number pending'}{day.judge_name ? ` • Judge: ${day.judge_name}` : ' • Judge pending'}</CardDescription></div><div className="flex items-center gap-2"><Badge variant={day.entries_open ? 'default' : 'outline'}>{day.entries_open ? 'Entries open' : 'Entries closed'}</Badge><Button type="button" size="sm" variant="outline" disabled={changingDayId === day.id} onClick={() => void changeDayEntryStatus(day.id, !day.entries_open)}>{changingDayId === day.id ? <PawLoader className="mr-2 h-4 w-4" /> : <LockKeyhole className="mr-2 h-4 w-4" />}{day.entries_open ? 'Close this day' : 'Open this day'}</Button></div></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 rounded-md border border-[#d7ddd8] bg-[#f1f5f9] p-4 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
                <div><Label htmlFor={`${day.id}-trial-date`}>Trial date</Label><Input id={`${day.id}-trial-date`} type="date" className="mt-1 bg-white" value={dayDetails[day.id]?.trialDate || ''} onChange={(event) => setDayDetails((current) => ({ ...current, [day.id]: { trialDate: event.target.value, trialNumber: current[day.id]?.trialNumber || '', judgeName: current[day.id]?.judgeName || '' } }))} /></div>
                <div><Label htmlFor={`${day.id}-trial-number`}>SDDA trial number</Label><Input id={`${day.id}-trial-number`} className="mt-1 bg-white" placeholder="Enter when assigned" value={dayDetails[day.id]?.trialNumber || ''} onChange={(event) => setDayDetails((current) => ({ ...current, [day.id]: { trialDate: current[day.id]?.trialDate || day.trial_date, trialNumber: event.target.value, judgeName: current[day.id]?.judgeName || '' } }))} /></div>
                <div><Label htmlFor={`${day.id}-judge-name`}>Day judge</Label><Input id={`${day.id}-judge-name`} className="mt-1 bg-white" placeholder="Enter or replace judge name" value={dayDetails[day.id]?.judgeName || ''} onChange={(event) => setDayDetails((current) => ({ ...current, [day.id]: { trialDate: current[day.id]?.trialDate || day.trial_date, trialNumber: current[day.id]?.trialNumber || '', judgeName: event.target.value } }))} /></div>
                <Button type="button" variant="outline" disabled={savingDay === day.id} onClick={() => void saveDayDetails(day.id)}>{savingDay === day.id ? <PawLoader className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}Save day details</Button>
              </div><p className="text-xs text-gray-600">The day judge is the default for every offering on this day. A class or Game judge entered below overrides it and can also be replaced later.</p>
              {hasScent && SDDA_LEVELS.map((level) => (
                <div key={level} className="space-y-2"><h3 className="font-semibold">{level}{level === 'Elite' ? ' (no stream)' : ''}</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {SDDA_COMPONENTS.map((component) => {
                    const storageKeys = (level === 'Elite' ? (['Amateur'] as const) : SDDA_STREAMS).map((stream) => offeringKey({ trialDayId: day.id, level, component, stream }));
                    const active = storageKeys.every((key) => selected.has(key));
                    const configKey = scentElementKey(day.id, level, component);
                    return <div key={configKey} className={`rounded-md border p-3 text-sm transition ${active ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white'}`}><button type="button" onClick={() => toggleScentElement(day.id, level, component)} className="flex w-full items-center justify-between text-left"><span className="font-semibold">{component}</span>{active && <Check className="h-4 w-4" />}</button>{active && <div className="mt-3 space-y-3 border-t border-blue-200 pt-3"><div><Label htmlFor={`${configKey}-judge`}>Judge</Label><Input id={`${configKey}-judge`} className="mt-1 bg-white" placeholder={day.judge_name || 'Use day judge'} value={scentConfiguration[configKey]?.judge_name || ''} onChange={(event) => updateScentJudge(configKey, event.target.value)} /><p className="mt-1 text-xs text-gray-600">Both Amateur and Working use this judge.</p></div><label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={scentConfiguration[configKey]?.feo_allowed || false} onChange={() => toggleScentFeo(configKey)} />Allow FEO entries</label></div>}</div>;
                  })}
                </div></div>
              ))}
              {hasGames && <div className="space-y-2"><h3 className="font-semibold">SDDA Games</h3><div className="grid gap-3 sm:grid-cols-2">{SDDA_GAME_TYPES.map((game) => {
                const key = gameOfferingKey(day.id, game);
                const active = gamesSelected.has(key);
                const config = gameConfiguration[key] || { judge_name: null, capacity: null, entry_fee_cents: 0, feo_fee_cents: 0, feo_allowed: false };
                return <div key={key} className={`rounded-md border p-3 text-sm transition ${active ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white'}`}>
                  <button type="button" onClick={() => toggleGame(key)} className="flex w-full items-center justify-between text-left"><span className="font-semibold">{game}</span>{active && <Check className="h-4 w-4" />}</button>
                  {active && <div className="mt-3 grid gap-3 border-t border-blue-200 pt-3 sm:grid-cols-2">
                    <div className="sm:col-span-2"><Label htmlFor={`${key}-judge`}>Judge</Label><Input id={`${key}-judge`} className="bg-white" value={config.judge_name || ''} onChange={(event) => updateGameConfiguration(key, 'judge_name', event.target.value)} /></div>
                    <div><Label htmlFor={`${key}-capacity`}>Capacity</Label><Input id={`${key}-capacity`} className="bg-white" type="number" min="1" value={config.capacity || ''} onChange={(event) => updateGameConfiguration(key, 'capacity', event.target.value)} /></div>
                    <div><Label htmlFor={`${key}-fee`}>Regular fee ($)</Label><Input id={`${key}-fee`} className="bg-white" type="number" min="0" step="0.01" placeholder="0.00" value={config.entry_fee_cents ? config.entry_fee_cents / 100 : ''} onChange={(event) => updateGameConfiguration(key, 'entry_fee_cents', event.target.value)} /></div>
                    <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={config.feo_allowed} onChange={() => toggleGameFeo(key)} />Allow FEO entries</label>
                    {config.feo_allowed && <div><Label htmlFor={`${key}-feo-fee`}>FEO fee ($)</Label><Input id={`${key}-feo-fee`} className="bg-white" type="number" min="0" step="0.01" placeholder="0.00" value={config.feo_fee_cents ? config.feo_fee_cents / 100 : ''} onChange={(event) => updateGameConfiguration(key, 'feo_fee_cents', event.target.value)} /></div>}
                  </div>}
                </div>;
              })}</div><p className="text-sm text-gray-600">Judges, capacities, Regular/FEO fees, Team pairs, and run order are configured after the Games are selected.</p></div>}
            </CardContent>
          </Card>
        ))}
      </div>
    </MainLayout>
  );
}

function WorkflowStrip({ trialId, trialStatus, setupReady, workflow }: {
  trialId: string;
  trialStatus: string;
  setupReady: boolean;
  workflow: { entries: number; accepted: number; runs: number; ordered: number; scored: number; requiredScores: number };
}) {
  const allOrdered = workflow.runs > 0 && workflow.ordered === workflow.runs;
  const allScored = workflow.requiredScores > 0 && workflow.scored === workflow.requiredScores;
  const steps = [
    { label: 'Setup', href: `/dashboard/trials/${trialId}`, ready: setupReady, detail: setupReady ? 'Ready' : 'Needs review' },
    { label: 'Entries', href: `/dashboard/trials/${trialId}/entries`, ready: workflow.accepted > 0, detail: `${workflow.accepted}/${workflow.entries} accepted` },
    { label: 'Running Order', href: `/dashboard/trials/${trialId}/running-order`, ready: allOrdered, detail: workflow.runs ? `${workflow.ordered}/${workflow.runs} placed` : 'No accepted runs' },
    { label: 'Score Sheets', href: `/dashboard/trials/${trialId}/score-sheets`, ready: allOrdered, detail: allOrdered ? 'Ready to print' : 'Order runs first' },
    { label: 'Score Entry', href: `/dashboard/trials/${trialId}/scoring`, ready: allScored, detail: workflow.requiredScores ? `${workflow.scored}/${workflow.requiredScores} scored` : 'No scoring runs' },
    { label: 'Results', href: `/dashboard/trials/${trialId}/results`, ready: allScored, detail: allScored ? 'Ready to review' : 'Scores incomplete' },
    { label: 'Titles & Ribbons', href: `/dashboard/trials/${trialId}/title-watch`, ready: workflow.accepted > 0, detail: workflow.accepted > 0 ? 'Plan maximum ribbons' : 'No accepted entries' },
    { label: 'Workbook', href: `/dashboard/trials/${trialId}/workbook`, ready: allScored, detail: allScored ? 'Ready to export' : 'Scores incomplete' },
    { label: 'Closeout', href: `/dashboard/trials/${trialId}/closeout`, ready: trialStatus === 'completed', detail: trialStatus === 'completed' ? 'Completed' : 'Final review' },
  ];
  return <Card className="border-[#b6c8d8] bg-[#f8fafc]"><CardHeader><CardTitle>Trial workflow</CardTitle><CardDescription>Follow the same left-to-right secretary process throughout the trial. Select any stage to open it.</CardDescription></CardHeader><CardContent><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{steps.map((step, index) => <Link key={step.label} href={step.href} className={`group relative rounded-lg border p-3 transition hover:-translate-y-0.5 hover:shadow-sm ${step.ready ? 'border-blue-300 bg-blue-50' : 'border-sky-200 bg-white'}`}><div className="flex items-center justify-between"><span className="text-xs font-bold text-gray-500">{index + 1}</span>{step.ready ? <Check className="h-4 w-4 text-blue-700" /> : <Circle className="h-4 w-4 text-sky-700" />}</div><p className="mt-2 font-semibold text-[#294f73]">{step.label}</p><p className="mt-1 text-xs text-gray-600">{step.detail}</p></Link>)}</div></CardContent></Card>;
}

function OperationalSummary({ trialId, workflow }: { trialId: string; workflow: { entries: number; received: number; accepted: number; waitlisted: number; rejected: number; reactive: number; runs: number; ordered: number; scored: number; requiredScores: number; conflicts: number; outstandingCents: number } }) {
  const money = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(workflow.outstandingCents / 100);
  const items = [
    { label: 'Entry decisions', value: `${workflow.received} awaiting · ${workflow.accepted} accepted · ${workflow.waitlisted} waitlisted`, attention: workflow.received > 0, href: `/dashboard/trials/${trialId}/entries` },
    { label: 'Running order', value: `${workflow.ordered}/${workflow.runs} runs placed · ${workflow.conflicts} possible conflicts`, attention: workflow.runs > workflow.ordered || workflow.conflicts > 0, href: `/dashboard/trials/${trialId}/running-order` },
    { label: 'Reactive teams', value: `${workflow.reactive} entr${workflow.reactive === 1 ? 'y' : 'ies'} flagged`, attention: workflow.reactive > 0, href: `/dashboard/trials/${trialId}/running-order` },
    { label: 'Score completion', value: `${workflow.scored}/${workflow.requiredScores} required runs scored`, attention: workflow.requiredScores > workflow.scored, href: `/dashboard/trials/${trialId}/scoring` },
    { label: 'Outstanding entry balances', value: money, attention: workflow.outstandingCents > 0, href: `/dashboard/trials/${trialId}/financials` },
    { label: 'Close to Titles & Ribbon Planning', value: 'See possible titles and the maximum ribbons to prepare', attention: false, href: `/dashboard/trials/${trialId}/title-watch` },
  ];
  return <Card><CardHeader><CardTitle>Secretary operational summary</CardTitle><CardDescription>Items that may need attention before or during the trial.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <Link key={item.label} href={item.href} className={`rounded-lg border p-4 transition hover:shadow-sm ${item.attention ? 'border-sky-300 bg-sky-50' : 'border-blue-200 bg-blue-50'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#294f73]">{item.label}</p><p className="mt-1 text-sm text-gray-700">{item.value}</p></div>{item.attention ? <AlertTriangle className="h-5 w-5 shrink-0 text-sky-700" /> : <Check className="h-5 w-5 shrink-0 text-blue-700" />}</div></Link>)}</CardContent></Card>;
}
