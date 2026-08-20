'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Activity, AlertTriangle, Calendar, Check, Circle, CircleDollarSign, Copy, ExternalLink, FileSpreadsheet, FileText, ListOrdered, Loader2, LockKeyhole, MapPin, Save, Users } from 'lucide-react';
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
import { gameOfferingKey, getSddaTrialWorkspace, saveSddaGameOfferings, saveSddaTrialDayDetails, saveSddaTrialOfferings, saveSddaTrialPricing, saveSddaTrialPublicDetails, SDDA_GAME_TYPES, setSddaTrialEntryStatus, type SddaTrialWorkspace } from '@/lib/sdda/trialRepository';

export default function SddaTrialWorkspacePage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gamesSelected, setGamesSelected] = useState<Set<string>>(new Set());
  const [gameConfiguration, setGameConfiguration] = useState<Record<string, { judge_name: string | null; capacity: number | null; entry_fee_cents: number; feo_fee_cents: number }>>({});
  const [gameConfigurationDirty, setGameConfigurationDirty] = useState(false);
  const [pricing, setPricing] = useState({ componentFee: '', threeComponentFee: '', eliteFee: '' });
  const [pricingDirty, setPricingDirty] = useState(false);
  const [dayDetails, setDayDetails] = useState<Record<string, { trialNumber: string; judgeName: string }>>({});
  const [savingDay, setSavingDay] = useState<string | null>(null);
  const [publicDetails, setPublicDetails] = useState({ secretaryName: '', secretaryEmail: '', secretaryPhone: '', paymentInstructions: '', cancellationPolicy: '' });
  const [savingPublicDetails, setSavingPublicDetails] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [changingEntryStatus, setChangingEntryStatus] = useState(false);
  const [entryLinkCopied, setEntryLinkCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const workspace = await getSddaTrialWorkspace(getSupabaseBrowser(), trialId);
      workspace.sdda_trial_days.sort((a, b) => a.day_number - b.day_number);
      setTrial(workspace);
      setSelected(new Set(workspace.sdda_trial_offerings.map((item) => offeringKey({
        trialDayId: item.trial_day_id, level: item.level, component: item.component, stream: item.stream,
      }))));
      setGamesSelected(new Set(workspace.sdda_game_offerings.map((item) => gameOfferingKey(item.trial_day_id, item.game_type))));
      setGameConfiguration(Object.fromEntries(workspace.sdda_game_offerings.map((item) => [gameOfferingKey(item.trial_day_id, item.game_type), {
        judge_name: item.judge_name, capacity: item.capacity, entry_fee_cents: item.entry_fee_cents, feo_fee_cents: item.feo_fee_cents,
      }])));
      setGameConfigurationDirty(false);
      setPricing({ componentFee: workspace.scent_component_fee_cents ? (workspace.scent_component_fee_cents / 100).toFixed(2) : '', threeComponentFee: workspace.scent_three_component_fee_cents ? (workspace.scent_three_component_fee_cents / 100).toFixed(2) : '', eliteFee: workspace.elite_fee_cents ? (workspace.elite_fee_cents / 100).toFixed(2) : '' });
      setPricingDirty(false);
      setDayDetails(Object.fromEntries(workspace.sdda_trial_days.map((day) => [day.id, { trialNumber: day.sdda_trial_number || '', judgeName: day.judge_name || '' }])));
      setPublicDetails({ secretaryName: workspace.secretary_name || '', secretaryEmail: workspace.secretary_email || '', secretaryPhone: workspace.secretary_phone || '', paymentInstructions: workspace.payment_instructions || '', cancellationPolicy: workspace.cancellation_policy || '' });
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

  const toggle = (key: string) => {
    setSaved(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
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
        [field]: field === 'judge_name' ? (value.trimStart() || null) : field === 'capacity' ? (value ? Math.max(1, Number(value)) : null) : Math.max(0, Math.round(Number(value || 0) * 100)),
      },
    }));
  };

  const allGameKeys = useMemo(() => new Set(
    (trial?.sdda_trial_days || []).flatMap((day) => SDDA_GAME_TYPES.map((game) => gameOfferingKey(day.id, game))),
  ), [trial]);

  const updatePricing = (field: keyof typeof pricing, value: string) => {
    if (!/^\d*(?:\.\d{0,2})?$/.test(value)) return;
    setPricing((current) => ({ ...current, [field]: value }));
    setPricingDirty(true); setSaved(false);
  };

  const save = async () => {
    if (!trial) return;
    try {
      setSaving(true); setError(null);
      const client = getSupabaseBrowser();
      if (hasScent) await saveSddaTrialOfferings(client, trial.id, trial.sdda_trial_offerings, selected);
      if (hasGames) await saveSddaGameOfferings(client, trial.id, trial.sdda_game_offerings, gamesSelected, gameConfiguration);
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
      await saveSddaTrialDayDetails(getSupabaseBrowser(), dayId, dayDetails[dayId] || { trialNumber: '', judgeName: '' });
      await load(); setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save trial day details.');
    } finally { setSavingDay(null); }
  };

  const savePublicDetails = async () => {
    if (!trial) return;
    try {
      setSavingPublicDetails(true); setError(null); setSaved(false);
      await saveSddaTrialPublicDetails(getSupabaseBrowser(), trial.id, publicDetails);
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

  if (loading) return <MainLayout title="SDDA Trial"><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div></MainLayout>;
  if (!trial) return <MainLayout title="SDDA Trial"><Alert variant="destructive"><AlertDescription>{error || 'Trial not found.'}</AlertDescription></Alert></MainLayout>;

  return (
    <MainLayout title={trial.name} breadcrumbItems={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Trials', href: '/dashboard/trials' }, { label: trial.name }]}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold">{trial.name}</h1><Badge>{formatSddaTrialStatus(trial.status)}</Badge><Badge variant="outline">{trial.trial_format === 'combined' ? 'Combined' : trial.trial_format === 'games' ? 'Games' : 'Scent'}</Badge></div><p className="mt-1 text-gray-600">{trial.host_club}</p>{trial.venue && <p className="mt-1 flex items-center text-sm text-gray-600"><MapPin className="mr-2 h-4 w-4" />{trial.venue}</p>}</div>
          <Button onClick={save} disabled={(!dirty && !gamesDirty && !gameConfigurationDirty && !pricingDirty) || saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save setup</Button>
        </div>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {saved && <Alert><Check className="h-4 w-4" /><AlertDescription>SDDA trial setup saved.</AlertDescription></Alert>}
        <Card><CardHeader><CardTitle>Secretary setup checklist</CardTitle><CardDescription>Complete the required setup first; trial numbers and judge assignments can remain pending until SDDA confirms them.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{[
          { ready: scentReady && gamesReady, label: 'Offerings selected', detail: 'Required before opening entries.' },
          { ready: scentPricingReady && gamesPricingReady, label: 'Entry fees configured', detail: 'Strongly recommended before sharing the form.' },
          { ready: competitorDetailsReady, label: 'Secretary, payment, and cancellation details', detail: 'Displayed to competitors before submission.' },
          { ready: dayAssignmentsComplete, label: 'Trial numbers and judges assigned', detail: 'May be completed or changed later.' },
          { ready: trial?.status === 'entries_open', label: 'Competitor entry form open', detail: trial?.status === 'entries_open' ? 'The public form is accepting entries.' : 'Open after reviewing offerings and fees.' },
        ].map((item) => <div key={item.label} className={`flex gap-3 rounded-md border p-3 ${item.ready ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>{item.ready ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />}<div><p className="font-semibold">{item.label}</p><p className="text-sm text-gray-600">{item.detail}</p></div></div>)}</CardContent></Card>
        {trial.status === 'entries_open' && (!dayAssignmentsComplete || !scentPricingReady || !gamesPricingReady || !competitorDetailsReady) && <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>Entries are open while some setup remains pending. Complete the amber checklist items before producing final running orders, judge packets, and financial reports.</AlertDescription></Alert>}
        <Card><CardHeader><CardTitle>Competitor-facing trial details</CardTitle><CardDescription>These details appear on the public entry form. Update them whenever contact or payment arrangements change.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-3">
          <div><Label htmlFor="secretary-name">Trial secretary</Label><Input id="secretary-name" className="mt-1 bg-white" value={publicDetails.secretaryName} onChange={(event) => setPublicDetails((current) => ({ ...current, secretaryName: event.target.value }))} /></div>
          <div><Label htmlFor="secretary-email">Secretary email</Label><Input id="secretary-email" type="email" className="mt-1 bg-white" value={publicDetails.secretaryEmail} onChange={(event) => setPublicDetails((current) => ({ ...current, secretaryEmail: event.target.value }))} /></div>
          <div><Label htmlFor="secretary-phone">Secretary phone</Label><Input id="secretary-phone" className="mt-1 bg-white" value={publicDetails.secretaryPhone} onChange={(event) => setPublicDetails((current) => ({ ...current, secretaryPhone: event.target.value }))} /></div>
        </div><div><Label htmlFor="payment-instructions">Payment instructions</Label><textarea id="payment-instructions" rows={4} className="mt-1 w-full rounded-md border border-input bg-white px-3 py-2 text-sm" placeholder="When to pay, accepted method, address, deadline, and reference information" value={publicDetails.paymentInstructions} onChange={(event) => setPublicDetails((current) => ({ ...current, paymentInstructions: event.target.value }))} /></div><div><Label htmlFor="cancellation-policy">Cancellation and refund policy</Label><textarea id="cancellation-policy" rows={4} className="mt-1 w-full rounded-md border border-input bg-white px-3 py-2 text-sm" value={publicDetails.cancellationPolicy} onChange={(event) => setPublicDetails((current) => ({ ...current, cancellationPolicy: event.target.value }))} /></div><Button type="button" variant="outline" disabled={savingPublicDetails} onClick={() => void savePublicDetails()}>{savingPublicDetails ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save public details</Button></CardContent></Card>
        <Card><CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Trial offering setup</CardTitle><CardDescription>{hasScent && hasGames ? 'Select the scent classes and Games offered on each trial day.' : hasGames ? 'Select every SDDA Game offered on each trial day.' : 'Select every level, component, and stream offered on each trial day.'}</CardDescription></div><div className="flex flex-wrap gap-2">{hasScent && <><Button type="button" variant="outline" onClick={selectAllOfferings} disabled={selected.size === allOfferingKeys.size}>Select all scent</Button><Button type="button" variant="outline" onClick={clearAllOfferings} disabled={selected.size === 0}>Clear scent</Button></>}{hasGames && <><Button type="button" variant="outline" onClick={() => setGamesSelected(new Set(allGameKeys))} disabled={gamesSelected.size === allGameKeys.size}>Select all Games</Button><Button type="button" variant="outline" onClick={() => setGamesSelected(new Set())} disabled={gamesSelected.size === 0}>Clear Games</Button></>}</div></CardHeader></Card>
        {hasScent && <Card><CardHeader><CardTitle>Scent entry pricing</CardTitle><CardDescription>These prices automatically calculate accepted-entry balances in Finances. A three-component price of $0 uses the individual component price three times.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-3">
          <div><Label htmlFor="component-fee">Per component ($)</Label><Input id="component-fee" inputMode="decimal" className="mt-1 bg-white" value={pricing.componentFee} placeholder="0.00" onChange={(event) => updatePricing('componentFee', event.target.value)} /></div>
          <div><Label htmlFor="package-fee">All 3 components ($)</Label><Input id="package-fee" inputMode="decimal" className="mt-1 bg-white" value={pricing.threeComponentFee} placeholder="0.00" onChange={(event) => updatePricing('threeComponentFee', event.target.value)} /></div>
          <div><Label htmlFor="elite-fee">Elite per dog ($)</Label><Input id="elite-fee" inputMode="decimal" className="mt-1 bg-white" value={pricing.eliteFee} placeholder="0.00" onChange={(event) => updatePricing('eliteFee', event.target.value)} /></div>
        </CardContent></Card>}
        <Card><CardHeader><CardTitle>Trial operations</CardTitle><CardDescription>Open every secretary workflow for this trial, including its financial ledger.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/entries`)}><Users className="mr-2 h-4 w-4" />Entries & CSV import</Button>
          {trial.status === 'entries_open' ? <><Button onClick={() => window.open(`/sdda-entry/${trial.id}`, '_blank')}><ExternalLink className="mr-2 h-4 w-4" />Competitor entry form</Button><Button variant="outline" onClick={() => void copyEntryFormLink()}>{entryLinkCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}{entryLinkCopied ? 'Link copied' : 'Copy entry form link'}</Button><Button variant="outline" disabled={changingEntryStatus} onClick={() => void changeEntryStatus('entries_closed')}><LockKeyhole className="mr-2 h-4 w-4" />Close entries</Button></> : <Button disabled={changingEntryStatus} onClick={() => void changeEntryStatus('entries_open')}><ExternalLink className="mr-2 h-4 w-4" />Open entries & enable form</Button>}
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/running-order`)}><ListOrdered className="mr-2 h-4 w-4" />Running orders</Button>
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/score-sheets`)}><FileText className="mr-2 h-4 w-4" />Print score sheets</Button>
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/workbook`)}><FileSpreadsheet className="mr-2 h-4 w-4" />Official workbook</Button>
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/financials`)}><CircleDollarSign className="mr-2 h-4 w-4" />Finances</Button>
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/activity`)}><Activity className="mr-2 h-4 w-4" />Activity journal</Button>
        </CardContent></Card>
        {trial.sdda_trial_days.map((day) => (
          <Card key={day.id}>
            <CardHeader><CardTitle className="flex items-center"><Calendar className="mr-2 h-5 w-5" />Day {day.day_number}: {day.trial_date}</CardTitle><CardDescription>{day.sdda_trial_number ? `SDDA trial ${day.sdda_trial_number}` : 'SDDA trial number pending'}{day.judge_name ? ` • Judge: ${day.judge_name}` : ' • Judge pending'}</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 rounded-md border border-[#d7ddd8] bg-[#f7f8f4] p-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
                <div><Label htmlFor={`${day.id}-trial-number`}>SDDA trial number</Label><Input id={`${day.id}-trial-number`} className="mt-1 bg-white" placeholder="Enter when assigned" value={dayDetails[day.id]?.trialNumber || ''} onChange={(event) => setDayDetails((current) => ({ ...current, [day.id]: { trialNumber: event.target.value, judgeName: current[day.id]?.judgeName || '' } }))} /></div>
                <div><Label htmlFor={`${day.id}-judge-name`}>Day judge</Label><Input id={`${day.id}-judge-name`} className="mt-1 bg-white" placeholder="Enter or replace judge name" value={dayDetails[day.id]?.judgeName || ''} onChange={(event) => setDayDetails((current) => ({ ...current, [day.id]: { trialNumber: current[day.id]?.trialNumber || '', judgeName: event.target.value } }))} /></div>
                <Button type="button" variant="outline" disabled={savingDay === day.id} onClick={() => void saveDayDetails(day.id)}>{savingDay === day.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save day details</Button>
              </div>
              {hasScent && SDDA_LEVELS.map((level) => (
                <div key={level} className="space-y-2"><h3 className="font-semibold">{level}{level === 'Elite' ? ' (no stream)' : ''}</h3><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {SDDA_COMPONENTS.flatMap((component) => (level === 'Elite' ? (['Amateur'] as const) : SDDA_STREAMS).map((stream) => {
                    const key = offeringKey({ trialDayId: day.id, level, component, stream });
                    const active = selected.has(key);
                    return <button type="button" key={key} onClick={() => toggle(key)} className={`rounded-md border p-3 text-left text-sm transition ${active ? 'border-orange-600 bg-orange-50 text-orange-900' : 'border-gray-200 hover:border-orange-300'}`}><span className="font-medium">{component}</span>{level !== 'Elite' && <span className="ml-2 text-gray-600">{stream}</span>}{active && <Check className="float-right h-4 w-4" />}</button>;
                  }))}
                </div></div>
              ))}
              {hasGames && <div className="space-y-2"><h3 className="font-semibold">SDDA Games</h3><div className="grid gap-3 sm:grid-cols-2">{SDDA_GAME_TYPES.map((game) => {
                const key = gameOfferingKey(day.id, game);
                const active = gamesSelected.has(key);
                const config = gameConfiguration[key] || { judge_name: null, capacity: null, entry_fee_cents: 0, feo_fee_cents: 0 };
                return <div key={key} className={`rounded-md border p-3 text-sm transition ${active ? 'border-orange-600 bg-orange-50 text-orange-900' : 'border-gray-200 bg-white'}`}>
                  <button type="button" onClick={() => toggleGame(key)} className="flex w-full items-center justify-between text-left"><span className="font-semibold">{game}</span>{active && <Check className="h-4 w-4" />}</button>
                  {active && <div className="mt-3 grid gap-3 border-t border-orange-200 pt-3 sm:grid-cols-2">
                    <div className="sm:col-span-2"><Label htmlFor={`${key}-judge`}>Judge</Label><Input id={`${key}-judge`} className="bg-white" value={config.judge_name || ''} onChange={(event) => updateGameConfiguration(key, 'judge_name', event.target.value)} /></div>
                    <div><Label htmlFor={`${key}-capacity`}>Capacity</Label><Input id={`${key}-capacity`} className="bg-white" type="number" min="1" value={config.capacity || ''} onChange={(event) => updateGameConfiguration(key, 'capacity', event.target.value)} /></div>
                    <div><Label htmlFor={`${key}-fee`}>Regular fee ($)</Label><Input id={`${key}-fee`} className="bg-white" type="number" min="0" step="0.01" placeholder="0.00" value={config.entry_fee_cents ? config.entry_fee_cents / 100 : ''} onChange={(event) => updateGameConfiguration(key, 'entry_fee_cents', event.target.value)} /></div>
                    <div><Label htmlFor={`${key}-feo-fee`}>FEO fee ($)</Label><Input id={`${key}-feo-fee`} className="bg-white" type="number" min="0" step="0.01" placeholder="0.00" value={config.feo_fee_cents ? config.feo_fee_cents / 100 : ''} onChange={(event) => updateGameConfiguration(key, 'feo_fee_cents', event.target.value)} /></div>
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
