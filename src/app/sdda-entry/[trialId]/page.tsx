'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { createEntryReceiptPdf } from '@/lib/sdda/entryReceiptPdf';
type Day = { id: string; day_number: number; trial_date: string };
type Offer = { id: string; trial_day_id: string; level: string; component: string; stream: string };
type Choice = {
  key: string;
  trial_day_id: string;
  level: string;
  component: string;
  offerings: Offer[];
};
type GameOffer = {
  id: string;
  trial_day_id: string;
  game_type: 'Aerial' | 'Distance' | 'Speed' | 'Team';
  entry_fee_cents: number;
  feo_fee_cents: number;
};
type Setup = {
  name: string;
  host_club: string;
  venue?: string;
  trial_format: 'scent' | 'games' | 'combined';
  payment_instructions?: string;
  cancellation_policy?: string;
  days: Day[];
  offerings: Offer[];
  game_offerings: GameOffer[];
};
type EditData = typeof empty & {
  entry_id: string;
  confirmation_code: string;
  confirmation_status: string;
  can_edit: boolean;
  setup?: Setup;
  runs: Array<{ offering_id: string; run_group: string }>;
  game_runs: Array<{
    offering_id: string;
    entry_type: 'Regular' | 'FEO';
    team_partner_name?: string;
    aerial_division?: 'High' | 'Highfly';
  }>;
};
const box = 'rounded-2xl border border-[#d9d8cf] bg-[#fffdf7] p-5 shadow-sm';
const field = 'w-full rounded-lg border border-[#bfc8c1] bg-white px-3 py-2';
const levelOrder = ['Started', 'Advanced', 'Excellent', 'Elite'];
const runGroups = ['Regular', 'Official', 'Second dog', 'FEO', 'BIS'] as const;
const empty = {
  handler_name: '',
  handler_email: '',
  handler_phone: '',
  handler_address: '',
  participant_number: '',
  dog_call_name: '',
  dog_registered_name: '',
  dog_registration_number: '',
  registration_pending: false,
  breed: '',
  formal_alerts: '',
  title_watch_note: '',
  reported_advanced_gold_count: 0,
  reported_excellent_gold_count: 0,
  reported_elite_gold_count: 0,
  reported_gold_acknowledged: false,
  reactivity: 'None',
  waiver_accepted: false,
};
export default function Page() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const searchParams = useSearchParams();
  const entryCode = searchParams.get('code') || '';
  const receiptToken = searchParams.get('token') || '';
  const secretaryEntryId = searchParams.get('secretaryEntry') || '';
  const [setup, setSetup] = useState<Setup>();
  const [form, setForm] = useState(empty);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [gameChosen, setGameChosen] = useState<Set<string>>(new Set());
  const [gameEntryType, setGameEntryType] = useState<Record<string, 'Regular' | 'FEO'>>({});
  const [teamPartner, setTeamPartner] = useState<Record<string, string>>({});
  const [aerialDivision, setAerialDivision] = useState<Record<string, 'High' | 'Highfly'>>({});
  const [runGroup, setRunGroup] = useState<Record<string, string>>({});
  const [runStream, setRunStream] = useState<Record<string, string>>({});
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [canEdit, setCanEdit] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);
  const [receipt, setReceipt] = useState<{
    confirmation_code: string;
    receipt_token: string;
  } | null>(null);
  useEffect(() => {
    const client = getSupabaseBrowser();
    if (secretaryEntryId) {
      void Promise.all([
        client
          .from('sdda_trials')
          .select(
            'name,host_club,venue,trial_format,sdda_trial_days(id,day_number,trial_date),sdda_trial_offerings(id,trial_day_id,level,component,stream),sdda_game_offerings(id,trial_day_id,game_type,entry_fee_cents,feo_fee_cents)'
          )
          .eq('id', trialId)
          .single(),
        client.rpc('sdda_secretary_entry_for_edit', { target_entry_id: secretaryEntryId }),
      ]).then(([setupResult, editResult]) => {
        if (setupResult.error || editResult.error)
          return setError(
            setupResult.error?.message || editResult.error?.message || 'Unable to edit entry.'
          );
        const row = setupResult.data as any;
        const loadedSetup = {
          ...row,
          days: row.sdda_trial_days || [],
          offerings: row.sdda_trial_offerings || [],
          game_offerings: row.sdda_game_offerings || [],
        } as Setup;
        setSetup(loadedSetup);
        hydrateEdit(editResult.data as EditData, true, loadedSetup);
      });
      return;
    }
    if (entryCode && receiptToken) {
      void client
        .rpc('sdda_public_entry_for_edit', {
          entry_code: entryCode,
          receipt_token: receiptToken,
        })
        .then(({ data, error }) => {
          if (error) return setError(error.message);
          const editData = data as EditData;
          if (!editData.setup) return setError('Entry setup could not be loaded.');
          setSetup(editData.setup);
          hydrateEdit(editData, false, editData.setup);
        });
      return;
    }
    void client
      .rpc('sdda_public_trial_entry_setup', { target_trial_id: trialId })
      .then(({ data, error }) => (error ? setError(error.message) : setSetup(data as Setup)));
    // The identifiers are fixed for the lifetime of this entry page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trialId, secretaryEntryId, entryCode, receiptToken]);

  function hydrateEdit(data: EditData, secretary: boolean, activeSetup: Setup) {
    setForm({
      ...empty,
      ...Object.fromEntries(
        Object.keys(empty).map((key) => [key, (data as any)[key] ?? (empty as any)[key]])
      ),
      waiver_accepted: true,
    });
    const scentSelections = data.runs.map((run) => {
      const offering = activeSetup.offerings.find((item) => item.id === run.offering_id)!;
      return {
        key: `${offering.trial_day_id}|${offering.level}|${offering.component}`,
        offering,
        run,
      };
    });
    setChosen(new Set(scentSelections.map((item) => item.key)));
    setRunGroup(Object.fromEntries(scentSelections.map((item) => [item.key, item.run.run_group])));
    setRunStream(
      Object.fromEntries(scentSelections.map((item) => [item.key, item.offering.stream]))
    );
    setGameChosen(new Set(data.game_runs.map((run) => run.offering_id)));
    setGameEntryType(
      Object.fromEntries(data.game_runs.map((run) => [run.offering_id, run.entry_type]))
    );
    setTeamPartner(
      Object.fromEntries(
        data.game_runs.map((run) => [run.offering_id, run.team_partner_name || ''])
      )
    );
    setAerialDivision(
      Object.fromEntries(
        data.game_runs
          .filter((run) => run.aerial_division)
          .map((run) => [run.offering_id, run.aerial_division!])
      )
    );
    setReceipt(
      secretary ? null : { confirmation_code: data.confirmation_code, receipt_token: receiptToken }
    );
    setCanEdit(data.can_edit);
    setEditing(secretary);
  }
  const choices = useMemo(() => {
    const grouped = new Map<string, Choice>();
    for (const o of setup?.offerings || []) {
      const key = `${o.trial_day_id}|${o.level}|${o.component}`;
      const current = grouped.get(key);
      if (current) current.offerings.push(o);
      else
        grouped.set(key, {
          key,
          trial_day_id: o.trial_day_id,
          level: o.level,
          component: o.component,
          offerings: [o],
        });
    }
    return [...grouped.values()];
  }, [setup]);
  const configuredGameFeesCents = useMemo(() => (setup?.game_offerings || [])
    .filter((game) => gameChosen.has(game.id))
    .reduce((total, game) => total + ((gameEntryType[game.id] || 'Regular') === 'FEO' ? game.feo_fee_cents : game.entry_fee_cents), 0), [setup, gameChosen, gameEntryType]);
  const money = (cents: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
  const set = (key: string, value: string | boolean | number) => setForm((v) => ({ ...v, [key]: value }));
  const toggle = (key: string) =>
    setChosen((v) => {
      const n = new Set(v);
      n.has(key) ? n.delete(key) : n.add(key);
      if (!n.has(key)) {
        setRunGroup((g) => {
          const copy = { ...g };
          delete copy[key];
          return copy;
        });
        setRunStream((g) => {
          const copy = { ...g };
          delete copy[key];
          return copy;
        });
      }
      return n;
    });
  function advance() {
    setError('');
    if (
      step === 1 &&
      (!form.handler_name ||
        !form.handler_email.includes('@') ||
        !form.dog_call_name ||
        !form.breed.trim() ||
        (!form.registration_pending && !form.dog_registration_number))
    )
      return setError('Complete the required competitor and dog information.');
    if (step === 2 && !chosen.size && !gameChosen.size)
      return setError('Select at least one offered Scent component or Game.');
    if (
      step === 2 &&
      setup?.game_offerings.some(
        (g) => gameChosen.has(g.id) && g.game_type === 'Team' && !teamPartner[g.id]?.trim()
      )
    )
      return setError('Enter the requested partner name for every Team entry.');
    if (
      step === 2 &&
      setup?.game_offerings.some(
        (g) => gameChosen.has(g.id) && g.game_type === 'Aerial' && !aerialDivision[g.id]
      )
    )
      return setError('Choose High or Highfly for every Aerial entry.');
    if (step === 3 && !form.waiver_accepted)
      return setError('Accept the acknowledgement before reviewing.');
    if (
      step === 3 &&
      (form.reported_advanced_gold_count > 0 ||
        form.reported_excellent_gold_count > 0 ||
        form.reported_elite_gold_count > 0) &&
      !form.reported_gold_acknowledged
    )
      return setError('Acknowledge that the Gold counts are copied from the competitor’s SDDA records.');
    setStep((s) => s + 1);
    scrollTo(0, 0);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const selected = choices.filter((c) => chosen.has(c.key));
    const unavailable = selected.find(
      (c) =>
        c.level !== 'Elite' &&
        !c.offerings.some((o) => o.stream === (runStream[c.key] || 'Amateur'))
    );
    if (unavailable)
      return setError(
        `The ${unavailable.level} ${unavailable.component} ${runStream[unavailable.key] || 'Amateur'} offering is unavailable.`
      );
    const runs = selected.map((choice) => {
      const offering =
        choice.level === 'Elite'
          ? choice.offerings[0]
          : choice.offerings.find((o) => o.stream === (runStream[choice.key] || 'Amateur'))!;
      return { offering_id: offering.id, run_group: runGroup[choice.key] || 'Regular' };
    });
    const game_runs = (setup?.game_offerings || [])
      .filter((game) => gameChosen.has(game.id))
      .map((game) => ({
        offering_id: game.id,
        entry_type: gameEntryType[game.id] || 'Regular',
        team_partner_name: game.game_type === 'Team' ? teamPartner[game.id]?.trim() : undefined,
        aerial_division: game.game_type === 'Aerial' ? aerialDivision[game.id] : undefined,
      }));
    setBusy(true);
    const submission = { ...form, runs, game_runs };
    const client = getSupabaseBrowser();
    const { data, error } = secretaryEntryId
      ? await client.rpc('sdda_update_entry_as_secretary', {
          target_entry_id: secretaryEntryId,
          submission,
        })
      : editing
        ? await client.rpc('sdda_update_public_entry', {
            entry_code: receipt?.confirmation_code || entryCode,
            receipt_token: receipt?.receipt_token || receiptToken,
            submission,
          })
        : await client.rpc('sdda_submit_public_entry_v2', {
            target_trial_id: trialId,
            submission,
          });
    setBusy(false);
    if (error) return setError(error.message);
    const r = data as { confirmation_code: string; receipt_token?: string };
    const token = r.receipt_token || receipt?.receipt_token || receiptToken;
    const { error: goldError } = await client.rpc('sdda_set_reported_gold_snapshot', {
      target_entry_id: secretaryEntryId || null,
      entry_code: secretaryEntryId ? null : r.confirmation_code,
      receipt_token: secretaryEntryId ? null : token,
      advanced_count: form.reported_advanced_gold_count,
      excellent_count: form.reported_excellent_gold_count,
      elite_count: form.reported_elite_gold_count,
      acknowledged: form.reported_gold_acknowledged,
    });
    if (goldError) return setError(`The entry was saved, but its reported Gold snapshot was not: ${goldError.message}`);
    if (secretaryEntryId) {
      window.location.href = `/dashboard/trials/${trialId}/entries`;
      return;
    }
    setReceipt({ confirmation_code: r.confirmation_code, receipt_token: token });
    setEditing(false);
    localStorage.setItem(
      `sdda-receipt-${r.confirmation_code}`,
      JSON.stringify({ confirmation_code: r.confirmation_code, receipt_token: token, trialId })
    );
    window.history.replaceState(
      null,
      '',
      `/sdda-entry/${trialId}?code=${encodeURIComponent(r.confirmation_code)}&token=${encodeURIComponent(token)}`
    );
    scrollTo(0, 0);
  }
  function selectionLabels() {
    if (!setup) return [];
    const selections = choices
      .filter((c) => chosen.has(c.key))
      .map(
        (c) =>
          `Day ${setup.days.find((d) => d.id === c.trial_day_id)?.day_number || '?'} - ${c.level} - ${c.component}${c.level === 'Elite' ? '' : ` - ${runStream[c.key] || 'Amateur'}`} - ${runGroup[c.key] || 'Regular'}`
      );
    selections.push(
      ...setup.game_offerings
        .filter((g) => gameChosen.has(g.id))
        .map(
          (g) =>
            `Day ${setup.days.find((d) => d.id === g.trial_day_id)?.day_number || '?'} - ${g.game_type}${g.game_type === 'Aerial' ? ` - ${aerialDivision[g.id] || 'category pending'}` : ''} - ${gameEntryType[g.id] || 'Regular'}${g.game_type === 'Team' ? ` - Partner: ${teamPartner[g.id]}` : ''}`
        )
    );
    return selections;
  }
  async function downloadReceipt() {
    if (!receipt || !setup) return;
    const selections = selectionLabels();
    const totalRuns = chosen.size + gameChosen.size;
    const bytes = await createEntryReceiptPdf({
      confirmationCode: receipt.confirmation_code,
      trialName: setup.name,
      handlerName: form.handler_name,
      dogName: form.dog_call_name,
      runCount: totalRuns,
      selections,
      privateEditUrl: `${window.location.origin}/sdda-entry/${trialId}?code=${encodeURIComponent(receipt.confirmation_code)}&token=${encodeURIComponent(receipt.receipt_token)}`,
      amountOwingCents: configuredGameFeesCents,
      amountLabel: chosen.size ? 'Configured Games fees' : 'Amount owing',
    });
    const blob = new Blob([Uint8Array.from(bytes).buffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${receipt.confirmation_code}-entry-receipt.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (receipt)
    return (
      <Shell title="Entry received" subtitle={setup?.name}>
        <section className={box}>
          <small className="font-bold uppercase">Confirmation number</small>
          <p className="my-2 font-mono text-3xl font-bold text-[#225f45]">
            {receipt.confirmation_code}
          </p>
          <div className="my-5 rounded-xl border border-[#d4b778] bg-[#fff5d8] p-4">
            <b>Received—not yet accepted.</b>
            <p>
              The secretary must confirm your entry and payment instructions. Keep this receipt.
            </p>
          </div>
          {canEdit && <div className="my-5 rounded-xl border-2 border-[#b98935] bg-white p-4"><b>Save your private edit link</b><p className="mt-1 text-sm">This is the only self-service way to return and change the entry. The confirmation number or SDDA number alone cannot unlock it.</p><p className="mt-3 break-all rounded bg-[#f7f8f4] p-3 font-mono text-xs">{typeof window !== 'undefined' ? window.location.href : ''}</p><p className="mt-2 text-sm font-semibold text-[#7a5718]">Keep it confidential. Anyone with this link can edit the entry until it is accepted or entries close.</p></div>}
          <p>
            {form.handler_name} with {form.dog_call_name} · {chosen.size + gameChosen.size} runs
            requested
          </p>
          {gameChosen.size > 0 && <div className="mt-4 rounded-xl border border-[#b9ceb9] bg-[#edf6ef] p-4"><small className="font-bold uppercase text-[#526057]">{chosen.size ? 'Configured Games fees' : 'Amount owing'}</small><p className="text-3xl font-bold text-[#225f45]">{money(configuredGameFeesCents)}</p>{chosen.size > 0 && <p className="mt-1 text-sm text-gray-600">Scent fees are not configured in TrialDesk yet and must be added by the secretary.</p>}</div>}
          <div className="mt-4 rounded-xl border bg-white p-4">
            <h2 className="mb-2 font-bold">Selections received</h2>
            <ul className="list-disc space-y-1 pl-5">
              {selectionLabels().map((selection) => (
                <li key={selection}>{selection}</li>
              ))}
            </ul>
          </div>
          <div className="mt-5 flex flex-wrap gap-3 print:hidden">
            <button
              type="button"
              className="rounded-lg border border-[#225f45] bg-white px-5 py-3 font-bold text-[#225f45]"
              onClick={() => window.print()}
            >
              Print receipt
            </button>
            <button
              type="button"
              className="rounded-lg bg-[#225f45] px-5 py-3 font-bold text-white"
              onClick={() => void downloadReceipt()}
            >
              Download receipt PDF
            </button>
            {canEdit && (
              <>
                <button
                  type="button"
                  className="rounded-lg border border-[#225f45] bg-white px-5 py-3 font-bold text-[#225f45]"
                  onClick={() => {
                    setReceipt(null);
                    setEditing(true);
                    setStep(1);
                  }}
                >
                  Edit entry
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[#225f45] bg-white px-5 py-3 font-bold text-[#225f45]"
                  onClick={async () => {
                    await navigator.clipboard.writeText(window.location.href);
                    setLinkCopied(true);
                  }}
                >
                  {linkCopied ? 'Private link copied' : 'Copy private entry link'}
                </button>
              </>
            )}
          </div>
        </section>
      </Shell>
    );
  return (
    <Shell
      title={setup?.name || 'SDDA trial entry'}
      subtitle={setup && `${setup.host_club}${setup.venue ? ` • ${setup.venue}` : ''}`}
    >
      <div className="mb-4 grid grid-cols-4 gap-2 text-center text-xs font-bold">
        {['Competitor & dog', 'Runs', 'Policies', 'Review'].map((x, i) => (
          <div
            className={`rounded-lg p-3 ${step === i + 1 ? 'bg-[#b98935] text-white' : 'bg-white'}`}
            key={x}
          >
            {i + 1}. {x}
          </div>
        ))}
      </div>
      {error && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      )}
      {!setup && !error && <section className={box}>Loading entry form…</section>}
      {setup && (
        <form onSubmit={submit}>
          {step === 1 && (
            <div className="space-y-4">
              <Section title="Competitor information">
                <Grid>
                  <F label="Name *">
                    <input
                      className={field}
                      value={form.handler_name}
                      onChange={(e) => set('handler_name', e.target.value)}
                    />
                  </F>
                  <F label="Email *">
                    <input
                      type="email"
                      className={field}
                      value={form.handler_email}
                      onChange={(e) => set('handler_email', e.target.value)}
                    />
                  </F>
                  <F label="Phone">
                    <input
                      className={field}
                      value={form.handler_phone}
                      onChange={(e) => set('handler_phone', e.target.value)}
                    />
                  </F>
                  <F label="Registered participant number">
                    <input
                      className={field}
                      value={form.participant_number}
                      onChange={(e) => set('participant_number', e.target.value)}
                    />
                  </F>
                  <F label="Mailing address">
                    <textarea
                      className={field}
                      value={form.handler_address}
                      onChange={(e) => set('handler_address', e.target.value)}
                    />
                  </F>
                </Grid>
              </Section>
              <Section title="Dog information">
                <Grid>
                  <F label="Dog call name *">
                    <input
                      className={field}
                      value={form.dog_call_name}
                      onChange={(e) => set('dog_call_name', e.target.value)}
                    />
                  </F>
                  <F label="Registered name">
                    <input
                      className={field}
                      value={form.dog_registered_name}
                      onChange={(e) => set('dog_registered_name', e.target.value)}
                    />
                  </F>
                  <F label="SDDA registration number *">
                    <input
                      disabled={form.registration_pending}
                      className={field}
                      value={form.dog_registration_number}
                      onChange={(e) => set('dog_registration_number', e.target.value)}
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={form.registration_pending}
                        onChange={(e) => set('registration_pending', e.target.checked)}
                      />{' '}
                      Registration pending
                    </label>
                  </F>
                  <F label="Breed (Mixed Breed put All Canadian) *">
                    <input
                      required
                      className={field}
                      value={form.breed}
                      onChange={(e) => set('breed', e.target.value)}
                    />
                  </F>
                </Grid>
              </Section>
            </div>
          )}
          {step === 2 && (
            <Section title="Choose offered runs">
              <p className="mb-5 text-sm text-[#68736c]">
                Select each Scent component or Game requested. The secretary will confirm
                availability and capacity.
              </p>
              {setup.days.map((d) => (
                <div className="mb-7" key={d.id}>
                  <h3 className="border-b pb-2 font-serif text-2xl">
                    Day {d.day_number} · {d.trial_date}
                  </h3>
                  {choices.some((c) => c.trial_day_id === d.id) && (
                    <div className="mt-4">
                      <h4 className="font-bold text-[#225f45]">Scent classes</h4>
                      <p className="mb-3 text-sm">
                        Choose Amateur or Working separately for each component. Instructors and
                        professionals must choose Working. Elite has no stream.
                      </p>
                      {[
                        ...new Set(
                          choices.filter((c) => c.trial_day_id === d.id).map((c) => c.level)
                        ),
                      ]
                        .sort((a, b) => levelOrder.indexOf(a) - levelOrder.indexOf(b))
                        .map((level) => (
                          <div className="mt-3" key={level}>
                            <b>
                              {level}
                              {level === 'Elite' ? ' (no stream)' : ''}
                            </b>
                            <div className="mt-2 grid gap-2 sm:grid-cols-3">
                              {choices
                                .filter((c) => c.trial_day_id === d.id && c.level === level)
                                .map((c) => (
                                  <div className="rounded-lg border bg-white p-3" key={c.key}>
                                    <label className="flex items-center gap-3 font-semibold">
                                      <input
                                        type="checkbox"
                                        checked={chosen.has(c.key)}
                                        onChange={() => toggle(c.key)}
                                      />
                                      {c.component}
                                    </label>
                                    {chosen.has(c.key) && (
                                      <div className="mt-3 space-y-3">
                                        {c.level !== 'Elite' && (
                                          <label className="block rounded-lg border border-[#b98935] bg-[#fff9e9] p-2">
                                            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#76591f]">
                                              Stream — choose one
                                            </span>
                                            <select
                                              aria-label={`${c.component} stream`}
                                              className={field}
                                              value={runStream[c.key] || 'Amateur'}
                                              onChange={(e) =>
                                                setRunStream((s) => ({
                                                  ...s,
                                                  [c.key]: e.target.value,
                                                }))
                                              }
                                            >
                                              {['Amateur', 'Working']
                                                .filter((stream) =>
                                                  c.offerings.some((o) => o.stream === stream)
                                                )
                                                .map((stream) => (
                                                  <option key={stream}>{stream}</option>
                                                ))}
                                            </select>
                                          </label>
                                        )}
                                        <label className="block rounded-lg border border-[#9eb7aa] bg-[#f1f7f3] p-2">
                                          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#225f45]">
                                            Running-order placement
                                          </span>
                                          <select
                                            aria-label={`${c.component} running-order request`}
                                            className={field}
                                            value={runGroup[c.key] || 'Regular'}
                                            onChange={(e) =>
                                              setRunGroup((g) => ({
                                                ...g,
                                                [c.key]: e.target.value,
                                              }))
                                            }
                                          >
                                            {runGroups.map((group) => (
                                              <option key={group} value={group}>
                                                {group === 'Regular'
                                                  ? 'Regular running order'
                                                  : group}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                      </div>
                                    )}
                                  </div>
                                ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                  {setup.game_offerings.some((g) => g.trial_day_id === d.id) && (
                    <div className="mt-6">
                      <h4 className="font-bold text-[#225f45]">SDDA Games</h4>
                      <p className="mb-3 text-sm">
                        Choose Regular or For Exhibition Only (FEO) separately for every Game.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {setup.game_offerings
                          .filter((g) => g.trial_day_id === d.id)
                          .map((g) => (
                            <div className="rounded-lg border bg-white p-3" key={g.id}>
                              <label className="flex items-center gap-3 font-semibold">
                                <input
                                  type="checkbox"
                                  checked={gameChosen.has(g.id)}
                                  onChange={() =>
                                    setGameChosen((current) => {
                                      const next = new Set(current);
                                      next.has(g.id) ? next.delete(g.id) : next.add(g.id);
                                      return next;
                                    })
                                  }
                                />
                                {g.game_type}
                              </label>
                              {gameChosen.has(g.id) && (
                                <div className="mt-3 space-y-3">
                                  <label className="block">
                                    <span className="mb-1 block text-xs font-bold uppercase">
                                      Entry type
                                    </span>
                                    <select
                                      className={field}
                                      value={gameEntryType[g.id] || 'Regular'}
                                      onChange={(e) =>
                                        setGameEntryType((current) => ({
                                          ...current,
                                          [g.id]: e.target.value as 'Regular' | 'FEO',
                                        }))
                                      }
                                    >
                                      <option value="Regular">
                                        Regular · ${(g.entry_fee_cents / 100).toFixed(2)}
                                      </option>
                                      <option value="FEO">
                                        FEO · ${(g.feo_fee_cents / 100).toFixed(2)}
                                      </option>
                                    </select>
                                  </label>
                                  {g.game_type === 'Aerial' && (
                                    <label className="block rounded-lg border border-[#b98935] bg-[#fff9e9] p-2">
                                      <span className="mb-1 block text-xs font-bold uppercase">
                                        Aerial category — choose one *
                                      </span>
                                      <select
                                        className={field}
                                        value={aerialDivision[g.id] || ''}
                                        onChange={(e) =>
                                          setAerialDivision((current) => ({
                                            ...current,
                                            [g.id]: e.target.value as 'High' | 'Highfly',
                                          }))
                                        }
                                      >
                                        <option value="">Select High or Highfly</option>
                                        <option value="High">High</option>
                                        <option value="Highfly">Highfly</option>
                                      </select>
                                      <small className="mt-1 block text-[#76591f]">
                                        High is for small (under 15&quot;), elderly, or disabled
                                        dogs. Highfly is for larger dogs or additional challenge.
                                      </small>
                                    </label>
                                  )}
                                  {g.game_type === 'Team' && (
                                    <label className="block">
                                      <span className="mb-1 block text-xs font-bold uppercase">
                                        Requested Team partner *
                                      </span>
                                      <input
                                        className={field}
                                        value={teamPartner[g.id] || ''}
                                        onChange={(e) =>
                                          setTeamPartner((current) => ({
                                            ...current,
                                            [g.id]: e.target.value,
                                          }))
                                        }
                                      />
                                    </label>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </Section>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <Section title="Safety and title notes">
                <Grid>
                  <F label="Formal alert(s) — Started teams leave blank">
                    <textarea
                      className={field}
                      value={form.formal_alerts}
                      onChange={(e) => set('formal_alerts', e.target.value)}
                    />
                  </F>
                  <F label="Championship title watch">
                    <textarea
                      className={field}
                      value={form.title_watch_note}
                      onChange={(e) => set('title_watch_note', e.target.value)}
                    />
                  </F>
                  <div className="md:col-span-2 rounded-xl border border-[#d4b778] bg-[#fffaf0] p-4">
                    <p className="font-bold">Competitor-reported Gold scores</p>
                    <p className="mt-1 text-sm text-gray-600">Optional. Copy the current counts from the dog’s SDDA account. These are advisory and are not verified by TrialDesk or SDDA.</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {[
                        ['Advanced', 'reported_advanced_gold_count'],
                        ['Excellent', 'reported_excellent_gold_count'],
                        ['Elite', 'reported_elite_gold_count'],
                      ].map(([label, key]) => <label key={key}><span className="mb-1 block text-sm font-semibold">{label} Gold count</span><input className={field} type="number" min="0" step="1" inputMode="numeric" value={(form as any)[key]} onChange={(e) => set(key, Math.max(0, Math.trunc(Number(e.target.value) || 0)))} /></label>)}
                    </div>
                    <label className="mt-4 flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={form.reported_gold_acknowledged} onChange={(e) => set('reported_gold_acknowledged', e.target.checked)} /><span>I confirm these counts were copied from the competitor’s SDDA account records. They remain competitor-reported until SDDA confirms them.</span></label>
                  </div>
                  <F label="Is your dog reactive?">
                    <select
                      className={field}
                      value={form.reactivity}
                      onChange={(e) => set('reactivity', e.target.value)}
                    >
                      <option>None</option>
                      <option>Dogs</option>
                      <option>People</option>
                      <option>Both</option>
                    </select>
                  </F>
                </Grid>
              </Section>
              <Section title="SDDA entry declaration">
                <div className="space-y-3 rounded-xl border border-[#bfc8c1] bg-white p-5 text-sm leading-6 text-gray-800">
                  <p>I certify that I am the owner or authorized agent of the actual owner of the dog entered in this SDDA sanctioned Sporting Detection Trial. I accept full responsibility for all statements made in this entry and for the dog’s participation in this trial. In consideration of the acceptance of this entry I agree to be bound by the rules and regulations of the Sporting Detection Dogs Association and any additional rules and regulations put forth regarding this specific event.</p>
                  <p>I agree to hold harmless the SDDA, host club, and their agents and employees, for any loss, damage, or injury sustained by spectators or by exhibitors and handlers, or to any of their dogs or property. I agree to assume sole responsibility and agree to indemnify and hold harmless the SDDA, host club, and their agents and employees for loss, accidents or theft and I hold the SDDA, the host and any approved SDDA Judge harmless from any claims, actions or lawsuits resulting from my participation in this event.</p>
                </div>
                <p className="mt-3 text-xs text-gray-600">Declaration from the official SDDA Sample Trial Entry Form. The trial’s premium list and current SDDA rules also apply. <a className="font-semibold text-[#225f45] underline" href="https://www.sdda.ca/sdda-forms/" target="_blank" rel="noreferrer">View official SDDA forms</a>.</p>
              </Section>
              <Section title="Payment and cancellation">
                <p className="whitespace-pre-wrap">
                  {setup.payment_instructions ||
                    'Do not pay until the secretary confirms your entry and provides payment instructions.'}
                </p>
                <p className="mt-3 whitespace-pre-wrap">
                  {setup.cancellation_policy ||
                    'Entries are subject to the premium list cancellation policy.'}
                </p>
                <label className="mt-5 flex gap-3 rounded-xl border border-[#d4b778] bg-[#fff5d8] p-4">
                  <input
                    type="checkbox"
                    checked={form.waiver_accepted}
                    onChange={(e) => set('waiver_accepted', e.target.checked)}
                  />
                  <span><b>I have read and agree to the SDDA entry declaration displayed above.</b> I also reviewed my entry and agree to this trial’s payment and cancellation terms. *</span>
                </label>
              </Section>
            </div>
          )}
          {step === 4 && (
            <Section title="Review before submitting">
              <p className="mb-4">
                You will receive a confirmation number immediately. Receipt does not mean secretary
                acceptance.
              </p>
              <div className="rounded-xl bg-white p-4">
                <b>{form.handler_name}</b> · {form.handler_email}
                <br />
                <b>{form.dog_call_name}</b> ·{' '}
                {form.dog_registration_number || 'registration pending'}
                <br />
                {chosen.size + gameChosen.size} runs
                {(form.reported_advanced_gold_count > 0 || form.reported_excellent_gold_count > 0 || form.reported_elite_gold_count > 0) && <><br /><span className="text-amber-800"><b>Competitor-reported Gold:</b> Advanced {form.reported_advanced_gold_count} · Excellent {form.reported_excellent_gold_count} · Elite {form.reported_elite_gold_count} (unverified)</span></>}
                {gameChosen.size > 0 && <><br /><span className="text-[#225f45]"><b>{chosen.size ? 'Configured Games fees' : 'Amount owing'}:</b> {money(configuredGameFeesCents)}</span></>}
              </div>
              <div className="mt-4 space-y-2">
                {choices
                  .filter((c) => chosen.has(c.key))
                  .map((c) => (
                    <div className="rounded-lg border bg-white p-3" key={c.key}>
                      Day {setup.days.find((d) => d.id === c.trial_day_id)?.day_number} · {c.level}{' '}
                      · {c.component}
                      {c.level === 'Elite' ? '' : ` · ${runStream[c.key] || 'Amateur'}`} ·{' '}
                      <b>{runGroup[c.key] || 'Regular'}</b>
                    </div>
                  ))}
                {setup.game_offerings
                  .filter((g) => gameChosen.has(g.id))
                  .map((g) => (
                    <div className="rounded-lg border bg-white p-3" key={g.id}>
                      Day {setup.days.find((d) => d.id === g.trial_day_id)?.day_number} ·{' '}
                      {g.game_type} · <b>{gameEntryType[g.id] || 'Regular'}</b>
                      {g.game_type === 'Aerial' && ` · ${aerialDivision[g.id]}`}
                      {g.game_type === 'Team' && ` · Partner: ${teamPartner[g.id]}`}
                    </div>
                  ))}
              </div>
            </Section>
          )}
          <div className="mt-4 flex justify-between">
            {step > 1 ? (
              <button
                type="button"
                className="rounded-lg border bg-white px-5 py-3 font-bold"
                onClick={() => setStep((s) => s - 1)}
              >
                Back
              </button>
            ) : (
              <span />
            )}
            {step < 4 ? (
              <button
                type="button"
                className="rounded-lg bg-[#225f45] px-5 py-3 font-bold text-white"
                onClick={advance}
              >
                Continue
              </button>
            ) : (
              <button
                disabled={busy}
                className="rounded-lg bg-[#225f45] px-5 py-3 font-bold text-white"
              >
                {busy ? 'Saving…' : editing ? 'Save entry changes' : 'Submit entry'}
              </button>
            )}
          </div>
        </form>
      )}
    </Shell>
  );
}
function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f3f0e8] p-4 text-[#18231d]">
      <div className="mx-auto max-w-4xl">
        <header className="rounded-t-3xl bg-[#225f45] p-7 text-white">
          <small className="font-bold uppercase tracking-[.18em]">SDDA TrialDesk</small>
          <h1 className="font-serif text-4xl">{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </header>
        <div className="mt-4">{children}</div>
      </div>
    </main>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={box}>
      <h2 className="mb-4 font-serif text-3xl text-[#225f45]">{title}</h2>
      {children}
    </section>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span className="mb-1 block font-bold">{label}</span>
      {children}
    </label>
  );
}
