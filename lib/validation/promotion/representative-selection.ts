import type { EvidenceSpecificity, RepresentativeCandidate, RepresentativeSelection } from "./types.ts";
const order: Record<EvidenceSpecificity, number> = { commercial_behavior: 0, observed_behavior: 1, reported_past_behavior: 2, workaround_resource_allocation: 3, frequency_severity: 4, structured_opinion: 5 };
const key = (candidate: RepresentativeCandidate) => `${candidate.independenceUnit.kind}:${candidate.independenceUnit.privateId}|${candidate.canonicalProblemId}|${candidate.polarity}`;
const codePointCompare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const compare = (a: RepresentativeCandidate, b: RepresentativeCandidate) => order[a.specificity] - order[b.specificity] || (a.targetRelevance === b.targetRelevance ? 0 : a.targetRelevance === "established" ? -1 : 1) || (a.statementKind === b.statementKind ? 0 : a.statementKind === "direct_quote" ? -1 : 1) || b.contentLength - a.contentLength || codePointCompare(b.observedAt, a.observedAt) || codePointCompare(a.observationId, b.observationId);
export function selectValidationRepresentatives(candidates: RepresentativeCandidate[]): RepresentativeSelection[] {
  const groups = new Map<string, RepresentativeCandidate[]>();
  for (const candidate of candidates) groups.set(key(candidate), [...(groups.get(key(candidate)) ?? []), candidate]);
  return [...groups.entries()].sort(([a], [b]) => codePointCompare(a, b)).map(([groupKey, members]) => { const sorted = [...members].sort(compare); return { groupKey, representativeObservationId: sorted[0].observationId, memberObservationIds: members.map((item) => item.observationId).sort(codePointCompare) }; });
}
