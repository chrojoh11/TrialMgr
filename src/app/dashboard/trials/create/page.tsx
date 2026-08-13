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

export default function CreateTrialPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [hostClub, setHostClub] = useState('');
  const [venue, setVenue] = useState('');
  const [dates, setDates] = useState(['']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError(null);
      await createSddaTrial(getSupabaseBrowser(), { name, hostClub, venue, dates });
      router.push('/dashboard/trials');
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
          <p className="mt-1 text-gray-600">Set up the trial and its one-to-four days. Levels, components, and running orders come next.</p>
        </div>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <Card>
          <CardHeader><CardTitle>Trial details</CardTitle><CardDescription>SDDA host and venue information.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div><Label htmlFor="name">Trial name</Label><Input id="name" required minLength={3} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label htmlFor="club">Host club</Label><Input id="club" required minLength={2} maxLength={120} value={hostClub} onChange={(e) => setHostClub(e.target.value)} /></div>
            <div><Label htmlFor="venue">Venue</Label><Input id="venue" value={venue} onChange={(e) => setVenue(e.target.value)} /></div>
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
        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={() => router.push('/dashboard/trials')}><ArrowLeft className="mr-2 h-4 w-4" />Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : 'Create Draft Trial'}</Button>
        </div>
      </form>
    </MainLayout>
  );
}
