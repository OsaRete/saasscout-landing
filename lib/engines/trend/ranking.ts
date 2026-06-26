import type { TrendCandidate } from "./types";

/** Ranks trend candidates by temporal market movement while preserving deterministic order for equal scores. */
export function rankTrendCandidates(candidates: TrendCandidate[]) {
  return [...candidates]
    .sort(
      (a, b) =>
        b.score.totalScore - a.score.totalScore ||
        b.timeWindows.length - a.timeWindows.length ||
        b.evidence.length - a.evidence.length ||
        a.id.localeCompare(b.id)
    )
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
