'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Gavel } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PawLoader } from '@/components/ui/pawLoader';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { listActiveSddaJudges, type SddaJudge } from '@/lib/sdda/trialRepository';

export default function SddaJudgeDirectoryPage() {
  const [judges, setJudges] = useState<SddaJudge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setJudges(await listActiveSddaJudges(getSupabaseBrowser()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load the judge directory.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <MainLayout title="SDDA Judge Directory" breadcrumbItems={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Judges' }]}>
      <div className="mx-auto max-w-4xl space-y-4">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Gavel className="h-5 w-5" />Current judge choices</CardTitle>
            <CardDescription>
              These names populate TrialDesk judge selectors. SDDA confirms level eligibility during sanctioning; all listed judges may judge Games.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href="https://www.sdda.ca/sporting-detection-dogs-association-judges/"
              target="_blank"
              rel="noreferrer"
              className="mb-4 inline-flex items-center gap-2 font-semibold text-[#294f73] underline"
            >
              Open the official SDDA Judges page <ExternalLink className="h-4 w-4" />
            </a>
            {loading ? <div className="flex items-center gap-2 py-8"><PawLoader className="h-5 w-5" />Loading judges…</div> : (
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100"><tr><th className="px-4 py-3">Judge</th><th className="px-4 py-3">SDDA contact ID</th><th className="px-4 py-3">Directory checked</th></tr></thead>
                  <tbody>{judges.map((judge) => <tr key={judge.sdda_contact_id} className="border-t border-slate-200"><td className="px-4 py-3 font-medium">{judge.display_name}</td><td className="px-4 py-3">{judge.sdda_contact_id}</td><td className="px-4 py-3">{judge.source_checked_on}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

