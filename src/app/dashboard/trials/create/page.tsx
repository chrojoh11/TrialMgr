'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Loader2, Plus, X } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { createSddaTrial } from '@/lib/sdda/trialRepository';
import type { SddaTrialFormat } from '@/lib/sdda/trialSetup';

export default function CreateTrialPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [hostClub, setHostClub] = useState('');
  const [venue, setVenue] = useState('');
  const [dates, setDates] = useState(['']);
  const [trialFormat, setTrialFormat] = useState<SddaTrialFormat>('scent');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const trialId = await createSddaTrial(getSupabaseBrowser(), { name, hostClub, venue, dates, trialFormat });
      router.push(`/dashboard/trials/${trialId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create the SDDA trial.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout title="Create SDDA Trial" breadcrumbItems={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Trials', href: '/dashboard/trials' }, { label: 'Create' }]}>
      <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Create SDDA Trial</h1>
          <p className="mt-1 text-gray-600">Set up a Scent trial, Games trial, or a Combined event with one-to-four days.</p>
        </div>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <Card>
          <CardHeader><CardTitle>Trial details</CardTitle><CardDescription>SDDA host and venue information.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div><Label htmlFor="name">Trial name</Label><Input id="name" required minLength={3} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label htmlFor="club">Host club</Label><Input id="club" required minLength={2} maxLength={120} value={hostClub} onChange={(e) => setHostClub(e.target.value)} /></div>
            <div><Label htmlFor="venue">Venue and full address</Label><Input id="venue" required minLength={3} placeholder="Facility name, street address, city, province, postal code" value={venue} onChange={(e) => setVenue(e.target.value)} /><p className="mt-1 text-xs text-gray-500">Shown to competitors on the entry form and trial documents.</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Trial format</CardTitle><CardDescription>Choose what this event offers. Combined trials include both regular scent classes and SDDA Games.</CardDescription></CardHeader>
          <CardContent>
            <div role="radiogroup" aria-label="Trial format" className="grid gap-3 md:grid-cols-3">
              {([
                ['scent', 'Scent', 'Started through Elite: Container, Interior, and Exterior.'],
                ['games', 'Games', 'Aerial, Distance, Speed, and Team games.'],
                ['combined', 'Combined', 'Scent classes and Games in the same trial.'],
              ] as const).map(([value, title, description]) => (
                <Label key={value} htmlFor={`format-${value}`} className={`cursor-pointer rounded-lg border p-4 ${trialFormat === value ? 'border-amber-700 bg-amber-50 ring-1 ring-amber-700' : 'bg-white'}`}>
                  <span className="flex items-center gap-2"><input id={`format-${value}`} type="radio" name="trial-format" value={value} checked={trialFormat === value} onChange={() => setTrialFormat(value)} className="h-4 w-4 accent-amber-800" /><span className="font-semibold">{title}</span></span>
                  <span className="mt-2 block text-sm font-normal text-gray-600">{description}</span>
                </Label>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center"><Calendar className="mr-2 h-5 w-5" />Trial days</CardTitle><CardDescription>Select between one and four unique dates.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {dates.map((date, index) => (
              <div key={index} className="flex gap-2">
                <Input type="date" required value={date} onChange={(e) => setDates((current) => current.map((value, i) => i === index ? e.target.value : value))} />
                {dates.length > 1 && <Button type="button" variant="outline" size="sm" aria-label={`Remove day ${index + 1}`} onClick={() => setDates((current) => current.filter((_, i) => i !== index))}><X className="h-4 w-4" /></Button>}
              </div>
            ))}
            {dates.length < 4 && <Button type="button" variant="outline" onClick={() => setDates((current) => [...current, ''])}><Plus className="mr-2 h-4 w-4" />Add trial day</Button>}
          </CardContent>
        </Card>
        <Alert><AlertDescription>Create the draft with the information you know now. On the next screen you will choose offerings and fees for each day. SDDA trial numbers and judges may be entered later and can be replaced if an assignment changes.</AlertDescription></Alert>
        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={() => router.push('/dashboard/trials')}><ArrowLeft className="mr-2 h-4 w-4" />Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : 'Create Draft Trial'}</Button>
        </div>
      </form>
    </MainLayout>
  );
}
