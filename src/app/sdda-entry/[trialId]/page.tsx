'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { createEntryReceiptPdf } from '@/lib/sdda/entryReceiptPdf';
import { joinFormalAlerts, splitFormalAlerts } from '@/lib/sdda/formalAlerts';
type Day = { id: string; day_number: number; trial_date: string; entries_open: boolean };
type Offer = { id: string; trial_day_id: string; level: string; component: string; stream: string; feo_allowed: boolean };
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
  feo_allowed: boolean;
};
type Setup = {
  name: string;
  host_club: string;
  venue?: string;
  trial_format: 'scent' | 'games' | 'combined';
  payment_instructions?: string;
  cancellation_policy?: string;
  secretary_name?: string;
  secretary_email?: string;
  secretary_phone?: string;
  scent_component_fee_cents: number;
  scent_three_component_fee_cents: number;
  elite_fee_cents: number;
  entry_open_at?: string;
  general_entry_open_at?: string;
  entry_close_at?: string;
  entry_phase?: 'registered_only' | 'general';
  days: Day[];
  offerings: Offer[];
  game_offerings: GameOffer[];
};
type SetupRow = Omit<Setup, 'days' | 'offerings' | 'game_offerings'> & {
  sdda_trial_days?: Day[];
  sdda_trial_offerings?: Offer[];
  sdda_game_offerings?: GameOffer[];
};
type EditData = Omit<typeof empty, 'formal_alert_1' | 'formal_alert_2'> & {
  formal_alerts: string;
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
type RegistryDog = { found: boolean; registration_number?: string; call_name?: string; breed?: string; snapshot_source?: string; snapshot_refreshed_at?: string };
type EntryTiming = { name: string; host_club: string; venue?: string; timezone: string; entry_open_at?: string; general_entry_open_at?: string; entry_close_at?: string };
const box = 'rounded-2xl border border-[#cbd5e1] bg-[#f8fafc] p-5 shadow-sm';
const field = 'w-full rounded-lg border border-[#bfc8c1] bg-white px-3 py-2';
const levelOrder = ['Started', 'Advanced', 'Excellent', 'Elite'];
const formatCountdown = (milliseconds: number) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${days ? `${days}d ` : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};
const formatTrialTime = (value: string, timeZone: string) => new Intl.DateTimeFormat('en-CA', {
  timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
}).format(new Date(value));
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
  formal_alert_1: '',
  formal_alert_2: '',
  title_watch_note: '',
  reactivity: 'None',
  waiver_accepted: false,
};
export default function Page() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const searchParams = useSearchParams();
  const entryCode = searchParams.get('code') || '';
  const receiptToken = searchParams.get('token') || '';
  const secretaryEntryId = searchParams.get('secretaryEntry') || '';
  const secretaryNew = searchParams.get('secretaryNew') === '1';
  const [setup, setSetup] = useState<Setup>();
  const [entryTiming, setEntryTiming] = useState<EntryTiming>();
  const [clock, setClock] = useState(() => Date.now());
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
  const [lookupNumber, setLookupNumber] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [registryBusy, setRegistryBusy] = useState(false);
  const [registryDog, setRegistryDog] = useState<RegistryDog | null>(null);
  const [recoveryCredentials, setRecoveryCredentials] = useState<{
    registration_number: string;
    verification_email: string;
  } | null>(null);
  const [receipt, setReceipt] = useState<{
    confirmation_code: string;
    receipt_token: string;
  } | null>(null);
  useEffect(() => {
    if (!entryTiming) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [entryTiming]);
  useEffect(() => {
    const client = getSupabaseBrowser();
    if (secretaryEntryId || secretaryNew) {
      if (secretaryNew) {
        void client
          .from('sdda_trials')
          .select(
            'name,host_club,venue,trial_format,secretary_name,secretary_email,secretary_phone,payment_instructions,cancellation_policy,scent_component_fee_cents,scent_three_component_fee_cents,elite_fee_cents,sdda_trial_days(id,day_number,trial_date,entries_open),sdda_trial_offerings(id,trial_day_id,level,component,stream,feo_allowed),sdda_game_offerings(id,trial_day_id,game_type,entry_fee_cents,feo_fee_cents,feo_allowed)'
          )
          .eq('id', trialId)
          .single()
          .then(({ data, error: setupError }) => {
            if (setupError) return setError(setupError.message);
            const row = data as SetupRow;
            setSetup({
              ...row,
              days: row.sdda_trial_days || [],
              offerings: row.sdda_trial_offerings || [],
              game_offerings: row.sdda_game_offerings || [],
            });
          });
        return;
      }
      void Promise.all([
        client
          .from('sdda_trials')
          .select(
            'name,host_club,venue,trial_format,secretary_name,secretary_email,secretary_phone,payment_instructions,cancellation_policy,scent_component_fee_cents,scent_three_component_fee_cents,elite_fee_cents,sdda_trial_days(id,day_number,trial_date,entries_open),sdda_trial_offerings(id,trial_day_id,level,component,stream,feo_allowed),sdda_game_offerings(id,trial_day_id,game_type,entry_fee_cents,feo_fee_cents,feo_allowed)'
          )
          .eq('id', trialId)
          .single(),
        client.rpc('sdda_secretary_entry_for_edit', { target_entry_id: secretaryEntryId }),
      ]).then(([setupResult, editResult]) => {
        if (setupResult.error || editResult.error)
          return setError(
            setupResult.error?.message || editResult.error?.message || 'Unable to edit entry.'
          );
        const row = setupResult.data as SetupRow;
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
      void Promise.all([
        client.rpc('sdda_public_entry_for_edit', {
          entry_code: entryCode,
          receipt_token: receiptToken,
        }),
        client.rpc('sdda_public_trial_entry_setup', { target_trial_id: trialId }),
      ]).then(([editResult, setupResult]) => {
          if (editResult.error || setupResult.error) return setError(editResult.error?.message || setupResult.error?.message || 'Entry setup could not be loaded.');
          const editData = editResult.data as EditData;
          const activeSetup = setupResult.data as Setup;
          setSetup(activeSetup);
          hydrateEdit(editData, false, activeSetup);
        });
      return;
    }
    void client.rpc('sdda_public_trial_entry_setup', { target_trial_id: trialId }).then(async ({ data, error }) => {
      if (!error) return setSetup(data as Setup);
      const timingResult = await client.rpc('sdda_public_trial_entry_timing', { target_trial_id: trialId });
      if (timingResult.error || !timingResult.data) return setError(error.message);
      setEntryTiming(timingResult.data as EntryTiming);
    });
    // The identifiers are fixed for the lifetime of this entry page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trialId, secretaryEntryId, secretaryNew, entryCode, receiptToken]);

  function hydrateEdit(
    data: EditData,
    secretary: boolean,
    activeSetup: Setup,
    startEditing = secretary
  ) {
    const formKeys = Object.keys(empty) as Array<keyof typeof empty>;
    const editValues = data as unknown as Record<string, unknown>;
    const loadedForm = Object.fromEntries(
      formKeys.map((key) => [key, editValues[key] ?? empty[key]])
    ) as typeof empty;
    const [formalAlert1, formalAlert2] = splitFormalAlerts(data.formal_alerts);
    setForm({
      ...loadedForm,
      formal_alert_1: formalAlert1,
      formal_alert_2: formalAlert2,
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
      secretary || startEditing
        ? null
        : { confirmation_code: data.confirmation_code, receipt_token: receiptToken }
    );
    setCanEdit(data.can_edit);
    setEditing(startEditing);
  }

  async function lookupExistingEntry(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!lookupNumber.trim() || !lookupEmail.trim().includes('@')) {
      setError('Enter the SDDA registration or confirmation number and the email used for the entry.');
      return;
    }
    setLookupBusy(true);
    const client = getSupabaseBrowser();
    const { data, error: lookupError } = await client.rpc(
      'sdda_public_entry_by_registration',
      {
        target_trial_id: trialId,
        registration_number: lookupNumber.trim(),
        verification_email: lookupEmail.trim(),
      }
    );
    setLookupBusy(false);
    if (lookupError) {
      setError(lookupError.message);
      return;
    }
    if (!setup) {
      setError('The trial entry form is not ready yet. Please reload and try again.');
      return;
    }
    const editData = data as EditData;
    if (!editData.can_edit) {
      setError('This entry can no longer be edited online. Contact the trial secretary.');
      return;
    }
    setRecoveryCredentials({
      registration_number: lookupNumber.trim(),
      verification_email: lookupEmail.trim(),
    });
    hydrateEdit(editData, false, setup, true);
    setStep(1);
    scrollTo(0, 0);
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
  const configuredScentFeesCents = useMemo(() => {
    if (!setup) return 0;
    const groups = new Map<string, Choice[]>();
    for (const choice of choices.filter((item) => chosen.has(item.key))) {
      const key = `${choice.trial_day_id}|${choice.level}`;
      groups.set(key, [...(groups.get(key) || []), choice]);
    }
    let total = 0;
    for (const selected of groups.values()) {
      if (selected[0]?.level === 'Elite') total += setup.elite_fee_cents || 0;
      else if (selected.length === 3 && setup.scent_three_component_fee_cents > 0) total += setup.scent_three_component_fee_cents;
      else total += selected.length * (setup.scent_component_fee_cents || 0);
    }
    return total;
  }, [setup, choices, chosen]);
  const configuredEntryFeesCents = configuredScentFeesCents + configuredGameFeesCents;
  const money = (cents: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
  const set = (key: string, value: string | boolean | number) => setForm((v) => ({ ...v, [key]: value }));
  const toggle = (key: string) =>
    setChosen((v) => {
      const n = new Set(v);
      if (n.has(key)) n.delete(key);
      else n.add(key);
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
        (!secretaryEntryId && !secretaryNew && setup?.entry_phase === 'registered_only' && !form.participant_number.trim()) ||
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
    setStep((s) => s + 1);
    scrollTo(0, 0);
  }
  async function verifyRegistryNumber() {
    if (form.registration_pending || !form.dog_registration_number.trim()) return;
    setRegistryBusy(true);
    setError('');
    const { data, error: lookupError } = await getSupabaseBrowser().rpc('sdda_lookup_registry_dog', {
      registration_number: form.dog_registration_number.trim(),
    });
    setRegistryBusy(false);
    if (lookupError) { setRegistryDog(null); setError(lookupError.message); return; }
    const dog = data as RegistryDog;
    setRegistryDog(dog);
    if (dog.found) {
      setForm((current) => ({
        ...current,
        dog_call_name: current.dog_call_name.trim() || dog.call_name || '',
        breed: current.breed.trim() || dog.breed || '',
      }));
    }
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
    const { formal_alert_1, formal_alert_2, ...formFields } = form;
    const submission = {
      ...formFields,
      formal_alerts: joinFormalAlerts(formal_alert_1, formal_alert_2),
      runs,
      game_runs,
    };
    const client = getSupabaseBrowser();
    const { data, error } = secretaryEntryId
      ? await client.rpc('sdda_update_entry_as_secretary', {
          target_entry_id: secretaryEntryId,
          submission,
        })
      : recoveryCredentials
        ? await client.rpc('sdda_update_public_entry_by_registration', {
            target_trial_id: trialId,
            registration_number: recoveryCredentials.registration_number,
            verification_email: recoveryCredentials.verification_email,
            submission,
          })
      : editing
        ? await client.rpc('sdda_update_public_entry', {
            entry_code: receipt?.confirmation_code || entryCode,
            receipt_token: receipt?.receipt_token || receiptToken,
            submission,
          })
        : await client.rpc(secretaryNew ? 'sdda_submit_secretary_entry' : 'sdda_submit_public_entry_v6', {
            target_trial_id: trialId,
            submission,
          });
    setBusy(false);
    if (error) return setError(error.message);
    const r = data as { confirmation_code: string; receipt_token?: string };
    const token = r.receipt_token || receipt?.receipt_token || receiptToken;
    if (secretaryNew) {
      if (!token) return setError('The new entry was saved, but its secretary record could not be finalized.');
      const { error: markError } = await client.rpc('sdda_mark_secretary_entry', {
        target_confirmation_code: r.confirmation_code,
        target_receipt_token: token,
      });
      if (markError) return setError(markError.message);
      window.location.href = `/dashboard/trials/${trialId}/entries`;
      return;
    }
    if (secretaryEntryId) {
      window.location.href = `/dashboard/trials/${trialId}/entries`;
      return;
    }
    if (recoveryCredentials) {
      setRecoveryCredentials({
        registration_number: form.dog_registration_number.trim(),
        verification_email: form.handler_email.trim(),
      });
    }
    setReceipt({ confirmation_code: r.confirmation_code, receipt_token: token });
    setEditing(false);
    localStorage.setItem(
      `sdda-receipt-${r.confirmation_code}`,
      JSON.stringify({ confirmation_code: r.confirmation_code, receipt_token: token, trialId })
    );
    if (token) {
      window.history.replaceState(
        null,
        '',
        `/sdda-entry/${trialId}?code=${encodeURIComponent(r.confirmation_code)}&token=${encodeURIComponent(token)}`
      );
    }
    scrollTo(0, 0);
  }
  function selectionLabels() {
    if (!setup) return [];
    const selections = choices
      .filter((c) => chosen.has(c.key))
      .map(
        (c) =>
          `Day ${setup.days.find((d) => d.id === c.trial_day_id)?.day_number || '?'} - ${c.level} - ${c.component}${c.level === 'Elite' ? '' : ` - ${runStream[c.key] || 'Amateur'}`}${runGroup[c.key] === 'FEO' ? ' - FEO' : ''}`
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
      privateEditUrl: receipt.receipt_token
        ? `${window.location.origin}/sdda-entry/${trialId}?code=${encodeURIComponent(receipt.confirmation_code)}&token=${encodeURIComponent(receipt.receipt_token)}`
        : undefined,
      amountOwingCents: configuredEntryFeesCents,
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
  if (entryTiming) {
    const opensAt = entryTiming.entry_open_at ? new Date(entryTiming.entry_open_at).getTime() : Number.NaN;
    const remaining = opensAt - clock;
    if (remaining <= 0) window.setTimeout(() => window.location.reload(), 500);
    return <Shell title={entryTiming.name} subtitle={`${entryTiming.host_club}${entryTiming.venue ? ` • ${entryTiming.venue}` : ''}`}><section className={`${box} text-center`}><h2 className="font-serif text-3xl text-[#294f73]">Entries have not opened yet</h2>{Number.isFinite(remaining) && remaining > 0 ? <><p className="mt-3 text-sm text-[#64748b]">Registered-participant entries open in</p><p className="mt-2 text-4xl font-bold tabular-nums text-[#17324d]">{formatCountdown(remaining)}</p><p className="mt-3 text-sm text-[#64748b]">{formatTrialTime(entryTiming.entry_open_at!, entryTiming.timezone)}</p>{entryTiming.general_entry_open_at && <p className="mt-2 text-sm text-[#64748b]">General entries open {formatTrialTime(entryTiming.general_entry_open_at, entryTiming.timezone)}</p>}</> : <p className="mt-3 text-[#64748b]">Opening time has not been scheduled. Please check the premium list or contact the trial secretary.</p>}<button type="button" className="mt-6 rounded-lg bg-[#294f73] px-5 py-3 font-bold text-white" onClick={() => window.location.reload()}>Check entry availability</button></section></Shell>;
  }
  if (receipt)
    return (
      <Shell title="Entry received" subtitle={setup?.name}>
        <section className={box}>
          <small className="font-bold uppercase">Confirmation number</small>
          <p className="my-2 font-mono text-3xl font-bold text-[#294f73]">
            {receipt.confirmation_code}
          </p>
          <div className="my-5 rounded-xl border border-[#d4b778] bg-[#fff5d8] p-4">
            <b>Received—not yet accepted.</b>
            <p>
              The secretary must confirm your entry and payment instructions. Keep this receipt.
            </p>
          </div>
          {canEdit && receipt.receipt_token && <div className="my-5 rounded-xl border-2 border-[#6688a6] bg-white p-4"><b>Return to this entry</b><p className="mt-1 text-sm">You may keep this private link, or return to the public entry form and use the dog’s SDDA registration number plus the entry email.</p><p className="mt-3 break-all rounded bg-[#f1f5f9] p-3 font-mono text-xs">{typeof window !== 'undefined' ? window.location.href : ''}</p><p className="mt-2 text-sm font-semibold text-[#294f73]">Keep the private link confidential. Anyone with it can edit the entry while online editing remains open.</p></div>}
          <p>
            {form.handler_name} with {form.dog_call_name} · {chosen.size + gameChosen.size} runs
            requested
          </p>
          {(chosen.size > 0 || gameChosen.size > 0) && <div className="mt-4 rounded-xl border border-[#b6c8d8] bg-[#edf6ef] p-4"><small className="font-bold uppercase text-[#475569]">Amount owing when accepted</small><p className="text-3xl font-bold text-[#294f73]">{money(configuredEntryFeesCents)}</p><p className="mt-1 text-sm text-gray-600">Scent {money(configuredScentFeesCents)} · Games {money(configuredGameFeesCents)}</p></div>}
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
              className="rounded-lg border border-[#294f73] bg-white px-5 py-3 font-bold text-[#294f73]"
              onClick={() => window.print()}
            >
              Print receipt
            </button>
            <button
              type="button"
              className="rounded-lg bg-[#294f73] px-5 py-3 font-bold text-white"
              onClick={() => void downloadReceipt()}
            >
              Download receipt PDF
            </button>
            {canEdit && (
              <>
                <button
                  type="button"
                  className="rounded-lg border border-[#294f73] bg-white px-5 py-3 font-bold text-[#294f73]"
                  onClick={() => {
                    setReceipt(null);
                    setEditing(true);
                    setStep(1);
                  }}
                >
                  Edit entry
                </button>
                {receipt.receipt_token && (
                  <button
                    type="button"
                    className="rounded-lg border border-[#294f73] bg-white px-5 py-3 font-bold text-[#294f73]"
                    onClick={async () => {
                      await navigator.clipboard.writeText(window.location.href);
                      setLinkCopied(true);
                    }}
                  >
                    {linkCopied ? 'Private link copied' : 'Copy private entry link'}
                  </button>
                )}
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
            className={`rounded-lg p-3 ${step === i + 1 ? 'bg-[#6688a6] text-white' : 'bg-white'}`}
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
        <>
          {!secretaryEntryId && !secretaryNew && setup.entry_phase === 'registered_only' && (
            <section className="mb-4 rounded-2xl border-2 border-[#6688a6] bg-[#eaf2f8] p-5 text-[#17324d] shadow-sm">
              <h2 className="font-serif text-2xl">Registered-participant entry period</h2>
              <p className="mt-1 text-sm">General entries have not opened yet. A registered participant number matching the current SDDA registry is required to submit during this three-day early period.</p>
            </section>
          )}
          {secretaryNew && (
            <section className="mb-4 rounded-2xl border-2 border-[#6688a6] bg-[#eaf2f8] p-5 text-[#17324d] shadow-sm">
              <h2 className="font-serif text-2xl">Secretary entry</h2>
              <p className="mt-1 text-sm">
                Enter a paper or day-of submission. Saving returns you to the Entry roster and records
                this as a manual entry made by the signed-in secretary.
              </p>
            </section>
          )}
          {!editing && !secretaryEntryId && !secretaryNew && !entryCode && (
            <form className={`${box} mb-4`} onSubmit={lookupExistingEntry}>
              <h2 className="font-serif text-2xl text-[#294f73]">Already entered this trial?</h2>
              <p className="mt-1 text-sm text-[#64748b]">
                Enter the dog’s SDDA registration number—or the confirmation number from the
                receipt—and the same email used on the entry. We’ll load the current information
                and selections so you can make changes.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <F label="SDDA registration or confirmation number">
                  <input
                    className={field}
                    value={lookupNumber}
                    onChange={(e) => setLookupNumber(e.target.value)}
                  />
                </F>
                <F label="Entry email">
                  <input
                    type="email"
                    className={field}
                    value={lookupEmail}
                    onChange={(e) => setLookupEmail(e.target.value)}
                  />
                </F>
                <button
                  type="submit"
                  disabled={lookupBusy}
                  className="rounded-lg border border-[#294f73] bg-white px-5 py-2 font-bold text-[#294f73] disabled:opacity-60"
                >
                  {lookupBusy ? 'Looking up…' : 'Load my entry'}
                </button>
              </div>
              <p className="mt-3 text-xs text-gray-600">
                For privacy, both values must match. Received and accepted entries may be changed
                while online entries remain open. Once a score has been recorded, changes must be
                made by the trial secretary.
              </p>
            </form>
          )}
          <form onSubmit={submit}>
          {(setup.secretary_name || setup.secretary_email || setup.secretary_phone) && <section className={`${box} mb-4 text-sm`}><b>Trial secretary:</b> {[setup.secretary_name, setup.secretary_email, setup.secretary_phone].filter(Boolean).join(' · ')}</section>}
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
                  <F label={`Registered participant number${!secretaryEntryId && !secretaryNew && setup.entry_phase === 'registered_only' ? ' *' : ''}`}>
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
                  <F label="SDDA registration number *">
                    <input
                      disabled={form.registration_pending}
                      className={field}
                      value={form.dog_registration_number}
                      onChange={(e) => { set('dog_registration_number', e.target.value); setRegistryDog(null); }}
                      onBlur={() => void verifyRegistryNumber()}
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={form.registration_pending}
                        onChange={(e) => { set('registration_pending', e.target.checked); setRegistryDog(null); }}
                      />{' '}
                      Registration pending
                    </label>
                    {!form.registration_pending && <div className="mt-2 space-y-2">
                      <button type="button" disabled={registryBusy || !form.dog_registration_number.trim()} onClick={() => void verifyRegistryNumber()} className="rounded-md border border-[#8ba99a] bg-white px-3 py-1.5 text-sm font-semibold text-[#294f73] disabled:opacity-50">{registryBusy ? 'Checking…' : 'Check SDDA registry'}</button>
                      {registryDog?.found && (() => {
                        const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const matches = !form.dog_call_name.trim() || normalize(form.dog_call_name) === normalize(registryDog.call_name || '');
                        return <p className={`rounded-md border px-3 py-2 text-sm ${matches ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-red-300 bg-red-50 text-red-900'}`}>{matches ? `Verified: ${registryDog.call_name}${registryDog.breed ? ` · ${registryDog.breed}` : ''}` : `This number is registered to ${registryDog.call_name}. Correct the dog call name before submitting.`}</p>;
                      })()}
                      {registryDog && !registryDog.found && <p className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900">This number is not in the current official workbook snapshot. You may continue, but the secretary must verify it manually.</p>}
                    </div>}
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
              <p className="mb-5 text-sm text-[#64748b]">
                Select each Scent component or Game requested. The secretary will confirm
                availability and capacity.
              </p>
              {setup.days.map((d) => (
                <div className="mb-7" key={d.id}>
                  <h3 className="border-b pb-2 font-serif text-2xl">
                    Day {d.day_number} · {d.trial_date}{!d.entries_open && <span className="ml-3 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 align-middle font-sans text-xs font-bold uppercase text-slate-600">Entries closed</span>}
                  </h3>
                  {!d.entries_open && <p className="mt-3 rounded-md border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">The secretary has closed this trial day. Existing selections remain on previously submitted entries, but new selections are unavailable.</p>}
                  {choices.some((c) => c.trial_day_id === d.id) && (
                    <div className="mt-4">
                      <h4 className="font-bold text-[#294f73]">Scent classes</h4>
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
                                        disabled={!d.entries_open}
                                        checked={chosen.has(c.key)}
                                        onChange={() => toggle(c.key)}
                                      />
                                      {c.component}
                                    </label>
                                    {chosen.has(c.key) && (
                                      <div className="mt-3 space-y-3">
                                        {c.level !== 'Elite' && (
                                          <label className="block rounded-lg border border-[#6688a6] bg-[#fff9e9] p-2">
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
                                        {c.offerings.some((o) => o.feo_allowed) && <label className="flex items-center gap-2 rounded-lg border border-[#9eb7aa] bg-[#f1f5f9] p-3 font-semibold"><input type="checkbox" checked={runGroup[c.key] === 'FEO'} onChange={(e) => setRunGroup((current) => ({ ...current, [c.key]: e.target.checked ? 'FEO' : 'Regular' }))} />Enter this component For Exhibition Only (FEO)</label>}
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
                      <h4 className="font-bold text-[#294f73]">SDDA Games</h4>
                      <p className="mb-3 text-sm">
                        Select each Game requested. FEO is shown only when the trial secretary permits it.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {setup.game_offerings
                          .filter((g) => g.trial_day_id === d.id)
                          .map((g) => (
                            <div className="rounded-lg border bg-white p-3" key={g.id}>
                              <label className="flex items-center gap-3 font-semibold">
                                <input
                                  type="checkbox"
                                  disabled={!d.entries_open}
                                  checked={gameChosen.has(g.id)}
                                  onChange={() =>
                                    setGameChosen((current) => {
                                      const next = new Set(current);
                                      if (next.has(g.id)) next.delete(g.id);
                                      else next.add(g.id);
                                      return next;
                                    })
                                  }
                                />
                                {g.game_type}
                              </label>
                              {gameChosen.has(g.id) && (
                                <div className="mt-3 space-y-3">
                                  {g.feo_allowed && <label className="flex items-center gap-2 rounded-lg border border-[#9eb7aa] bg-[#f1f5f9] p-3 font-semibold"><input type="checkbox" checked={gameEntryType[g.id] === 'FEO'} onChange={(e) => setGameEntryType((current) => ({ ...current, [g.id]: e.target.checked ? 'FEO' : 'Regular' }))} />Enter this Game For Exhibition Only (FEO) · ${(g.feo_fee_cents / 100).toFixed(2)}</label>}
                                  {g.game_type === 'Aerial' && (
                                    <label className="block rounded-lg border border-[#6688a6] bg-[#fff9e9] p-2">
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
                  <F label="Formal Alert 1 — Started teams leave blank">
                    <input
                      className={field}
                      value={form.formal_alert_1}
                      onChange={(e) => set('formal_alert_1', e.target.value)}
                    />
                  </F>
                  <F label="Formal Alert 2 (optional) — Started teams leave blank">
                    <input
                      className={field}
                      value={form.formal_alert_2}
                      onChange={(e) => set('formal_alert_2', e.target.value)}
                    />
                  </F>
                  <F label="Championship title watch">
                    <textarea
                      className={field}
                      value={form.title_watch_note}
                      onChange={(e) => set('title_watch_note', e.target.value)}
                    />
                  </F>
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
                <p className="mt-3 text-xs text-gray-600">Declaration from the official SDDA Sample Trial Entry Form. The trial’s premium list and current SDDA rules also apply. <a className="font-semibold text-[#294f73] underline" href="https://www.sdda.ca/sdda-forms/" target="_blank" rel="noreferrer">View official SDDA forms</a>.</p>
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
                {(chosen.size > 0 || gameChosen.size > 0) && <><br /><span className="text-[#294f73]"><b>Amount owing when accepted:</b> {money(configuredEntryFeesCents)}</span></>}
              </div>
              <div className="mt-4 space-y-2">
                {choices
                  .filter((c) => chosen.has(c.key))
                  .map((c) => (
                    <div className="rounded-lg border bg-white p-3" key={c.key}>
                      Day {setup.days.find((d) => d.id === c.trial_day_id)?.day_number} · {c.level}{' '}
                      · {c.component}
                      {c.level === 'Elite' ? '' : ` · ${runStream[c.key] || 'Amateur'}`}
                      {runGroup[c.key] === 'FEO' && <> · <b>FEO</b></>}
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
                className="rounded-lg bg-[#294f73] px-5 py-3 font-bold text-white"
                onClick={advance}
              >
                Continue
              </button>
            ) : (
              <button
                disabled={busy}
                className="rounded-lg bg-[#294f73] px-5 py-3 font-bold text-white"
              >
                {busy ? 'Saving…' : editing ? 'Save entry changes' : 'Submit entry'}
              </button>
            )}
          </div>
          </form>
        </>
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
    <main className="min-h-screen bg-[#e9eef3] p-4 text-[#17212b]">
      <div className="mx-auto max-w-4xl">
        <header className="rounded-t-3xl bg-[#294f73] p-7 text-white">
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
      <h2 className="mb-4 font-serif text-3xl text-[#294f73]">{title}</h2>
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
