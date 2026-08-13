import type { SddaComponent, SddaLevel, SddaRunGroup } from './domain';

export interface SddaScheduledRun {
  id: string;
  dayIndex: number;
  level: SddaLevel;
  component: SddaComponent;
  handlerId: string;
  dogId: string;
  group: SddaRunGroup;
  order: number;
}

const GROUP_RANK: Record<SddaRunGroup, number> = {
  Official: 0,
  Regular: 1,
  'Second dog': 2,
  FEO: 3,
  BIS: 4,
};

export function orderSddaRuns<T extends SddaScheduledRun>(runs: readonly T[]): T[] {
  return [...runs].sort(
    (left, right) =>
      GROUP_RANK[left.group] - GROUP_RANK[right.group] ||
      left.order - right.order ||
      left.id.localeCompare(right.id),
  );
}

export function moveSddaRun<T>(runs: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || fromIndex >= runs.length || toIndex < 0 || toIndex >= runs.length) return [...runs];
  const next = [...runs];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export interface SddaScheduleConflict {
  kind: 'handler-overlap' | 'duplicate-dog';
  runIds: [string, string];
  message: string;
}

export function findSddaScheduleConflicts(
  runs: readonly SddaScheduledRun[],
): SddaScheduleConflict[] {
  const conflicts: SddaScheduleConflict[] = [];
  const byDay = new Map<number, SddaScheduledRun[]>();

  for (const run of runs) {
    byDay.set(run.dayIndex, [...(byDay.get(run.dayIndex) ?? []), run]);
  }

  for (const dayRuns of byDay.values()) {
    for (let leftIndex = 0; leftIndex < dayRuns.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < dayRuns.length; rightIndex += 1) {
        const left = dayRuns[leftIndex];
        const right = dayRuns[rightIndex];
        if (left.dogId === right.dogId && left.component === right.component) {
          conflicts.push({
            kind: 'duplicate-dog',
            runIds: [left.id, right.id],
            message: `Dog ${left.dogId} is scheduled twice in ${left.component} on day ${left.dayIndex + 1}.`,
          });
        } else if (
          left.handlerId === right.handlerId &&
          left.level === right.level &&
          Math.abs(left.order - right.order) <= 1
        ) {
          conflicts.push({
            kind: 'handler-overlap',
            runIds: [left.id, right.id],
            message: `Handler ${left.handlerId} has adjacent runs at ${left.level} on day ${left.dayIndex + 1}.`,
          });
        }
      }
    }
  }

  return conflicts;
}
