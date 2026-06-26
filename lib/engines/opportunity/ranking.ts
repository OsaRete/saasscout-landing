import type { OpportunityCandidate } from "./types";

/** Ranks opportunity candidates by evidence-backed opportunity strength while preserving deterministic order for ties. */
export function rankOpportunityCandidates(candidates: OpportunityCandidate[]) {
  return [...candidates]
    .sort(
      (a, b) =>
        b.score.totalScore - a.score.totalScore ||
        b.score.confidenceScore - a.score.confidenceScore ||
        b.evidence.length - a.evidence.length ||
        a.id.localeCompare(b.id)
    )
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
