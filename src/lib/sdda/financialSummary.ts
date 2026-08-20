export interface TrialPricing {
  scentComponentFeeCents: number;
  scentThreeComponentFeeCents: number;
  eliteFeeCents: number;
}

interface ScentRun { trial_day_id: string; level: string }
interface GameRun { offering_id: string; entry_type: string }
interface FinancialEntry {
  id: string;
  confirmation_status: string;
  sdda_runs?: ScentRun[];
  sdda_game_runs?: GameRun[];
}
interface GameOffering { id: string; entry_fee_cents: number; feo_fee_cents: number }

export function acceptedEntryChargeCents(
  entry: FinancialEntry,
  pricing: TrialPricing,
  gameOfferings: GameOffering[],
) {
  if (entry.confirmation_status !== 'accepted') return 0;
  const games = new Map(gameOfferings.map((offering) => [offering.id, offering]));
  const grouped = new Map<string, ScentRun[]>();
  for (const run of entry.sdda_runs || []) {
    const key = `${run.trial_day_id}|${run.level}`;
    grouped.set(key, [...(grouped.get(key) || []), run]);
  }
  let total = 0;
  for (const runs of grouped.values()) {
    if (runs[0]?.level === 'Elite') total += pricing.eliteFeeCents;
    else if (runs.length === 3 && pricing.scentThreeComponentFeeCents > 0)
      total += pricing.scentThreeComponentFeeCents;
    else total += runs.length * pricing.scentComponentFeeCents;
  }
  for (const run of entry.sdda_game_runs || []) {
    const offering = games.get(run.offering_id);
    if (offering) total += run.entry_type === 'FEO' ? offering.feo_fee_cents : offering.entry_fee_cents;
  }
  return total;
}

export function sddaRemittanceCents(entries: FinancialEntry[], trialDayCount: number) {
  let standardRuns = 0;
  let gameRuns = 0;
  const eliteDogs = new Set<string>();
  for (const entry of entries.filter((item) => item.confirmation_status === 'accepted')) {
    for (const run of entry.sdda_runs || []) {
      if (run.level === 'Elite') eliteDogs.add(`${entry.id}|${run.trial_day_id}`);
      else standardRuns += 1;
    }
    gameRuns += entry.sdda_game_runs?.length || 0;
  }
  return trialDayCount * 5000 + (standardRuns + gameRuns) * 500 + eliteDogs.size * 1000;
}

export function minimumJudgeFeeCents(standardRuns: number, gameRuns: number) {
  return Math.max(20000, standardRuns * 300 + gameRuns * 200);
}
