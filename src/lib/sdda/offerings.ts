export const SDDA_LEVELS = ['Started', 'Advanced', 'Excellent', 'Elite'] as const;
export const SDDA_COMPONENTS = ['Container', 'Interior', 'Exterior'] as const;
export const SDDA_STREAMS = ['Amateur', 'Working'] as const;

export type SddaLevel = (typeof SDDA_LEVELS)[number];
export type SddaComponent = (typeof SDDA_COMPONENTS)[number];
export type SddaStream = (typeof SDDA_STREAMS)[number];

export interface SddaOfferingSelection {
  trialDayId: string;
  level: SddaLevel;
  component: SddaComponent;
  stream: SddaStream;
}

export function offeringKey(selection: SddaOfferingSelection) {
  return [selection.trialDayId, selection.level, selection.component, selection.stream].join('|');
}

export function parseOfferingKey(value: string): SddaOfferingSelection {
  const [trialDayId, level, component, stream] = value.split('|');
  if (!trialDayId || !SDDA_LEVELS.includes(level as SddaLevel) ||
      !SDDA_COMPONENTS.includes(component as SddaComponent) ||
      !SDDA_STREAMS.includes(stream as SddaStream)) {
    throw new Error('Invalid SDDA offering selection.');
  }
  return { trialDayId, level: level as SddaLevel, component: component as SddaComponent, stream: stream as SddaStream };
}
