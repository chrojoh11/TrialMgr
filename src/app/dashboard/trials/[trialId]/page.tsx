'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Activity, Calendar, Check, CircleDollarSign, Copy, ExternalLink, FileSpreadsheet, FileText, ListOrdered, Loader2, LockKeyhole, MapPin, Save, Users } from 'lucide-react';
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
import { gameOfferingKey, getSddaTrialWorkspace, saveSddaGameOfferings, saveSddaTrialOfferings, SDDA_GAME_TYPES, setSddaTrialEntryStatus, type SddaTrialWorkspace } from '@/lib/sdda/trialRepository';

export default function SddaTrialWorkspacePage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gamesSelected, setGamesSelected] = useState<Set<string>>(new Set());
  const [gameConfiguration, setGameConfiguration] = useState<Record<string, { judge_name: string | null; capacity: number | null; entry_fee_cents: number; feo_fee_cents: number }>>({});
  const [gameConfigurationDirty, setGameConfigurationDirty] = useState(false);
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
          SDDA_STREAMS.map((stream) => offeringKey({ trialDayId: day.id, level, component, stream })),
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

  const save = async () => {
    if (!trial) return;
    try {
      setSaving(true); setError(null);
      const client = getSupabaseBrowser();
      if (hasScent) await saveSddaTrialOfferings(client, trial.id, trial.sdda_trial_offerings, selected);
      if (hasGames) await saveSddaGameOfferings(client, trial.id, trial.sdda_game_offerings, gamesSelected, gameConfiguration);
      await load(); setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save SDDA offerings.');
    } finally { setSaving(false); }
  };

  const changeEntryStatus = async (status: 'entries_open' | 'entries_closed') => {
    if (!trial) return;
    try {
      setChangingEntryStatus(true); setError(null); setSaved(false);
      await setSddaTrialEntryStatus(getSupabaseBrowser(), trial.id, status);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to change entry status.');
    } finally { setChangingEntryStatus(false); }
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
          <Button onClick={save} disabled={(!dirty && !gamesDirty && !gameConfigurationDirty) || saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save offerings</Button>
        </div>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {saved && <Alert><Check className="h-4 w-4" /><AlertDescription>SDDA offerings saved.</AlertDescription></Alert>}
        <Card><CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Trial offering setup</CardTitle><CardDescription>{hasScent && hasGames ? 'Select the scent classes and Games offered on each trial day.' : hasGames ? 'Select every SDDA Game offered on each trial day.' : 'Select every level, component, and stream offered on each trial day.'}</CardDescription></div><div className="flex flex-wrap gap-2">{hasScent && <><Button type="button" variant="outline" onClick={selectAllOfferings} disabled={selected.size === allOfferingKeys.size}>Select all scent</Button><Button type="button" variant="outline" onClick={clearAllOfferings} disabled={selected.size === 0}>Clear scent</Button></>}{hasGames && <><Button type="button" variant="outline" onClick={() => setGamesSelected(new Set(allGameKeys))} disabled={gamesSelected.size === allGameKeys.size}>Select all Games</Button><Button type="button" variant="outline" onClick={() => setGamesSelected(new Set())} disabled={gamesSelected.size === 0}>Clear Games</Button></>}</div></CardHeader></Card>
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
            <CardHeader><CardTitle className="flex items-center"><Calendar className="mr-2 h-5 w-5" />Day {day.day_number}: {day.trial_date}</CardTitle><CardDescription>{day.sdda_trial_number ? `SDDA trial ${day.sdda_trial_number}` : 'SDDA trial number pending'}{day.judge_name ? ` • Judge: ${day.judge_name}` : ''}</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              {hasScent && SDDA_LEVELS.map((level) => (
                <div key={level} className="space-y-2"><h3 className="font-semibold">{level}</h3><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {SDDA_COMPONENTS.flatMap((component) => SDDA_STREAMS.map((stream) => {
                    const key = offeringKey({ trialDayId: day.id, level, component, stream });
                    const active = selected.has(key);
                    return <button type="button" key={key} onClick={() => toggle(key)} className={`rounded-md border p-3 text-left text-sm transition ${active ? 'border-orange-600 bg-orange-50 text-orange-900' : 'border-gray-200 hover:border-orange-300'}`}><span className="font-medium">{component}</span><span className="ml-2 text-gray-600">{stream}</span>{active && <Check className="float-right h-4 w-4" />}</button>;
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
