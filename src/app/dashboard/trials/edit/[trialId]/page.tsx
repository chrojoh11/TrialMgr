'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Plus, Save, X } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PawLoader } from '@/components/ui/pawLoader';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { replaceSddaTrialDaySchedule } from '@/lib/sdda/trialRepository';
import type { SddaTrialFormat } from '@/lib/sdda/trialSetup';

type EditableTrial = {
  id: string;
  name: string;
  host_club: string;
  venue: string | null;
  trial_format: SddaTrialFormat;
  status: string;
  sdda_trial_days: Array<{ id: string; day_number: number; trial_date: string }>;
};

export default function EditTrialPage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const router = useRouter();
  const [trial, setTrial] = useState<EditableTrial | null>(null);
  const [name, setName] = useState('');
  const [hostClub, setHostClub] = useState('');
  const [venue, setVenue] = useState('');
  const [trialFormat, setTrialFormat] = useState<SddaTrialFormat>('scent');
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: readError } = await getSupabaseBrowser()
        .from('sdda_trials')
        .select('id,name,host_club,venue,trial_format,status,sdda_trial_days(id,day_number,trial_date)')
        .eq('id', trialId)
        .single();
      if (readError || !data) throw new Error(readError?.message || 'Trial not found.');
      const loaded = data as EditableTrial;
      setTrial(loaded);
      setName(loaded.name);
      setHostClub(loaded.host_club);
      setVenue(loaded.venue || '');
      setTrialFormat(loaded.trial_format);
      setDates([...loaded.sdda_trial_days].sort((a, b) => a.day_number - b.day_number).map((day) => day.trial_date));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load trial details.');
    } finally {
      setLoading(false);
    }
  }, [trialId]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!trial) return;

    const trimmedName = name.trim();
    const trimmedClub = hostClub.trim();
    const trimmedVenue = venue.trim();

    if (trimmedName.length < 3 || trimmedName.length > 120) {
      setError('Trial name must be between 3 and 120 characters.');
      return;
    }
    if (trimmedClub.length < 2 || trimmedClub.length > 120) {
      setError('Host club must be between 2 and 120 characters.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSaved(false);
      const client = getSupabaseBrowser();
      const before = {
        name: trial.name,
        host_club: trial.host_club,
        venue: trial.venue,
        trial_format: trial.trial_format,
      };
      const after = {
        name: trimmedName,
        host_club: trimmedClub,
        venue: trimmedVenue || null,
        trial_format: trialFormat,
      };

      const { error: updateError } = await client
        .from('sdda_trials')
        .update({ ...after, updated_at: new Date().toISOString() })
        .eq('id', trial.id);
      if (updateError) throw new Error(updateError.message);

      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError || !authData.user) throw new Error(authError?.message || 'Signed-in user required.');
      const { error: auditError } = await client.from('sdda_audit_records').insert({
        trial_id: trial.id,
        actor_id: authData.user.id,
        action: 'trial.details_updated',
        entity_type: 'sdda_trial',
        entity_id: trial.id,
        before_state: before,
        after_state: after,
      });
      if (auditError) throw new Error(`Trial changed, but audit recording failed: ${auditError.message}`);

      setTrial({ ...trial, ...after });
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save trial details.');
    } finally {
      setSaving(false);
    }
  };

  const saveSchedule = async () => {
    if (!trial) return;
    if (dates.some((date) => !date)) {
      setError('Every trial day requires a date.');
      return;
    }
    if (new Set(dates).size !== dates.length) {
      setError('Each trial day must have a different date.');
      return;
    }
    if (dates.some((date, index) => index > 0 && date <= dates[index - 1])) {
      setError('Trial dates must be entered in chronological order.');
      return;
    }
    try {
      setScheduleSaving(true);
      setScheduleSaved(false);
      setError(null);
      await replaceSddaTrialDaySchedule(getSupabaseBrowser(), trial.id, dates);
      setScheduleSaved(true);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the trial-day schedule.');
    } finally {
      setScheduleSaving(false);
    }
  };

  if (loading) return <MainLayout title="Edit SDDA Trial"><div className="flex justify-center py-20"><PawLoader className="h-8 w-8" /></div></MainLayout>;
  if (!trial) return <MainLayout title="Edit SDDA Trial"><Alert variant="destructive"><AlertDescription>{error || 'Trial not found.'}</AlertDescription></Alert></MainLayout>;

  return (
    <MainLayout title="Edit SDDA Trial" breadcrumbItems={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Trials', href: '/dashboard/trials' }, { label: trial.name, href: `/dashboard/trials/${trial.id}` }, { label: 'Edit' }]}>
      <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Edit trial</h1>
          <p className="mt-1 text-gray-600">Change the trial identity or format without recreating the trial.</p>
        </div>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {saved && <Alert><AlertDescription>Trial details saved. Existing entries and runs were not changed.</AlertDescription></Alert>}
        {scheduleSaved && <Alert><AlertDescription>Trial-day schedule saved. Existing day assignments and offerings were preserved.</AlertDescription></Alert>}

        <Card>
          <CardHeader><CardTitle>Trial details</CardTitle><CardDescription>These changes apply to the existing trial record.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div><Label htmlFor="trial-name">Trial name</Label><Input id="trial-name" required minLength={3} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label htmlFor="host-club">Host club</Label><Input id="host-club" required minLength={2} maxLength={120} value={hostClub} onChange={(e) => setHostClub(e.target.value)} /></div>
            <div><Label htmlFor="venue">Venue and full address</Label><Input id="venue" value={venue} onChange={(e) => setVenue(e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center"><Calendar className="mr-2 h-5 w-5" />Trial days</CardTitle>
            <CardDescription>Add up to four days or revise the dates. Days are kept in chronological order. Only the final day can be removed, and only after its offerings are cleared and it has no competitor runs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {dates.map((date, index) => (
              <div key={index} className="flex items-end gap-3 rounded-lg border bg-[#f8fafc] p-3">
                <div className="flex-1"><Label htmlFor={`trial-day-${index}`}>Day {index + 1}</Label><Input id={`trial-day-${index}`} type="date" value={date} onChange={(event) => setDates((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /></div>
                {dates.length > 1 && index === dates.length - 1 && <Button type="button" variant="outline" aria-label={`Remove Day ${index + 1}`} onClick={() => setDates((current) => current.slice(0, -1))}><X className="h-4 w-4" /></Button>}
              </div>
            ))}
            <div className="flex flex-wrap gap-3">
              {dates.length < 4 && <Button type="button" variant="outline" onClick={() => setDates((current) => [...current, ''])}><Plus className="mr-2 h-4 w-4" />Add trial day</Button>}
              <Button type="button" onClick={() => void saveSchedule()} disabled={scheduleSaving}>{scheduleSaving ? <PawLoader className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}Save trial days</Button>
            </div>
            <Alert><AlertDescription>Changing a date does not move offerings or entries to a different day number. Removing a populated day is blocked rather than deleting operational records.</AlertDescription></Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trial format</CardTitle>
            <CardDescription>Changing format does not create, delete, or modify any competitor entries or runs. It only controls which setup sections and entry choices are available.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div role="radiogroup" aria-label="Trial format" className="grid gap-3 md:grid-cols-3">
              {([
                ['scent', 'Scent', 'Regular scent classes only.'],
                ['games', 'Games', 'SDDA Games only.'],
                ['combined', 'Combined', 'Scent classes and SDDA Games in the same trial.'],
              ] as const).map(([value, title, description]) => (
                <Label key={value} htmlFor={`format-${value}`} className={`cursor-pointer rounded-lg border p-4 ${trialFormat === value ? 'border-sky-700 bg-sky-50 ring-1 ring-sky-700' : 'bg-white'}`}>
                  <span className="flex items-center gap-2"><input id={`format-${value}`} type="radio" name="trial-format" value={value} checked={trialFormat === value} onChange={() => setTrialFormat(value)} className="h-4 w-4 accent-sky-800" /><span className="font-semibold">{title}</span></span>
                  <span className="mt-2 block text-sm font-normal text-gray-600">{description}</span>
                </Label>
              ))}
            </div>
            {trial.trial_format === 'scent' && trialFormat === 'combined' && (
              <Alert><AlertDescription>Safe conversion: all current Scent entries remain exactly as entered. After saving, open the trial and select only the Games you want to add.</AlertDescription></Alert>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => router.push(`/dashboard/trials/${trial.id}`)}><ArrowLeft className="mr-2 h-4 w-4" />Back to trial</Button>
          <Button type="submit" disabled={saving}>{saving ? <PawLoader className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}Save trial changes</Button>
        </div>
      </form>
    </MainLayout>
  );
}
