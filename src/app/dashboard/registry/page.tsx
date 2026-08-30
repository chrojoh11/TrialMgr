'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Database, Loader2, RefreshCw } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { parseSddaHistoryWorkbook } from '@/lib/sdda/titleHistoryWorkbook';

type RegistryStatus = {
  available: boolean;
  source_name?: string;
  source_url?: string;
  source_refreshed_at?: string;
  imported_at?: string;
  row_count?: number;
};

const chunk = <T,>(rows: T[], size: number) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));

export default function SddaRegistryPage() {
  const [status, setStatus] = useState<RegistryStatus | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const client = getSupabaseBrowser();
    const [adminResult, statusResult] = await Promise.all([
      client.rpc('sdda_is_administrator'),
      client.rpc('sdda_active_registry_status'),
    ]);
    if (adminResult.error) setError(adminResult.error.message);
    setAllowed(Boolean(adminResult.data));
    if (!statusResult.error) setStatus(statusResult.data as RegistryStatus);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const refresh = async () => {
    try {
      setBusy(true); setError(''); setMessage(''); setProgress('Downloading the current official workbook…');
      const response = await fetch('/api/sdda/latest-workbook', { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Unable to download the current official SDDA workbook.');
      }
      const sourceUrl = response.headers.get('x-sdda-source') || '';
      const sourceName = sourceUrl.split('/').pop() || 'SDDA Trial Workbook';
      const parsed = parseSddaHistoryWorkbook(await response.arrayBuffer());
      if (!parsed.dogs.length) throw new Error('The SDDA Dogs sheet contained no registry records.');
      const client = getSupabaseBrowser();
      const begun = await client.rpc('sdda_begin_registry_import', {
        source_name: sourceName,
        source_url: sourceUrl,
        source_refreshed_at: parsed.refreshedAt || sourceName.match(/\d{8}/)?.[0] || '',
      });
      if (begun.error) throw begun.error;
      const snapshotId = begun.data as string;
      const batches = chunk(parsed.dogs, 400);
      for (let index = 0; index < batches.length; index += 1) {
        setProgress(`Importing official dogs ${index * 400 + 1}–${Math.min((index + 1) * 400, parsed.dogs.length)} of ${parsed.dogs.length}…`);
        const imported = await client.rpc('sdda_import_registry_chunk', {
          target_snapshot_id: snapshotId,
          rows: batches[index].map((dog) => ({
            registration_number: dog.registrationNumber,
            call_name: dog.dogName,
            breed: dog.breed,
            sex: dog.sex,
            owner_number: dog.ownerNumber,
            owner_name: dog.ownerName,
            qualifying_counts: dog.qualifyingCounts,
          })),
        });
        if (imported.error) throw imported.error;
      }
      setProgress('Activating the verified registry snapshot…');
      const finished = await client.rpc('sdda_finish_registry_import', { target_snapshot_id: snapshotId });
      if (finished.error) throw finished.error;
      setMessage(`${finished.data} SDDA dogs were loaded from ${sourceName}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to refresh the SDDA dog registry.');
    } finally {
      setBusy(false); setProgress('');
    }
  };

  return <MainLayout title="SDDA dog registry" breadcrumbItems={[{ label: 'Registry' }]}>
    <div className="mx-auto max-w-4xl space-y-5">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {message && <Alert className="border-green-300 bg-green-50 text-green-900"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{message}</AlertDescription></Alert>}
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />Official SDDA dog registry</CardTitle><CardDescription>Refreshes registration numbers, call names, breeds and component history from the SDDA Dogs sheet in the newest official Trial Workbook.</CardDescription></CardHeader><CardContent className="space-y-4">
        {allowed === false && <Alert variant="destructive"><AlertDescription>Only a database-appointed TrialDesk administrator can replace the registry snapshot.</AlertDescription></Alert>}
        {status?.available ? <div className="rounded-lg border bg-[#f7f8f4] p-4"><div className="flex flex-wrap items-center gap-2"><strong>{status.source_name}</strong><Badge className="bg-[#225f45] text-white">{status.row_count?.toLocaleString()} dogs</Badge></div><p className="mt-2 text-sm text-[#526057]">Imported {status.imported_at ? new Date(status.imported_at).toLocaleString() : 'recently'}{status.source_refreshed_at ? ` · source reference ${status.source_refreshed_at}` : ''}</p></div> : <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">No registry snapshot has been activated. Entry numbers cannot yet be checked against the official list.</p>}
        <Button onClick={() => void refresh()} disabled={busy || allowed !== true}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Refresh from SDDA</Button>
        {progress && <p className="text-sm font-semibold text-[#225f45]">{progress}</p>}
        <p className="text-xs text-[#68736c]">A refresh is staged completely before it becomes active, so a failed download or partial import cannot replace the working registry.</p>
      </CardContent></Card>
    </div>
  </MainLayout>;
}
