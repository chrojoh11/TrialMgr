export type PublicEntryAvailability = 'upcoming' | 'open' | 'closed' | 'unavailable';

export function publicEntryAvailability(
  timing: {
    status: string;
    entry_open_at?: string | null;
    entry_close_at?: string | null;
  },
  now: number
): PublicEntryAvailability {
  const opensAt = timing.entry_open_at ? new Date(timing.entry_open_at).getTime() : Number.NaN;
  const closesAt = timing.entry_close_at ? new Date(timing.entry_close_at).getTime() : Number.NaN;

  if (timing.status === 'completed' || (Number.isFinite(closesAt) && now > closesAt))
    return 'closed';
  if (timing.status !== 'entries_open') return 'unavailable';
  if (Number.isFinite(opensAt) && now < opensAt) return 'upcoming';
  return 'open';
}
