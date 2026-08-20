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
