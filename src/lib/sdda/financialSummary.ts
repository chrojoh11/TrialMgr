export interface TrialPricing {
  scentComponentFeeCents: number;
  scentThreeComponentFeeCents: number;
  eliteFeeCents: number;
}

interface ScentRun {
  trial_day_id: string;
  level: string;
}
interface GameRun {
  offering_id: string;
  entry_type: string;
}
interface FinancialEntry {
  id: string;
  confirmation_status: string;
  sdda_runs?: ScentRun[];
  sdda_game_runs?: GameRun[];
}
interface GameOffering {
  id: string;
  entry_fee_cents: number;
  feo_fee_cents: number;
}

export function acceptedEntryChargeCents(
  entry: FinancialEntry,
  pricing: TrialPricing,
  gameOfferings: GameOffering[]
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
    if (offering)
      total += run.entry_type === 'FEO' ? offering.feo_fee_cents : offering.entry_fee_cents;
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

export interface LedgerItem {
  entry_id?: string | null;
  transaction_type: string;
  amount_cents: number;
}

/** Signed change to the amount an entrant owes; expenses never change it. */
export function financialBalanceDelta(item: LedgerItem): number {
  const amount = Number(item.amount_cents) || 0;
  if (['payment', 'waiver'].includes(item.transaction_type)) return -amount;
  if (['entry_fee', 'adjustment', 'refund', 'waiver_restore'].includes(item.transaction_type))
    return amount;
  return 0;
}

export function financialLedgerTotals(items: LedgerItem[]) {
  return items.reduce(
    (sum, item) => {
      const amount = Number(item.amount_cents) || 0;
      if (['entry_fee', 'adjustment'].includes(item.transaction_type)) sum.adjustments += amount;
      if (item.transaction_type === 'waiver') sum.waived += amount;
      if (item.transaction_type === 'waiver_restore') sum.waived -= amount;
      if (item.transaction_type === 'payment') sum.payments += amount;
      if (item.transaction_type === 'refund') sum.refunds += amount;
      if (['expense', 'judge', 'volunteer', 'sdda_fee'].includes(item.transaction_type))
        sum.expenses += amount;
      return sum;
    },
    { adjustments: 0, waived: 0, payments: 0, refunds: 0, expenses: 0 }
  );
}

export function financialEntryBalance(automatic: number, items: LedgerItem[]) {
  const totals = financialLedgerTotals(items);
  const charges = automatic + totals.adjustments;
  const paid = totals.payments - totals.refunds;
  const balance = charges - totals.waived - paid;
  const status =
    balance < 0
      ? 'Credit'
      : balance > 0
        ? paid > 0
          ? 'Part paid'
          : 'Unpaid'
        : totals.waived > 0
          ? 'Waived / settled'
          : 'Settled';
  return { ...totals, automatic, charges, paid, balance, status };
}

/** Email plus handler identity: never infer ownership from a dog's registration. */
export function financialHandlerKey(entry: {
  id: string;
  handler_email?: string | null;
  handler_name: string;
}) {
  const email = entry.handler_email?.trim().toLowerCase();
  const name = entry.handler_name.trim().toLowerCase().replace(/\s+/g, ' ');
  return email ? `${email}|${name}` : `entry:${entry.id}`;
}

export function allocateHandlerPayment(amount: number, entries: { id: string; balance: number }[]) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || entries.length === 0)
    throw new Error('Choose entries and a positive payment.');
  let remaining = amount;
  const allocations: { entryId: string; amountCents: number }[] = [];
  for (const entry of entries) {
    const value = Math.min(remaining, Math.max(0, entry.balance));
    if (value) allocations.push({ entryId: entry.id, amountCents: value });
    remaining -= value;
  }
  // Preserve overpayments as credit on the last dog, never discard money.
  if (remaining) {
    const lastId = entries[entries.length - 1].id;
    const last = allocations.find((item) => item.entryId === lastId);
    if (last) last.amountCents += remaining;
    else allocations.push({ entryId: lastId, amountCents: remaining });
  }
  return allocations;
}
