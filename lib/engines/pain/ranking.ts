import type { PainCandidate } from "./types";

/** Ranks pain candidates by evidence-backed score while keeping ordering deterministic for equal scores. */
export function rankPainCandidates(candidates: PainCandidate[]) {
  return [...candidates]
    .sort((a, b) => b.score.totalScore - a.score.totalScore || b.evidence.length - a.evidence.length || a.id.localeCompare(b.id))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
