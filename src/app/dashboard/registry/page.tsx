'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Database, RefreshCw, Search } from 'lucide-react';
import { PawLoader } from '@/components/ui/pawLoader';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

type RegistryDog = {
  registration_number: string; call_name: string; breed: string; sex: string;
  owner_number: string | null; owner_name: string | null;
};

const chunk = <T,>(rows: T[], size: number) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));

export default function SddaRegistryPage() {
  const [status, setStatus] = useState<RegistryStatus | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<RegistryDog[]>([]);

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

  const search = async () => {
    const query = searchText.trim();
    if (query.length < 2) { setError('Enter at least two characters to search the registry.'); return; }
    setSearching(true); setSearched(false); setError('');
    const result = await getSupabaseBrowser().rpc('sdda_search_registry_dogs', { search_text: query });
    if (result.error) { setError(result.error.message); setResults([]); }
    else { setResults((result.data || []) as RegistryDog[]); setSearched(true); }
    setSearching(false);
  };

  return <MainLayout title="SDDA dog registry" breadcrumbItems={[{ label: 'Registry' }]}>
    <div className="mx-auto max-w-4xl space-y-5">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {message && <Alert className="border-blue-300 bg-blue-50 text-blue-900"><CheckCircle2 className="h-4 w-4" /><AlertDescription>{message}</AlertDescription></Alert>}
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />Official SDDA dog registry</CardTitle><CardDescription>Refreshes registration numbers, call names, breeds and component history from the SDDA Dogs sheet in the newest official Trial Workbook.</CardDescription></CardHeader><CardContent className="space-y-4">
        {allowed === false && <Alert variant="destructive"><AlertDescription>Only a database-appointed TrialDesk administrator can replace the registry snapshot.</AlertDescription></Alert>}
        {status?.available ? <div className="rounded-lg border bg-[#f1f5f9] p-4"><div className="flex flex-wrap items-center gap-2"><strong>{status.source_name}</strong><Badge className="bg-[#294f73] text-white">{status.row_count?.toLocaleString()} dogs</Badge></div><p className="mt-2 text-sm text-[#475569]">Imported {status.imported_at ? new Date(status.imported_at).toLocaleString() : 'recently'}{status.source_refreshed_at ? ` · source reference ${status.source_refreshed_at}` : ''}</p></div> : <p className="rounded-lg border border-sky-300 bg-sky-50 p-4 text-sky-900">No registry snapshot has been activated. Entry numbers cannot yet be checked against the official list.</p>}
        <Button onClick={() => void refresh()} disabled={busy || allowed !== true}>{busy ? <PawLoader className="mr-2 h-4 w-4" /> : <RefreshCw className="mr-2 h-4 w-4" />}Refresh from SDDA</Button>
        {progress && <p className="text-sm font-semibold text-[#294f73]">{progress}</p>}
        <p className="text-xs text-[#64748b]">A refresh is staged completely before it becomes active, so a failed download or partial import cannot replace the working registry.</p>
      </CardContent></Card>
      {allowed === true && <Card><CardHeader><CardTitle>Search official dogs</CardTitle><CardDescription>Search by SDDA number, dog call name, owner name or registered participant number.</CardDescription></CardHeader><CardContent className="space-y-4">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void search(); }}>
          <Input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Example: 4429, Fizzgig, or Marla Williamson" aria-label="Registry search" />
          <Button type="submit" disabled={searching}>{searching ? <PawLoader className="mr-2 h-4 w-4" /> : <Search className="mr-2 h-4 w-4" />}Search</Button>
        </form>
        {searched && results.length === 0 && <p className="rounded-lg border bg-[#f1f5f9] p-4 text-sm">No matching dogs were found in the active official registry.</p>}
        {results.length > 0 && <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[#e9efe9] text-[#173f31]"><tr><th className="px-3 py-2">SDDA #</th><th className="px-3 py-2">Dog</th><th className="px-3 py-2">Breed</th><th className="px-3 py-2">Sex</th><th className="px-3 py-2">Owner</th><th className="px-3 py-2">Participant #</th></tr></thead>
          <tbody>{results.map((dog) => <tr key={`${dog.registration_number}-${dog.owner_number || ''}`} className="border-t bg-white"><td className="px-3 py-2 font-semibold text-[#294f73]">{dog.registration_number}</td><td className="px-3 py-2 font-semibold">{dog.call_name}</td><td className="px-3 py-2">{dog.breed || '—'}</td><td className="px-3 py-2">{dog.sex || '—'}</td><td className="px-3 py-2">{dog.owner_name || '—'}</td><td className="px-3 py-2">{dog.owner_number || '—'}</td></tr>)}</tbody>
        </table></div>}
        {results.length === 50 && <p className="text-xs text-[#64748b]">Showing the first 50 matches. Add more detail to narrow the search.</p>}
      </CardContent></Card>}
    </div>
  </MainLayout>;
}
