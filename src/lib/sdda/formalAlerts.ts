export function splitFormalAlerts(value: string | null | undefined): [string, string] {
  const parts = (value || '')
    .split(/\r?\n|[,/]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return [parts[0] || '', parts.slice(1).join(' / ')];
}

export function joinFormalAlerts(first: string, second: string) {
  return [first.trim(), second.trim()].filter(Boolean).join('\n');
}
