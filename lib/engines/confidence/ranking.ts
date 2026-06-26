import type { ConfidenceCandidate } from "./types";

/** Ranks confidence candidates by trustworthiness so future orchestrators can prefer well-supported intelligence. */
export function rankConfidenceCandidates(candidates: ConfidenceCandidate[]) {
  return [...candidates]
    .sort((a, b) => b.score.totalScore - a.score.totalScore || b.evidence.length - a.evidence.length || a.title.localeCompare(b.title))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
