import { uniqueSorted } from "./helpers";
import type { ProblemCanonicalIdentity, ProblemDeduplicationCandidate } from "./types";

/** Connects a canonical problem to aliases so future Knowledge services can preserve wording diversity without fragmenting intelligence. */
export function createProblemAliasLinks(canonical: ProblemCanonicalIdentity) {
  return canonical.aliases.map((alias) => ({ canonicalId: canonical.id, aliasId: alias.id, aliasFingerprint: alias.fingerprint }));
}

/** Aggregates evidence fingerprints for a canonical problem so future persistence can attach all supporting evidence to one identity. */
export function collectCanonicalEvidenceFingerprints(candidates: ProblemDeduplicationCandidate[]) {
  return uniqueSorted(candidates.flatMap((candidate) => candidate.evidenceFingerprints));
}

/** Aggregates market labels linked to candidate variants so future intelligence can reason about market spread. */
export function collectCanonicalMarkets(candidates: ProblemDeduplicationCandidate[]) {
  return uniqueSorted(candidates.map((candidate) => candidate.market));
}

/** Aggregates audience labels linked to candidate variants so future intelligence can reason about who shares the same pain. */
export function collectCanonicalAudiences(candidates: ProblemDeduplicationCandidate[]) {
  return uniqueSorted(candidates.map((candidate) => candidate.audience));
}

/** Aggregates engine relationship identifiers that connect canonical problems to pain, pattern, trend, opportunity, confidence and feedback signals. */
export function collectCanonicalSignalLinks(candidates: ProblemDeduplicationCandidate[]) {
  return {
    painCandidateIds: uniqueSorted(candidates.flatMap((candidate) => candidate.painCandidateIds)),
    patternCandidateIds: uniqueSorted(candidates.flatMap((candidate) => candidate.patternCandidateIds)),
    trendCandidateIds: uniqueSorted(candidates.flatMap((candidate) => candidate.trendCandidateIds)),
    opportunityCandidateIds: uniqueSorted(candidates.flatMap((candidate) => candidate.opportunityCandidateIds)),
    confidenceCandidateIds: uniqueSorted(candidates.flatMap((candidate) => candidate.confidenceCandidateIds)),
    feedbackEventIds: uniqueSorted(candidates.flatMap((candidate) => candidate.feedbackEventIds)),
  };
}
