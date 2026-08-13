'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Calendar, Loader2, MapPin, Plus, Search } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { listSddaTrials, type SddaTrialSummary } from '@/lib/sdda/trialRepository';
import { formatSddaTrialStatus } from '@/lib/sdda/trialSetup';

export default function TrialsPage() {
  const [trials, setTrials] = useState<SddaTrialSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setTrials(await listSddaTrials(getSupabaseBrowser()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load SDDA trials.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term
      ? trials.filter((trial) => [trial.name, trial.host_club, trial.venue || ''].some((value) => value.toLowerCase().includes(term)))
      : trials;
  }, [search, trials]);

  return (
    <MainLayout title="SDDA Trials" breadcrumbItems={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Trials' }]}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">SDDA Trials</h1>
            <p className="mt-1 text-gray-600">Create and manage one-to-four-day SDDA scent detection trials.</p>
          </div>
          <Link href="/dashboard/trials/create"><Button><Plus className="mr-2 h-4 w-4" />Create SDDA Trial</Button></Link>
        </div>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search SDDA trials" className="pl-10" />
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-orange-600" /></div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-14 text-center"><Calendar className="mx-auto mb-3 h-10 w-10 text-gray-400" /><p>No SDDA trials found.</p></CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((trial) => {
              const days = [...(trial.sdda_trial_days || [])].sort((a, b) => a.day_number - b.day_number);
              return (
                <Card key={trial.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle>{trial.name}</CardTitle>
                      <Badge>{formatSddaTrialStatus(trial.status)}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="font-medium">{trial.host_club}</p>
                    {trial.venue && <p className="flex items-center text-gray-600"><MapPin className="mr-2 h-4 w-4" />{trial.venue}</p>}
                    <p className="flex items-center text-gray-600"><Calendar className="mr-2 h-4 w-4" />{days.map((day) => day.trial_date).join(', ')}</p>
                    <p>{days.length} trial {days.length === 1 ? 'day' : 'days'}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
