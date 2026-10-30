export function splitFormalAlerts(value: string | null | undefined): [string, string] {
  const parts = (value || '')
    .split(/\r?\n|[,/]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return [parts[0] || '', parts.slice(1).join(' / ')];
}

export function joinFormalAlerts(first: string, second: string) {
  return [first.trim(), second.trim()].filter((value) => value && value !== '__custom__').join('\n');
}

// Common descriptions seen in recent TrialDesk entries and club entry forms.
// The entry UI retains an Other option for uncommon trained alerts.
export const SDDA_FORMAL_ALERT_OPTIONS = [
  'Focus at source',
  'Nose freeze',
  'Nose touch',
  'Look at handler',
  'Freeze',
  'Sit',
  'Lie down',
  'Paw touch',
  'Bark or bay',
] as const;

export function isStandardFormalAlert(value: string) {
  return (SDDA_FORMAL_ALERT_OPTIONS as readonly string[]).includes(value);
}
