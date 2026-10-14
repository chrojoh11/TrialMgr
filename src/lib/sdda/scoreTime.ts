/** Parse total seconds ("72.77") or judge-style time ("1:12.77"). */
export function parseScoreTime(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.includes(':')) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : Number.NaN;
  }
  const match = trimmed.match(/^(\d+):([0-5]?\d(?:\.\d+)?)$/);
  if (!match) return Number.NaN;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) return Number.NaN;
  return minutes * 60 + seconds;
}
