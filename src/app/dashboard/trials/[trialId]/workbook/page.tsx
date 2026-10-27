'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Download, FileSpreadsheet, Pin, Upload } from 'lucide-react';
import { PawLoader } from '@/components/ui/pawLoader';
import MainLayout from '@/components/layout/mainLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import {
  buildOfficialSddaWorkbook,
  officialWorkbookDogNumbers,
  reviewOfficialSddaWorkbook,
  type OfficialWorkbookRun,
} from '@/lib/sdda/officialWorkbook';
import {
  getSddaTrialWorkspace,
  listSddaGameScoringRuns,
  listSddaOfficialWorkbookRuns,
  pinSddaWorkbook,
  pinUploadedSddaWorkbook,
  type SddaTrialWorkspace,
} from '@/lib/sdda/trialRepository';

const templatePath = '/api/sdda/latest-workbook';
const safeName = (value: string) => value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
const first = <T,>(value: T | T[] | null | undefined): T | undefined =>
  Array.isArray(value) ? value[0] : value || undefined;
const sha256 = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer))
  )
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

type PreparedRun = OfficialWorkbookRun & {
  entryStatus: string;
  trialDayId: string;
  trialNumber: string;
};

export default function SddaOfficialWorkbookPage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trial, setTrial] = useState<SddaTrialWorkspace | null>(null);
  const [runs, setRuns] = useState<PreparedRun[]>([]);
  const [gameRuns, setGameRuns] = useState<Awaited<ReturnType<typeof listSddaGameScoringRuns>>>([]);
  const [registryNumbers, setRegistryNumbers] = useState<Set<string> | null>(null);
  const [templateBytes, setTemplateBytes] = useState<Uint8Array | null>(null);
  const [templateMeta, setTemplateMeta] = useState<{
    source: string;
    filename: string;
    sha256: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const client = getSupabaseBrowser();
      const [workspace, records, games] = await Promise.all([
        getSddaTrialWorkspace(client, trialId),
        listSddaOfficialWorkbookRuns(client, trialId),
        listSddaGameScoringRuns(client, trialId),
      ]);
      let downloaded: Uint8Array;
      let source: string;
      let filename: string;
      if (workspace.workbook_storage_path) {
        const stored = await client.storage
          .from('sdda-workbooks')
          .download(workspace.workbook_storage_path);
        if (stored.error)
          throw new Error(`The pinned historical workbook could not be loaded: ${stored.error.message}`);
        downloaded = new Uint8Array(await stored.data.arrayBuffer());
        source = `private:sdda-workbooks/${workspace.workbook_storage_path}`;
        filename = workspace.workbook_filename || 'SDDA-TrialWorkbook.xlsx';
      } else {
        const templateResponse = await fetch(templatePath);
        if (!templateResponse.ok)
          throw new Error('The untouched official SDDA workbook template could not be loaded.');
        downloaded = new Uint8Array(await templateResponse.arrayBuffer());
        source = templateResponse.headers.get('x-sdda-source') || '';
        filename =
          templateResponse.headers.get('x-sdda-filename') || 'SDDA-TrialWorkbook.xlsx';
      }
      const checksum = await sha256(downloaded);
      if (workspace.workbook_storage_path && workspace.workbook_sha256 !== checksum)
        throw new Error('The stored historical workbook no longer matches its pinned checksum.');
      setTemplateBytes(downloaded);
      setTemplateMeta({
        source,
        filename,
        sha256: checksum,
      });
      setRegistryNumbers(officialWorkbookDogNumbers(downloaded));
      workspace.sdda_trial_days.sort((a, b) => a.day_number - b.day_number);
      const days = new Map(workspace.sdda_trial_days.map((day) => [day.id, day.day_number]));
      setTrial(workspace);
      setGameRuns(games);
      setRuns(
        records.map((record) => {
          const entry = first(record.sdda_entries);
          const dog = first(entry?.sdda_dogs);
          const score = first(record.sdda_scores);
          const offering = workspace.sdda_trial_offerings.find(
            (item) =>
              item.trial_day_id === record.trial_day_id &&
              item.level === record.level &&
              item.component === record.component &&
              item.stream === record.stream
          );
          const day = workspace.sdda_trial_days.find((item) => item.id === record.trial_day_id);
          return {
            dayNumber: days.get(record.trial_day_id) || 0,
            level: record.level,
            component: record.component,
            stream: record.stream,
            dogNumber: dog?.sdda_registration_number || '',
            runGroup: record.feo ? 'FEO' : record.run_group,
            result: score?.result,
            score: score?.score == null ? null : Number(score.score),
            timeSeconds: score?.time_seconds == null ? null : Number(score.time_seconds),
            entryStatus: entry?.entry_status || '',
            trialDayId: record.trial_day_id,
            trialNumber: offering?.sdda_trial_number || day?.sdda_trial_number || '',
          } as PreparedRun;
        })
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load official workbook data.');
    } finally {
      setLoading(false);
    }
  }, [trialId]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportGroups = useMemo(() => {
    if (!trial) return [];
    const groups = new Map<
      string,
      { day: SddaTrialWorkspace['sdda_trial_days'][number]; trialNumber: string }
    >();
    for (const day of trial.sdda_trial_days) {
      const numbers = new Set([
        ...trial.sdda_trial_offerings
          .filter((item) => item.trial_day_id === day.id)
          .map((item) => item.sdda_trial_number || day.sdda_trial_number || ''),
        ...trial.sdda_game_offerings
          .filter((item) => item.trial_day_id === day.id)
          .map((item) => item.sdda_trial_number || day.sdda_trial_number || ''),
      ]);
      if (!numbers.size) numbers.add(day.sdda_trial_number || '');
      for (const trialNumber of numbers)
        groups.set(`${day.id}|${trialNumber}`, { day, trialNumber });
    }
    return [...groups.values()];
  }, [trial]);
  const enteredRuns = useMemo(() => runs.filter((run) => run.entryStatus === 'entered'), [runs]);
  const excludedRuns = runs.length - enteredRuns.length;

  const groupInput = (index: number) => {
    if (!trial) return null;
    const group = exportGroups[index];
    const days = [group.day];
    const selectedDays = new Set([group.day.day_number]);
    const selectedNumber = group.trialNumber;
    return {
      days: days.map((day) => ({
        dayNumber: day.day_number,
        trialNumber: selectedNumber,
        trialDate: day.trial_date,
        judgeName: day.judge_name || undefined,
      })),
      venue: trial.venue || '',
      hostClub: trial.host_club || undefined,
      secretaryName: trial.secretary_name || undefined,
      trialEmail: trial.secretary_email || undefined,
      scentJudges: trial.sdda_trial_offerings.flatMap((offering) => {
        const dayNumber = trial.sdda_trial_days.find(
          (day) => day.id === offering.trial_day_id
        )?.day_number;
        const day = trial.sdda_trial_days.find((item) => item.id === offering.trial_day_id);
        if (
          !dayNumber ||
          !offering.judge_name?.trim() ||
          !selectedDays.has(dayNumber) ||
          (offering.sdda_trial_number || day?.sdda_trial_number || '') !== selectedNumber
        )
          return [];
        return [
          {
            dayNumber,
            level: offering.level,
            component: offering.component,
            judgeName: offering.judge_name.trim(),
          },
        ];
      }),
      gameJudges: trial.sdda_game_offerings.flatMap((offering) => {
        const dayNumber = trial.sdda_trial_days.find(
          (day) => day.id === offering.trial_day_id
        )?.day_number;
        const day = trial.sdda_trial_days.find((item) => item.id === offering.trial_day_id);
        if (
          !dayNumber ||
          !offering.judge_name?.trim() ||
          !selectedDays.has(dayNumber) ||
          (offering.sdda_trial_number || day?.sdda_trial_number || '') !== selectedNumber
        )
          return [];
        return [{ dayNumber, gameType: offering.game_type, judgeName: offering.judge_name.trim() }];
      }),
      runs: enteredRuns.filter(
        (run) => selectedDays.has(run.dayNumber) && run.trialNumber === selectedNumber
      ),
      gameRuns: gameRuns.flatMap((record) => {
        const entry = first(record.sdda_entries);
        const dog = first(entry?.sdda_dogs);
        const score = first(record.sdda_game_scores);
        const offering = first(record.sdda_game_offerings);
        const dayNumber =
          trial.sdda_trial_days.find((day) => day.id === record.trial_day_id)?.day_number || 0;
        const configured = trial.sdda_game_offerings.find((item) => item.id === record.offering_id);
        const number =
          configured?.sdda_trial_number ||
          trial.sdda_trial_days.find((day) => day.id === record.trial_day_id)?.sdda_trial_number ||
          '';
        if (
          !offering ||
          entry?.confirmation_status !== 'accepted' ||
          !selectedDays.has(dayNumber) ||
          number !== selectedNumber
        )
          return [];
        return [
          {
            dayNumber,
            gameType: offering.game_type,
            dogNumber: dog?.sdda_registration_number || '',
            entryType: record.entry_type,
            result: score?.result,
            timeSeconds: score?.time_seconds == null ? null : Number(score.time_seconds),
            runningPosition: record.running_position,
          },
        ];
      }),
    };
  };

  const exportGroup = async (index: number) => {
    if (!trial || !templateBytes || !templateMeta) return;
    const input = groupInput(index);
    if (!input) return;
    try {
      setExporting(index);
      setError(null);
      if (!trial.workbook_sha256)
        throw new Error('Pin the official workbook version to this trial before exporting.');
      if (trial.workbook_sha256 !== templateMeta.sha256)
        throw new Error(
          'SDDA has published a different workbook since this trial was pinned. Review it and deliberately refresh the pinned version before exporting.'
        );
      const issues = reviewOfficialSddaWorkbook(input, registryNumbers || undefined);
      if (issues.some((issue) => issue.severity === 'blocker'))
        throw new Error('Resolve the workbook blockers shown on this page before exporting.');
      const bytes = buildOfficialSddaWorkbook(templateBytes, input);
      const blob = new Blob(
        [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
        {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${safeName(trial.name)}-official-SDDA-workbook-trial-${safeName(exportGroups[index].trialNumber || 'number-pending')}.xlsx`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to export the official SDDA workbook.'
      );
    } finally {
      setExporting(null);
    }
  };

  const pinWorkbook = async (proofed: boolean) => {
    if (!trial || !templateMeta) return;
    if (
      !window.confirm(
        proofed
          ? 'Confirm that you opened and proofed this workbook version in desktop Excel?'
          : 'Pin this official workbook version to the trial?'
      )
    )
      return;
    try {
      setError(null);
      await pinSddaWorkbook(getSupabaseBrowser(), {
        trialId,
        sourceUrl: templateMeta.source,
        filename: templateMeta.filename,
        sha256: templateMeta.sha256,
        proofed,
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to pin the workbook.');
    }
  };

  const uploadHistoricalWorkbook = async (file: File) => {
    if (!trial) return;
    try {
      setUploading(true);
      setError(null);
      if (!/\.xlsx$/i.test(file.name)) throw new Error('Choose an SDDA .xlsx workbook.');
      if (file.size > 20 * 1024 * 1024)
        throw new Error('The workbook is larger than the 20 MB private-storage limit.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      try {
        officialWorkbookDogNumbers(bytes);
      } catch {
        throw new Error(
          'This file is not a compatible official SDDA workbook. Its SDDA Dogs sheet could not be read.'
        );
      }
      const checksum = await sha256(bytes);
      const storagePath = `${trialId}/${checksum}.xlsx`;
      const client = getSupabaseBrowser();
      const uploaded = await client.storage.from('sdda-workbooks').upload(storagePath, file, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });
      if (uploaded.error) throw new Error(uploaded.error.message);
      await pinUploadedSddaWorkbook(client, {
        trialId,
        filename: file.name,
        sha256: checksum,
        storagePath,
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to upload the workbook.');
    } finally {
      setUploading(false);
    }
  };

  const switchToCurrentWorkbook = async () => {
    if (!trial) return;
    try {
      setUploading(true);
      setError(null);
      const response = await fetch(templatePath, { cache: 'no-store' });
      if (!response.ok) throw new Error('The current official workbook could not be downloaded.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      await pinSddaWorkbook(getSupabaseBrowser(), {
        trialId,
        sourceUrl: response.headers.get('x-sdda-source') || '',
        filename: response.headers.get('x-sdda-filename') || 'SDDA-TrialWorkbook.xlsx',
        sha256: await sha256(bytes),
        proofed: false,
      });
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to switch to the current workbook.'
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <MainLayout
      title="Official SDDA workbook"
      breadcrumbItems={[
        { label: 'Trials', href: '/dashboard/trials' },
        { label: trial?.name || 'Trial', href: `/dashboard/trials/${trialId}` },
        { label: 'Official workbook' },
      ]}
    >
      <div className="mx-auto max-w-5xl space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileSpreadsheet className="mr-2 h-5 w-5" />
              SDDA Trial Results Workbook
            </CardTitle>
            <CardDescription>
              Pin one official workbook version to this trial, then use that exact version for every
              export. If SDDA publishes a replacement, TrialDesk stops the export until you
              deliberately review and refresh the pin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{enteredRuns.length} entered scent runs</Badge>
              <Badge variant="outline">{gameRuns.length} Games runs</Badge>
              {excludedRuns > 0 && (
                <Badge variant="outline">{excludedRuns} waitlisted/withdrawn runs excluded</Badge>
              )}
            </div>
            {templateMeta && (
              <div className="rounded-md border bg-slate-50 p-3 text-sm">
                <strong>
                  {trial?.workbook_storage_path ? 'Pinned historical file:' : 'Current SDDA file:'}
                </strong>{' '}
                {templateMeta.filename}
                <br />
                <span className="font-mono text-xs">SHA-256 {templateMeta.sha256}</span>
              </div>
            )}
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
              <p className="font-semibold text-[#294f73]">Use an earlier official workbook</p>
              <p className="mt-1 text-sm text-slate-700">
                Upload the untouched SDDA workbook originally downloaded for this trial. TrialDesk
                stores it privately, pins its checksum, and uses that exact file for future exports.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center rounded-md border border-[#294f73] bg-white px-4 py-2 text-sm font-semibold text-[#294f73] hover:bg-slate-50">
                  {uploading ? (
                    <PawLoader className="mr-2 h-4 w-4" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Upload and pin workbook
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void uploadHistoricalWorkbook(file);
                    }}
                  />
                </label>
                {trial?.workbook_storage_path && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploading}
                    onClick={() => void switchToCurrentWorkbook()}
                  >
                    Use current SDDA workbook instead
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => void pinWorkbook(false)}
                disabled={!templateMeta}
              >
                <Pin className="mr-2 h-4 w-4" />
                {trial?.workbook_sha256 ? 'Refresh pinned version' : 'Pin this version'}
              </Button>
              <Button
                variant="outline"
                onClick={() => void pinWorkbook(true)}
                disabled={!trial?.workbook_sha256 || trial.workbook_sha256 !== templateMeta?.sha256}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Confirm opened and proofed in Excel
              </Button>
            </div>
            {trial?.workbook_sha256 && (
              <p className="text-sm text-[#475569]">
                Pinned: <strong>{trial.workbook_filename}</strong> on{' '}
                {trial.workbook_pinned_at
                  ? new Date(trial.workbook_pinned_at).toLocaleString()
                  : 'unknown date'}{' '}
                ·{' '}
                {trial.workbook_proofed_at
                  ? `Proofed ${new Date(trial.workbook_proofed_at).toLocaleString()}`
                  : 'Desktop Excel proof still required'}
              </p>
            )}
          </CardContent>
        </Card>
        <Alert>
          <AlertDescription>
            Open the downloaded workbook in desktop Microsoft Excel so its original formulas
            recalculate. Every Scent NQ is exported with a numeric zero score; a recorded time is
            preserved and an unrecorded time remains blank. Review the official Summary and results
            before submission. SDDA Games sheets are preserved exactly and use their dedicated Games
            entry and scoring workflow.
          </AlertDescription>
        </Alert>
        {loading ? (
          <div className="flex justify-center py-16">
            <PawLoader className="h-8 w-8" />
          </div>
        ) : (
          exportGroups.map((group, index) => {
            const count = enteredRuns.filter(
              (run) =>
                run.dayNumber === group.day.day_number && run.trialNumber === group.trialNumber
            ).length;
            const input = groupInput(index);
            const issues = input
              ? reviewOfficialSddaWorkbook(input, registryNumbers || undefined)
              : [];
            const blockers = issues.filter((issue) => issue.severity === 'blocker');
            const workbookReady = Boolean(
              trial?.workbook_sha256 &&
              trial.workbook_sha256 === templateMeta?.sha256 &&
              trial.workbook_proofed_at
            );
            return (
              <Card key={`${group.day.id}|${group.trialNumber}`}>
                <CardHeader>
                  <CardTitle>Trial {group.trialNumber || 'number pending'}</CardTitle>
                  <CardDescription>
                    Day {group.day.day_number} · {group.day.trial_date}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={() => void exportGroup(index)}
                      disabled={
                        exporting !== null ||
                        !workbookReady ||
                        count + (input?.gameRuns?.length || 0) === 0 ||
                        blockers.length > 0
                      }
                    >
                      {exporting === index ? (
                        <PawLoader className="mr-2 h-4 w-4" />
                      ) : (
                        <Download className="mr-2 h-4 w-4" />
                      )}
                      Export official workbook
                    </Button>
                    <Badge variant="outline">{count} Scent runs</Badge>
                    <Badge variant="outline">{input?.gameRuns?.length || 0} Games runs</Badge>
                  </div>
                  {!workbookReady && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Pin the current official file and confirm it was proofed in desktop Excel
                      before exporting.
                    </div>
                  )}
                  {issues.length > 0 ? (
                    <div className="space-y-2">
                      {issues.map((issue) => (
                        <div
                          key={issue.message}
                          className={`rounded-md border px-3 py-2 text-sm ${issue.severity === 'blocker' ? 'border-red-300 bg-red-50 text-red-900' : 'border-sky-300 bg-sky-50 text-sky-900'}`}
                        >
                          <strong>
                            {issue.severity === 'blocker' ? 'Required: ' : 'Review: '}
                          </strong>
                          {issue.message}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                      Workbook data checks passed.
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </MainLayout>
  );
}
