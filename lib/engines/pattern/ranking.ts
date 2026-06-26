import type { PatternCandidate } from "./types";

/** Ranks pattern candidates by evidence-backed score while preserving deterministic order for equal scores. */
export function rankPatternCandidates(candidates: PatternCandidate[]) {
  return [...candidates]
    .sort(
      (a, b) =>
        b.score.totalScore - a.score.totalScore ||
        b.relationships.length - a.relationships.length ||
        b.evidence.length - a.evidence.length ||
        a.id.localeCompare(b.id)
    )
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
