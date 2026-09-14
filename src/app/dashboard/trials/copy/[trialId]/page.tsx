'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Copy } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PawLoader } from '@/components/ui/pawLoader';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { copySddaTrial } from '@/lib/sdda/trialRepository';

type CopySource = {
  id: string;
  name: string;
  host_club: string;
  venue: string | null;
  trial_format: string;
  sdda_trial_days: Array<{ day_number: number; trial_date: string }>;
};

export default function CopyTrialPage() {
  const sourceTrialId = useParams<{ trialId: string }>().trialId;
  const router = useRouter();
  const [source, setSource] = useState<CopySource | null>(null);
  const [name, setName] = useState('');
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: readError } = await getSupabaseBrowser()
        .from('sdda_trials')
        .select('id,name,host_club,venue,trial_format,sdda_trial_days(day_number,trial_date)')
        .eq('id', sourceTrialId)
        .single();
      if (readError || !data) throw new Error(readError?.message || 'Source trial not found.');
      const loaded = data as CopySource;
      setSource(loaded);
      setName(`${loaded.name} Copy`);
      setDates([...loaded.sdda_trial_days].sort((a, b) => a.day_number - b.day_number).map(() => ''));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load the source trial.');
    } finally {
      setLoading(false);
    }
  }, [sourceTrialId]);

  useEffect(() => { void load(); }, [load]);

  const createCopy = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length < 3 || trimmedName.length > 120) {
      setError('Trial name must be between 3 and 120 characters.');
      return;
    }
    if (dates.some((date) => !date)) {
      setError('Enter every date for the new trial.');
      return;
    }
    if (new Set(dates).size !== dates.length || dates.some((date, index) => index > 0 && date <= dates[index - 1])) {
      setError('New trial dates must be unique and in chronological order.');
      return;
    }
    try {
      setCopying(true);
      setError('');
      const newTrialId = await copySddaTrial(getSupabaseBrowser(), sourceTrialId, trimmedName, dates);
      router.push(`/dashboard/trials/${newTrialId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to copy the trial.');
    } finally {
      setCopying(false);
    }
  };

  if (loading) return <MainLayout title="Copy SDDA Trial"><div className="flex justify-center py-20"><PawLoader className="h-8 w-8" /></div></MainLayout>;
  if (!source) return <MainLayout title="Copy SDDA Trial"><Alert variant="destructive"><AlertDescription>{error || 'Source trial not found.'}</AlertDescription></Alert></MainLayout>;

  return <MainLayout title="Copy SDDA Trial" breadcrumbItems={[{ label: 'Trials', href: '/dashboard/trials' }, { label: source.name, href: `/dashboard/trials/${source.id}` }, { label: 'Copy trial' }]}>
    <div className="mx-auto max-w-3xl space-y-6">
      <div><h1 className="text-3xl font-bold">Copy trial</h1><p className="mt-1 text-gray-600">Create a clean draft using {source.name} as the setup template.</p></div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Alert><AlertDescription><strong>Copied:</strong> club, venue, format, pricing, payment and cancellation instructions, capacities, FEO settings, and offerings. <strong>Not copied:</strong> entries, runs, scores, payments, expenses, trial numbers, or judges.</AlertDescription></Alert>
      <Card><CardHeader><CardTitle>New trial identity</CardTitle><CardDescription>The copy remains a draft until you review it and open entries.</CardDescription></CardHeader><CardContent className="space-y-4"><div><Label htmlFor="copy-name">Trial name</Label><Input id="copy-name" minLength={3} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></div><div className="grid gap-3 sm:grid-cols-2"><div><p className="text-xs font-bold uppercase text-gray-500">Host club</p><p>{source.host_club}</p></div><div><p className="text-xs font-bold uppercase text-gray-500">Format</p><p className="capitalize">{source.trial_format}</p></div></div></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center"><Calendar className="mr-2 h-5 w-5" />New trial dates</CardTitle><CardDescription>Provide one new date for each day in the source trial.</CardDescription></CardHeader><CardContent className="space-y-3">{dates.map((date, index) => <div key={index}><Label htmlFor={`copy-day-${index}`}>Day {index + 1}</Label><Input id={`copy-day-${index}`} type="date" value={date} onChange={(event) => setDates((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /></div>)}</CardContent></Card>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button variant="outline" onClick={() => router.push(`/dashboard/trials/${source.id}`)}><ArrowLeft className="mr-2 h-4 w-4" />Back to trial</Button><Button onClick={() => void createCopy()} disabled={copying}>{copying ? <PawLoader className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}Create draft copy</Button></div>
    </div>
  </MainLayout>;
}
