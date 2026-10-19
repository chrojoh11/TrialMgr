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

/** Display stored total seconds in the same format written on judge sheets. */
export function formatScoreTime(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const total = Number(value);
  if (!Number.isFinite(total) || total < 0) return '';
  const hundredths = Math.round(total * 100);
  const minutes = Math.floor(hundredths / 6000);
  const seconds = (hundredths - minutes * 6000) / 100;
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}
