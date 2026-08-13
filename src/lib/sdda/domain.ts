export const SDDA_LEVELS = ['Started', 'Advanced', 'Excellent', 'Elite'] as const;
export type SddaLevel = (typeof SDDA_LEVELS)[number];

export const SDDA_COMPONENTS = ['Container', 'Interior', 'Exterior'] as const;
export type SddaComponent = (typeof SDDA_COMPONENTS)[number];

export const SDDA_STREAMS = ['Amateur', 'Working'] as const;
export type SddaStream = (typeof SDDA_STREAMS)[number];

export const SDDA_RUN_GROUPS = [
  'Official',
  'Regular',
  'Second dog',
  'FEO',
  'BIS',
] as const;
export type SddaRunGroup = (typeof SDDA_RUN_GROUPS)[number];

export const SDDA_TRIAL_DAY_LIMITS = { min: 1, max: 4 } as const;

const NEXT_LEVEL: Partial<Record<SddaLevel, SddaLevel>> = {
  Started: 'Advanced',
  Advanced: 'Excellent',
};

export function isValidTrialDayCount(dayCount: number): boolean {
  return Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= 4;
}

export function nextMoveUpLevel(level: SddaLevel): SddaLevel | null {
  return NEXT_LEVEL[level] ?? null;
}

export function canMoveUpComponent(input: {
  fromDayIndex: number;
  toDayIndex: number;
  level: SddaLevel;
  qualified: boolean;
  registeredForNextDay: boolean;
  capacityAvailable: boolean;
  hostApproved: boolean;
}): boolean {
  return (
    input.toDayIndex === input.fromDayIndex + 1 &&
    nextMoveUpLevel(input.level) !== null &&
    input.qualified &&
    input.registeredForNextDay &&
    input.capacityAvailable &&
    input.hostApproved
  );
}
