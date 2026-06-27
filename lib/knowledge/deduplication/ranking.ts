import type { ProblemConsolidationGroup, ProblemDeduplicationCandidate } from "./types";

/** Ranks candidates by evidence depth and confidence so canonical identities prefer the strongest accumulated knowledge. */
export function rankProblemCandidates(candidates: ProblemDeduplicationCandidate[]) {
  return [...candidates].sort((a, b) => b.evidenceFingerprints.length - a.evidenceFingerprints.length || b.confidenceScore - a.confidenceScore || a.title.localeCompare(b.title));
}

/** Ranks consolidation groups by total evidence support so future orchestrators can prioritize highest-impact deduplication work. */
export function rankConsolidationGroups(groups: ProblemConsolidationGroup[]) {
  return [...groups].sort((a, b) => b.evidenceFingerprints.length - a.evidenceFingerprints.length || b.canonical.confidenceScore - a.canonical.confidenceScore);
}
