'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Calendar, Check, ListOrdered, Loader2, MapPin, Save, Users } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { SDDA_COMPONENTS, SDDA_LEVELS, SDDA_STREAMS, offeringKey } from '@/lib/sdda/offerings';
import { formatSddaTrialStatus } from '@/lib/sdda/trialSetup';
import { getSddaTrialWorkspace, saveSddaTrialOfferings, type SddaTrialWorkspace } from '@/lib/sdda/trialRepository';

export default function SddaTrialWorkspacePage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load the SDDA trial.');
    } finally { setLoading(false); }
  }, [trialId]);

  useEffect(() => { void load(); }, [load]);

  const original = useMemo(() => new Set((trial?.sdda_trial_offerings || []).map((item) => offeringKey({
    trialDayId: item.trial_day_id, level: item.level, component: item.component, stream: item.stream,
  }))), [trial]);
  const dirty = selected.size !== original.size || [...selected].some((key) => !original.has(key));

  const toggle = (key: string) => {
    setSaved(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const save = async () => {
    if (!trial) return;
    try {
      setSaving(true); setError(null);
      await saveSddaTrialOfferings(getSupabaseBrowser(), trial.id, trial.sdda_trial_offerings, selected);
      await load(); setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save SDDA offerings.');
    } finally { setSaving(false); }
  };

  if (loading) return <MainLayout title="SDDA Trial"><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div></MainLayout>;
  if (!trial) return <MainLayout title="SDDA Trial"><Alert variant="destructive"><AlertDescription>{error || 'Trial not found.'}</AlertDescription></Alert></MainLayout>;

  return (
    <MainLayout title={trial.name} breadcrumbItems={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Trials', href: '/dashboard/trials' }, { label: trial.name }]}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><div className="flex items-center gap-3"><h1 className="text-3xl font-bold">{trial.name}</h1><Badge>{formatSddaTrialStatus(trial.status)}</Badge></div><p className="mt-1 text-gray-600">{trial.host_club}</p>{trial.venue && <p className="mt-1 flex items-center text-sm text-gray-600"><MapPin className="mr-2 h-4 w-4" />{trial.venue}</p>}</div>
          <Button onClick={save} disabled={!dirty || saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save offerings</Button>
        </div>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {saved && <Alert><Check className="h-4 w-4" /><AlertDescription>SDDA offerings saved.</AlertDescription></Alert>}
        <Card><CardHeader><CardTitle>Trial offering setup</CardTitle><CardDescription>Select every level, component, and stream offered on each trial day.</CardDescription></CardHeader></Card>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/entries`)}><Users className="mr-2 h-4 w-4" />Entries & CSV import</Button>
          <Button variant="outline" onClick={() => location.assign(`/dashboard/trials/${trial.id}/running-order`)}><ListOrdered className="mr-2 h-4 w-4" />Running orders</Button>
        </div>
        {trial.sdda_trial_days.map((day) => (
          <Card key={day.id}>
            <CardHeader><CardTitle className="flex items-center"><Calendar className="mr-2 h-5 w-5" />Day {day.day_number}: {day.trial_date}</CardTitle><CardDescription>{day.sdda_trial_number ? `SDDA trial ${day.sdda_trial_number}` : 'SDDA trial number pending'}{day.judge_name ? ` • Judge: ${day.judge_name}` : ''}</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              {SDDA_LEVELS.map((level) => (
                <div key={level} className="space-y-2"><h3 className="font-semibold">{level}</h3><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {SDDA_COMPONENTS.flatMap((component) => SDDA_STREAMS.map((stream) => {
                    const key = offeringKey({ trialDayId: day.id, level, component, stream });
                    const active = selected.has(key);
                    return <button type="button" key={key} onClick={() => toggle(key)} className={`rounded-md border p-3 text-left text-sm transition ${active ? 'border-orange-600 bg-orange-50 text-orange-900' : 'border-gray-200 hover:border-orange-300'}`}><span className="font-medium">{component}</span><span className="ml-2 text-gray-600">{stream}</span>{active && <Check className="float-right h-4 w-4" />}</button>;
                  }))}
                </div></div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </MainLayout>
  );
}
