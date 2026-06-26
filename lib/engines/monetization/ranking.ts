import type { MonetizationCandidate } from "./types";

/** Ranks monetization candidates by business viability while preserving deterministic tie-breaking. */
export function rankMonetizationCandidates(candidates: MonetizationCandidate[]) {
  return [...candidates]
    .sort((a, b) => b.score.totalScore - a.score.totalScore || b.score.willingnessToPayScore - a.score.willingnessToPayScore || b.evidence.length - a.evidence.length || a.id.localeCompare(b.id))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
