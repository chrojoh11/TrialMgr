export type SddaScentResultCandidate = {
  id: string;
  result: string;
  score: number | null;
  timeSeconds: number | null;
  runGroup: string;
};

export type SddaGameResultCandidate = {
  id: string;
  result: string;
  timeSeconds: number | null;
  entryType: string;
};

export type RankedResult<T> = T & { placement: number };

export type SddaHighInTrialCandidate = SddaScentResultCandidate & {
  dogId: string;
  dayNumber: number;
  level: string;
  component: string;
};

export type SddaHighInTrialResult<T> = {
  dogId: string;
  dayNumber: number;
  level: string;
  runs: T[];
  totalScore: number;
  maximumScore: number;
  scorePercentage: number;
  totalTimeSeconds: number;
  maximumTimeSeconds: number;
  timePercentage: number;
  placement: number;
};

const HIGH_IN_TRIAL_LIMITS: Record<string, Record<string, { maximumScore: number; maximumTimeSeconds: number }>> = {
  Started: {
    Container: { maximumScore: 30, maximumTimeSeconds: 180 },
    Interior: { maximumScore: 40, maximumTimeSeconds: 300 },
    Exterior: { maximumScore: 30, maximumTimeSeconds: 300 },
  },
  Advanced: {
    Container: { maximumScore: 60, maximumTimeSeconds: 180 },
    Interior: { maximumScore: 80, maximumTimeSeconds: 300 },
    Exterior: { maximumScore: 60, maximumTimeSeconds: 300 },
  },
  Excellent: {
    Container: { maximumScore: 60, maximumTimeSeconds: 180 },
    Interior: { maximumScore: 80, maximumTimeSeconds: 900 },
    Exterior: { maximumScore: 60, maximumTimeSeconds: 300 },
  },
};

/**
 * Rank SDDA High in Trial teams. A team must qualify in Container, Interior,
 * and Exterior at the same level and trial day. Amateur and Working runs are
 * combined; FEO and Elite runs are not eligible.
 */
export function rankSddaHighInTrial<T extends SddaHighInTrialCandidate>(rows: T[]): SddaHighInTrialResult<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    if (!HIGH_IN_TRIAL_LIMITS[row.level] || row.runGroup.toLowerCase() === 'feo') continue;
    const key = `${row.dayNumber}|${row.level}|${row.dogId}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }

  const eligible: Omit<SddaHighInTrialResult<T>, 'placement'>[] = [];
  for (const runs of groups.values()) {
    const sample = runs[0];
    const componentRuns = ['Container', 'Interior', 'Exterior'].map((component) =>
      runs.find((run) => run.component === component && run.result === 'qualifying' && run.score !== null && run.timeSeconds !== null),
    );
    if (componentRuns.some((run) => !run)) continue;
    const completeRuns = componentRuns as T[];
    const limits = HIGH_IN_TRIAL_LIMITS[sample.level];
    const totalScore = completeRuns.reduce((sum, run) => sum + run.score!, 0);
    const maximumScore = completeRuns.reduce((sum, run) => sum + limits[run.component].maximumScore, 0);
    const totalTimeSeconds = completeRuns.reduce((sum, run) => sum + run.timeSeconds!, 0);
    const maximumTimeSeconds = completeRuns.reduce((sum, run) => sum + limits[run.component].maximumTimeSeconds, 0);
    eligible.push({
      dogId: sample.dogId,
      dayNumber: sample.dayNumber,
      level: sample.level,
      runs: completeRuns,
      totalScore,
      maximumScore,
      scorePercentage: totalScore / maximumScore,
      totalTimeSeconds,
      maximumTimeSeconds,
      timePercentage: totalTimeSeconds / maximumTimeSeconds,
    });
  }

  const byDay = new Map<number, typeof eligible>();
  for (const row of eligible) byDay.set(row.dayNumber, [...(byDay.get(row.dayNumber) || []), row]);
  const ranked: SddaHighInTrialResult<T>[] = [];
  for (const dayNumber of [...byDay.keys()].sort((left, right) => left - right)) {
    const dayRows = byDay.get(dayNumber)!;
    dayRows.sort((left, right) =>
      (right.scorePercentage - left.scorePercentage) ||
      (left.timePercentage - right.timePercentage) ||
      left.dogId.localeCompare(right.dogId),
    );
    let previous: (typeof eligible)[number] | null = null;
    let previousRank = 0;
    dayRows.forEach((row, index) => {
      const tied = previous !== null && row.scorePercentage === previous.scorePercentage && row.timePercentage === previous.timePercentage;
      const placement = tied ? previousRank : index + 1;
      previous = row;
      previousRank = placement;
      ranked.push({ ...row, placement });
    });
  }
  return ranked;
}

export function rankSddaScentResults<T extends SddaScentResultCandidate>(rows: T[]): RankedResult<T>[] {
  const eligible = rows
    .filter((row) => row.result === 'qualifying' && row.runGroup.toLowerCase() !== 'feo' && row.score !== null && row.timeSeconds !== null)
    .sort((left, right) => (right.score! - left.score!) || (left.timeSeconds! - right.timeSeconds!));
  let previous: T | null = null;
  let previousRank = 0;
  return eligible.map((row, index) => {
    const tied = previous !== null && row.score === previous.score && row.timeSeconds === previous.timeSeconds;
    const placement = tied ? previousRank : index + 1;
    previous = row; previousRank = placement;
    return { ...row, placement };
  });
}

export function rankSddaGameResults<T extends SddaGameResultCandidate>(rows: T[]): RankedResult<T>[] {
  const eligible = rows
    .filter((row) => row.result === 'pass' && row.entryType.toLowerCase() !== 'feo' && row.timeSeconds !== null)
    .sort((left, right) => left.timeSeconds! - right.timeSeconds!);
  let previous: T | null = null;
  let previousRank = 0;
  return eligible.map((row, index) => {
    const tied = previous !== null && row.timeSeconds === previous.timeSeconds;
    const placement = tied ? previousRank : index + 1;
    previous = row; previousRank = placement;
    return { ...row, placement };
  });
}
