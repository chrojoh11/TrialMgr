import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/apiAuth';
import { createHash, randomUUID } from 'crypto';

const inactive = new Set(['waitlisted', 'withdrawn']);
const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const nameKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const phoneKey = (value: string) => value.replace(/\D/g, '');
const VERIFY_WINDOW_MS = 15 * 60 * 1000;
const MAX_VERIFY_FAILURES = 5;

const verificationKey = (request: NextRequest, trialId: string, cwagsNumber: string) => {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const pepper = process.env.ENTRY_LOOKUP_PEPPER;
  if (!pepper) throw new Error('ENTRY_LOOKUP_PEPPER is required for public entry lookup tokens.');
  return createHash('sha256')
    .update(`${pepper}|${forwarded}|${trialId}|${cwagsNumber.toLowerCase()}`)
    .digest('hex');
};

type RequestedSelection = {
  roundId: string;
  entryType: 'regular' | 'feo';
  division: string | null;
  jumpHeight: string | null;
};

const mapSnapshotClasses = (selections: any[]) =>
  selections.map((selection: any) => {
    const round = Array.isArray(selection.trial_rounds) ? selection.trial_rounds[0] : selection.trial_rounds;
    const cls = Array.isArray(round?.trial_classes) ? round.trial_classes[0] : round?.trial_classes;
    const day = Array.isArray(cls?.trial_days) ? cls.trial_days[0] : cls?.trial_days;
    return {
      name: cls?.class_name || 'Unknown Class',
      round: round?.round_number || 1,
      fee: Number(selection.fee || 0),
      entry_status: selection.entry_status,
      division: selection.division || null,
      entry_type: selection.entry_type,
      day_number: day?.day_number || null,
      trial_date: day?.trial_date || null,
      jump_height: selection.jump_height || null,
      created_at: selection.created_at || null,
    };
  });

const snapshotClassSignature = (classes: any[]) =>
  JSON.stringify(
    classes
      .map((selection) => ({
        name: selection.name,
        round: selection.round,
        day_number: selection.day_number,
        entry_type: selection.entry_type,
        fee: Number(selection.fee || 0),
        entry_status: selection.entry_status,
        division: selection.division,
        jump_height: selection.jump_height,
      }))
      .sort((a, b) =>
        `${a.day_number}|${a.name}|${a.round}`.localeCompare(
          `${b.day_number}|${b.name}|${b.round}`,
        ),
      ),
  );

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trialId: string }> }
) {
  try {
    const { trialId } = await params;
    const pendingRegistration = request.nextUrl.searchParams.get('pending') === 'true';
    const cwagsNumber = text(request.nextUrl.searchParams.get('cwags'), 64);
    const submittedEmail = text(request.nextUrl.searchParams.get('email'), 254).toLowerCase();
    const submittedPhone = phoneKey(text(request.nextUrl.searchParams.get('phone'), 64));
    const submittedDog = nameKey(text(request.nextUrl.searchParams.get('dog'), 120));
    if ((!pendingRegistration && !cwagsNumber) || !submittedEmail || (pendingRegistration && (!submittedPhone || !submittedDog))) {
      return NextResponse.json({ error: pendingRegistration ? 'Email, phone number, and dog name are required.' : 'A registration number and email are required.' }, { status: 400 });
    }

    const db = getServiceRoleClient();
    const keyHash = verificationKey(request, trialId, pendingRegistration ? `pending:${submittedEmail}` : cwagsNumber);
    const { data: limit, error: limitError } = await db
      .from('public_entry_verification_limits')
      .select('failed_attempts,window_started_at,blocked_until')
      .eq('key_hash', keyHash)
      .maybeSingle();
    if (limitError) throw limitError;
    if (limit?.blocked_until && new Date(limit.blocked_until).getTime() > Date.now()) {
      return NextResponse.json(
        {
          error:
            'Entry lookup is temporarily paused for this C-WAGS number from your current network after repeated unsuccessful verification attempts. Please try again later. Your account login is not affected.',
        },
        { status: 429 }
      );
    }
    const { data: trial, error: trialError } = await db
      .from('trials')
      .select('id,entry_status')
      .eq('id', trialId)
      .maybeSingle();
    if (trialError) throw trialError;
    if (!trial) return NextResponse.json({ error: 'Trial not found.' }, { status: 404 });
    if (trial.entry_status !== 'open') {
      return NextResponse.json({ error: 'Entries are not currently open.' }, { status: 403 });
    }

    let entryQuery = db
      .from('entries')
      .select(`id,handler_name,dog_call_name,cwags_number,dog_breed,dog_sex,
        handler_email,handler_phone,emergency_contact,is_junior_handler,
        waiver_accepted,close_to_titles,volunteer_preferences,entry_status,submitted_at,registration_pending`)
      .eq('trial_id', trialId);
    entryQuery = pendingRegistration
      ? entryQuery.eq('registration_pending', true)
      : entryQuery.eq('cwags_number', cwagsNumber);
    const { data: entries, error: entryError } = await entryQuery.order('submitted_at', { ascending: false });
    if (entryError) throw entryError;

    const { data: registry, error: registryError } = pendingRegistration
      ? { data: null, error: null }
      : await db.from('cwags_registry').select('handler_name,dog_call_name,handler_email').eq('cwags_number', cwagsNumber).maybeSingle();
    if (registryError) throw registryError;

    const registryEmailMatches =
      Boolean(submittedEmail) &&
      String(registry?.handler_email || '').trim().toLowerCase() === submittedEmail;
    const candidateEntries = pendingRegistration
      ? (entries || []).filter((entry) => nameKey(String(entry.dog_call_name || '')) === submittedDog)
      : (entries || []);
    const verifiedEntries = candidateEntries.filter((entry) => pendingRegistration
      ? String(entry.handler_email || '').trim().toLowerCase() === submittedEmail &&
        phoneKey(String(entry.handler_phone || '')) === submittedPhone &&
        nameKey(String(entry.dog_call_name || '')) === submittedDog
      : String(entry.handler_email || '').trim().toLowerCase() === submittedEmail || registryEmailMatches);
    if (candidateEntries.length > 0 && verifiedEntries.length === 0) {
      const windowStart = limit?.window_started_at
        ? new Date(limit.window_started_at).getTime()
        : 0;
      const inWindow = Date.now() - windowStart < VERIFY_WINDOW_MS;
      const failedAttempts = (inWindow ? Number(limit?.failed_attempts || 0) : 0) + 1;
      const now = new Date();
      const blockedUntil = failedAttempts >= MAX_VERIFY_FAILURES
        ? new Date(now.getTime() + VERIFY_WINDOW_MS).toISOString()
        : null;
      const { error: recordError } = await db
        .from('public_entry_verification_limits')
        .upsert({
          key_hash: keyHash,
          failed_attempts: failedAttempts,
          window_started_at: inWindow && limit?.window_started_at
            ? limit.window_started_at
            : now.toISOString(),
          blocked_until: blockedUntil,
          updated_at: now.toISOString(),
        });
      if (recordError) throw recordError;
      return NextResponse.json(
        { error: pendingRegistration ? 'The email, phone number, and dog name could not be verified.' : 'The registration number and email could not be verified.' },
        { status: 403 }
      );
    }
    if (verifiedEntries.length > 0 && limit) {
      await db.from('public_entry_verification_limits').delete().eq('key_hash', keyHash);
    }

    const entryIds = verifiedEntries.map((entry) => entry.id);
    const { data: selections, error: selectionsError } = entryIds.length
      ? await db
          .from('entry_selections')
          .select('id,trial_round_id,entry_type,division,entry_id,jump_height')
          .in('entry_id', entryIds)
      : { data: [], error: null };
    if (selectionsError) throw selectionsError;

    const selectionIds = (selections || []).map((selection) => selection.id);
    const { data: scoreRows, error: scoreError } = selectionIds.length
      ? await db.from('scores').select('entry_selection_id').in('entry_selection_id', selectionIds)
      : { data: [], error: null };
    if (scoreError) throw scoreError;
    const scoredIds = new Set((scoreRows || []).map((score) => score.entry_selection_id));

    return NextResponse.json({
      entries: verifiedEntries,
      selections: (selections || []).map((selection) => ({
        ...selection,
        has_score: scoredIds.has(selection.id),
      })),
      registry: registry
        ? {
            handler_name: registry.handler_name,
            dog_call_name: registry.dog_call_name,
          }
        : null,
    });
  } catch (error) {
    console.error('Public entry lookup failed:', error);
    return NextResponse.json({ error: 'Unable to look up this entry.' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ trialId: string }> }
) {
  const { trialId } = await params;
  const db = getServiceRoleClient();

  try {
    const body = await request.json();
    const pendingRegistration = body.registration_pending === true;
    const suppliedCwagsNumber = text(body.cwags_number, 64);
    const cwagsNumber = pendingRegistration
      ? (/^PENDING-[0-9a-f-]{36}$/i.test(suppliedCwagsNumber) ? suppliedCwagsNumber : `PENDING-${randomUUID()}`)
      : suppliedCwagsNumber;
    const submittedHandler = text(body.handler_name, 160);
    const submittedDog = text(body.dog_call_name, 120);
    const roundIds = Array.isArray(body.selected_rounds)
      ? [...new Set(body.selected_rounds.filter((id: unknown): id is string => typeof id === 'string'))]
      : [];
    const feoIds = new Set<string>(
      Array.isArray(body.feo_selections)
        ? body.feo_selections.filter((id: unknown): id is string => typeof id === 'string')
        : []
    );

    if (!cwagsNumber || !submittedHandler || !submittedDog || roundIds.length === 0) {
      return NextResponse.json({ error: 'Dog, handler, and at least one round are required.' }, { status: 400 });
    }
    if (body.waiver_accepted !== true) {
      return NextResponse.json({ error: 'The waiver must be accepted.' }, { status: 400 });
    }

    const { data: trial, error: trialError } = await db
      .from('trials')
      .select('id,entry_status')
      .eq('id', trialId)
      .maybeSingle();
    if (trialError) throw trialError;
    if (!trial) return NextResponse.json({ error: 'Trial not found.' }, { status: 404 });
    if (trial.entry_status !== 'open') {
      return NextResponse.json({ error: 'Entries are not currently open.' }, { status: 403 });
    }

    const handlerEmail = text(body.handler_email, 254).toLowerCase();
    const handlerPhone = text(body.handler_phone, 64);
    if (pendingRegistration && (!handlerEmail || phoneKey(handlerPhone).length < 7)) {
      return NextResponse.json({ error: 'Email and phone number are required while waiting for a C-WAGS number.' }, { status: 400 });
    }
    const { data: registry, error: registryError } = pendingRegistration
      ? { data: null, error: null }
      : await db.from('cwags_registry').select('handler_name,dog_call_name,handler_email').eq('cwags_number', cwagsNumber).maybeSingle();
    if (registryError) throw registryError;
    if (
      registry &&
      (nameKey(registry.handler_name || '') !== nameKey(submittedHandler) ||
        nameKey(registry.dog_call_name || '') !== nameKey(submittedDog))
    ) {
      return NextResponse.json({ error: 'The registration number does not match this dog and handler.' }, { status: 409 });
    }
    const handlerName = registry?.handler_name || submittedHandler;
    const dogCallName = registry?.dog_call_name || submittedDog;

    const { data: rounds, error: roundsError } = await db
      .from('trial_rounds')
      .select(`id,round_number,max_entries,trial_classes!inner(
        class_name,entry_fee,feo_price,max_entries,games_subclass,
        trial_days!inner(trial_id,day_number,trial_date)
      )`)
      .in('id', roundIds);
    if (roundsError) throw roundsError;

    const validRounds = (rounds || []).filter((round: any) => {
      const cls = Array.isArray(round.trial_classes) ? round.trial_classes[0] : round.trial_classes;
      const day = Array.isArray(cls?.trial_days) ? cls.trial_days[0] : cls?.trial_days;
      return day?.trial_id === trialId;
    });
    if (validRounds.length !== roundIds.length) {
      return NextResponse.json({ error: 'One or more selected rounds are invalid.' }, { status: 400 });
    }

    let existingEntryQuery = db
      .from('entries')
      .select('id,entry_status,fees_waived,amount_paid,submitted_at,handler_email')
      .eq('trial_id', trialId);
    existingEntryQuery = pendingRegistration
      ? existingEntryQuery.eq('registration_pending', true).eq('cwags_number', cwagsNumber)
      : existingEntryQuery.eq('cwags_number', cwagsNumber);
    const { data: existingEntries, error: entryLookupError } = await existingEntryQuery.order('submitted_at', { ascending: true });
    if (entryLookupError) throw entryLookupError;
    const primary = existingEntries?.[0] || null;
    const verificationEmail = text(body.verification_email, 254).toLowerCase();
    const entryEmailMatches = (existingEntries || []).some(
      (entry) =>
        String(entry.handler_email || '').trim().toLowerCase() === verificationEmail
    );
    const registryEmailMatches =
      Boolean(verificationEmail) &&
      String(registry?.handler_email || '').trim().toLowerCase() === verificationEmail;
    if (primary && pendingRegistration) {
      const { data: pendingIdentity, error: pendingIdentityError } = await db
        .from('entries').select('handler_email,handler_phone,dog_call_name').eq('id', primary.id).single();
      if (pendingIdentityError) throw pendingIdentityError;
      const pendingVerified = String(pendingIdentity.handler_email || '').trim().toLowerCase() === verificationEmail &&
        phoneKey(String(pendingIdentity.handler_phone || '')) === phoneKey(text(body.verification_phone, 64)) &&
        nameKey(String(pendingIdentity.dog_call_name || '')) === nameKey(submittedDog);
      if (!pendingVerified) {
        return NextResponse.json({ error: 'The email, phone number, and dog name could not be verified.' }, { status: 403 });
      }
    } else if (primary && !entryEmailMatches && !registryEmailMatches) {
      return NextResponse.json(
        { error: 'The registration number and email could not be verified.' },
        { status: 403 }
      );
    }

    // Journal comparisons must use the database state immediately before this
    // request. The last journal snapshot can lag behind Live Event changes.
    let beforeSnapshot: Record<string, unknown> | null = null;
    if (primary) {
      const { data: beforeSelections, error: beforeError } = await db
        .from('entry_selections')
        .select(`fee,entry_status,entry_type,division,jump_height,created_at,
          trial_rounds!inner(round_number,trial_classes!inner(class_name,trial_days!inner(day_number,trial_date)))`)
        .eq('entry_id', primary.id);
      if (beforeError) throw beforeError;
      const beforeClasses = mapSnapshotClasses(beforeSelections || []);
      const beforeFee = beforeClasses.reduce(
        (sum, selection) => inactive.has(String(selection.entry_status).toLowerCase())
          ? sum
          : sum + Number(selection.fee || 0),
        0
      );
      beforeSnapshot = {
        total_fee: beforeFee,
        class_count: beforeClasses.length,
        classes: beforeClasses,
      };
    }

    if (!primary) {
      const recent = new Date(Date.now() - 60_000).toISOString();
      const { count } = await db
        .from('entries')
        .select('id', { count: 'exact', head: true })
        .eq('trial_id', trialId)
        .eq('cwags_number', cwagsNumber)
        .gte('submitted_at', recent);
      if ((count || 0) > 0) {
        return NextResponse.json({ error: 'This entry was just submitted. Please wait before resubmitting.' }, { status: 409 });
      }
    }

    const requested: RequestedSelection[] = validRounds.map((round: any) => ({
      roundId: round.id,
      entryType: feoIds.has(round.id) ? 'feo' : 'regular',
      division: text(body.division_selections?.[round.id], 32) || null,
      jumpHeight: text(body.jump_height_selections?.[round.id], 32) || null,
    }));
    const desiredIds = new Set(requested.map((selection) => selection.roundId));
    const relatedIds = (existingEntries || []).map((entry) => entry.id);
    const { data: existingSelections, error: selectionsError } = relatedIds.length
      ? await db
          .from('entry_selections')
          .select('id,entry_id,trial_round_id,entry_status,running_position,created_at')
          .in('entry_id', relatedIds)
      : { data: [], error: null };
    if (selectionsError) throw selectionsError;
    const selectionIds = (existingSelections || []).map((selection) => selection.id);
    const { data: scoreRows, error: scoreError } = selectionIds.length
      ? await db.from('scores').select('entry_selection_id').in('entry_selection_id', selectionIds)
      : { data: [], error: null };
    if (scoreError) throw scoreError;
    const scoredIds = new Set((scoreRows || []).map((score) => score.entry_selection_id));
    const protectedRoundIds = (existingSelections || [])
      .filter(
        (selection) => scoredIds.has(selection.id) && !desiredIds.has(selection.trial_round_id),
      )
      .map((selection) => selection.trial_round_id);
    if (protectedRoundIds.length) {
      return NextResponse.json(
        {
          error:
            'Rounds with recorded scores cannot be removed. Refresh the form before making other changes.',
          protectedRoundIds,
        },
        { status: 409 },
      );
    }

    const conflictIds = new Set<string>();
    const conflicts: Array<Record<string, unknown>> = [];
    for (const round of validRounds as any[]) {
      const cls = Array.isArray(round.trial_classes) ? round.trial_classes[0] : round.trial_classes;
      const capacity = Number(round.max_entries || cls?.max_entries || 0);
      if (capacity <= 0) continue;
      let query = db
        .from('entry_selections')
        .select('id', { count: 'exact', head: true })
        .eq('trial_round_id', round.id)
        .not('entry_status', 'in', '("waitlisted","withdrawn")');
      if (primary) query = query.neq('entry_id', primary.id);
      const { count, error } = await query;
      if (error) throw error;
      if ((count || 0) >= capacity) {
        conflictIds.add(round.id);
        conflicts.push({
          trial_round_id: round.id,
          class_name: cls?.class_name || 'Unknown class',
          round_number: round.round_number,
          occupied_places: count || 0,
          max_entries: capacity,
        });
      }
    }

    const entryValues = {
      handler_name: handlerName,
      dog_call_name: dogCallName,
      dog_breed: text(body.dog_breed, 120) || null,
      dog_sex: text(body.dog_sex, 32) || null,
      handler_email: text(body.handler_email, 254),
      handler_phone: text(body.handler_phone, 64) || null,
      emergency_contact: text(body.emergency_contact, 300) || null,
      is_junior_handler: body.is_junior_handler === true,
      waiver_accepted: true,
      close_to_titles: text(body.close_to_titles, 500) || null,
      volunteer_preferences:
        body.volunteer_preferences && typeof body.volunteer_preferences === 'object'
          ? body.volunteer_preferences
          : null,
      // Waitlisting is tracked per round selection. The parent entry remains a
      // valid submitted entry even when every requested round is waitlisted.
      entry_status: 'submitted',
      registration_pending: pendingRegistration,
    };

    let entryId: string;
    let isNew = false;
    if (primary) {
      entryId = primary.id;
      const { error } = await db.from('entries').update(entryValues).eq('id', entryId).eq('trial_id', trialId);
      if (error) throw error;
    } else {
      isNew = true;
      const { data: inserted, error } = await db
        .from('entries')
        .insert({
          trial_id: trialId,
          cwags_number: cwagsNumber,
          ...entryValues,
          total_fee: 0,
          amount_owed: 0,
          payment_status: 'pending',
        })
        .select('id')
        .single();
      if (error) throw error;
      entryId = inserted.id;
    }

    if (!relatedIds.includes(entryId)) relatedIds.push(entryId);
    const deletions = (existingSelections || [])
      .filter((selection) => !scoredIds.has(selection.id) && !desiredIds.has(selection.trial_round_id))
      .map((selection) => selection.id);
    const roundsToNormalize = new Set<string>(requested.map((selection) => selection.roundId));
    (existingSelections || [])
      .filter((selection) => deletions.includes(selection.id))
      .forEach((selection) => roundsToNormalize.add(selection.trial_round_id));
    if (deletions.length) {
      const { error } = await db.from('entry_selections').delete().in('id', deletions);
      if (error) throw error;
    }

    const byRound = new Map((existingSelections || []).map((selection) => [selection.trial_round_id, selection]));
    for (const desired of requested) {
      const round: any = validRounds.find((item: any) => item.id === desired.roundId);
      const cls = Array.isArray(round.trial_classes) ? round.trial_classes[0] : round.trial_classes;
      const waitlisted = conflictIds.has(desired.roundId);
      // Waitlisted selections retain their future fee; billing excludes them
      // until promotion activates the selection.
      const fee = Number(
        desired.entryType === 'feo' ? cls?.feo_price || cls?.entry_fee || 0 : cls?.entry_fee || 0
      );
      const existing = byRound.get(desired.roundId);
      if (existing) {
        if (scoredIds.has(existing.id)) continue;
        const { error } = await db.from('entry_selections').update({
          entry_type: desired.entryType,
          fee,
          entry_status: waitlisted ? 'waitlisted' : 'entered',
          running_position: waitlisted ? null : existing.running_position,
          division: desired.division,
          games_subclass: cls?.games_subclass || null,
          jump_height: desired.jumpHeight,
        }).eq('id', existing.id);
        if (error) throw error;
        continue;
      }

      let runningPosition: number | null = null;
      if (!waitlisted) {
        const { data: last, error } = await db
          .from('entry_selections')
          .select('running_position')
          .eq('trial_round_id', desired.roundId)
          .not('entry_status', 'in', '("waitlisted","withdrawn")')
          .order('running_position', { ascending: false })
          .limit(1);
        if (error) throw error;
        runningPosition = Number(last?.[0]?.running_position || 0) + 1;
      }
      const { error } = await db.from('entry_selections').insert({
        entry_id: entryId,
        trial_round_id: desired.roundId,
        entry_type: desired.entryType,
        fee,
        running_position: runningPosition,
        entry_status: waitlisted ? 'waitlisted' : 'entered',
        division: desired.division,
        games_subclass: cls?.games_subclass || null,
        jump_height: desired.jumpHeight,
      });
      if (error) throw error;
    }

    // Removing a selection must close the gap it leaves behind. Normalize all
    // touched rounds so the displayed position is the actual active ordinal,
    // not a historical maximum such as 6 when only three dogs remain.
    for (const roundId of roundsToNormalize) {
      const { data: activeSelections, error: activeError } = await db
        .from('entry_selections')
        .select('id,running_position,created_at')
        .eq('trial_round_id', roundId)
        .not('entry_status', 'in', '("waitlisted","withdrawn")')
        .order('running_position', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (activeError) throw activeError;

      for (const [index, selection] of (activeSelections || []).entries()) {
        const contiguousPosition = index + 1;
        if (selection.running_position === contiguousPosition) continue;
        const { error: positionError } = await db
          .from('entry_selections')
          .update({ running_position: contiguousPosition })
          .eq('id', selection.id);
        if (positionError) throw positionError;
      }
    }

    const { data: finalSelections, error: finalError } = await db
      .from('entry_selections')
      .select(`id,fee,entry_status,entry_type,division,jump_height,created_at,
        trial_rounds!inner(round_number,trial_classes!inner(class_name,trial_days!inner(day_number,trial_date)))`)
      .eq('entry_id', entryId);
    if (finalError) throw finalError;
    const totalFee = (finalSelections || []).reduce(
      (sum: number, selection: any) => inactive.has(String(selection.entry_status).toLowerCase())
        ? sum
        : sum + Number(selection.fee || 0),
      0
    );
    const amountOwed = primary?.fees_waived ? Number(primary.amount_paid || 0) : totalFee;
    const { error: totalError } = await db
      .from('entries')
      .update({ total_fee: totalFee, amount_owed: amountOwed })
      .eq('id', entryId);
    if (totalError) throw totalError;

    const classes = mapSnapshotClasses(finalSelections || []);
    const snapshot = {
      handler_name: handlerName,
      dog_call_name: dogCallName,
      cwags_number: cwagsNumber,
      handler_email: entryValues.handler_email,
      handler_phone: entryValues.handler_phone,
      emergency_contact: entryValues.emergency_contact,
      total_fee: totalFee,
      class_count: classes.length,
      classes,
    };
    if (isNew || !beforeSnapshot) {
      await db.from('trial_activity_log').insert({
        trial_id: trialId,
        activity_type: 'entry_submitted',
        entry_id: entryId,
        snapshot_data: snapshot,
        user_name: handlerName,
      });
    } else if (
      Number(beforeSnapshot.total_fee) !== totalFee ||
      Number(beforeSnapshot.class_count) !== classes.length ||
      snapshotClassSignature(beforeSnapshot.classes as any[]) !== snapshotClassSignature(classes)
    ) {
      await db.from('trial_activity_log').insert({
        trial_id: trialId,
        activity_type: 'entry_modified',
        entry_id: entryId,
        snapshot_data: {
          handler_name: handlerName,
          dog_call_name: dogCallName,
          cwags_number: cwagsNumber,
          before: beforeSnapshot,
          after: snapshot,
        },
        user_name: handlerName,
      });
    }

    return NextResponse.json({
      success: true,
      entryId,
      isNew,
      totalFee,
      conflicts,
      waitlistedRoundIds: [...conflictIds],
      authoritativeHandlerName: handlerName,
      authoritativeDogCallName: dogCallName,
      cwagsNumber,
      registrationPending: pendingRegistration,
    });
  } catch (error) {
    console.error('Public entry transaction failed:', error);
    return NextResponse.json(
      {
        error: 'Unable to save this entry.',
        ...(process.env.NODE_ENV === 'development'
          ? {
              detail: error instanceof Error
                ? error.message
                : JSON.stringify(error),
            }
          : {}),
      },
      { status: 500 }
    );
  }
}
