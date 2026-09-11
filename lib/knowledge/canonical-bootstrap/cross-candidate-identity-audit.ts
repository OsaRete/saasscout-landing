import { calculateOverlapScore, extractProblemTokens } from "../deduplication/helpers.ts";
import {
  CROSS_CANDIDATE_IDENTITY_AUDIT_RULE_VERSION,
  type BootstrapCandidateCluster,
  type CrossCandidateCollisionReason,
  type CrossCandidateIdentityAudit,
  type PotentialCanonicalCollisionPair,
} from "./types.ts";

const VERY_HIGH_OVERLAP = 8;
const STRONG_ALIAS_OVERLAP = 9;
const FULL_CONTAINMENT = 10;
const MINIMUM_IDENTITY_TOKENS = 3;
const MINIMUM_CONTAINED_TOKENS = 4;
const MAXIMUM_MODIFIER_TOKENS = 6;

const GENERIC_TOKENS = new Set(["automation", "business", "businesses", "inefficien", "manual", "operation", "operations", "small", "workflow", "workflows"]);
const CONSEQUENCE_CONNECTORS = new Set(["causing", "leading", "resulting"]);
const MORPHOLOGICAL_EQUIVALENTS = new Map([
  ["inefficiencies", "inefficien"], ["inefficiency", "inefficien"], ["inefficient", "inefficien"],
  ["operations", "operation"], ["workflows", "workflow"],
]);
const compare = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
const uniqueSorted = (values: string[]) => [...new Set(values.filter(Boolean))].sort(compare);
const canonicalTokens = (value: string) => uniqueSorted(extractProblemTokens(value).map((token) => MORPHOLOGICAL_EQUIVALENTS.get(token) || token));
const overlap = (left: string[], right: string[]) => calculateOverlapScore(left, right);
const intersection = (left: string[], right: string[]) => left.filter((token) => new Set(right).has(token));
const containment = (left: string[], right: string[]) => {
  const smaller = Math.min(left.length, right.length);
  return smaller ? Number(((intersection(left, right).length / smaller) * 10).toFixed(1)) : 0;
};

function clusterContext(candidate: BootstrapCandidateCluster) {
  return uniqueSorted(candidate.observations.map((observation) => observation.problemCluster || ""));
}

function comparePair(left: BootstrapCandidateCluster, right: BootstrapCandidateCluster): PotentialCanonicalCollisionPair | null {
  const leftTokens = canonicalTokens(left.candidateCanonicalTitle);
  const rightTokens = canonicalTokens(right.candidateCanonicalTitle);
  const shared = intersection(leftTokens, rightTokens);
  const titleTokenOverlap = overlap(leftTokens, rightTokens);
  const titleTokenContainment = containment(leftTokens, rightTokens);
  const distinctiveSharedTokens = shared.filter((token) => !GENERIC_TOKENS.has(token));
  const aliasPairs = left.aliasesPreview.flatMap((a) => right.aliasesPreview.map((b) => [canonicalTokens(a.normalizedAlias), canonicalTokens(b.normalizedAlias)] as const));
  const strongestAliasOverlap = aliasPairs.reduce((maximum, [a, b]) => Math.max(maximum, overlap(a, b)), 0);
  const leftClusters = clusterContext(left);
  const rightClusters = clusterContext(right);
  const compatibleCluster = intersection(leftClusters, rightClusters).length > 0;
  const conflictingCluster = leftClusters.length > 0 && rightClusters.length > 0 && !compatibleCluster;
  const trustedNicheOverlap = uniqueSorted(intersection(left.trustedAffectedNiches, right.trustedAffectedNiches));
  const smallerLength = Math.min(leftTokens.length, rightTokens.length);
  const largerLength = Math.max(leftTokens.length, rightTokens.length);
  const rawExtraTokens = canonicalTokens(leftTokens.length > rightTokens.length ? left.candidateCanonicalTitle : right.candidateCanonicalTitle)
    .filter((token) => !new Set(leftTokens.length > rightTokens.length ? rightTokens : leftTokens).has(token));
  const hasConsequenceConnector = extractProblemTokens(left.candidateCanonicalTitle).some((token) => CONSEQUENCE_CONNECTORS.has(token))
    || extractProblemTokens(right.candidateCanonicalTitle).some((token) => CONSEQUENCE_CONNECTORS.has(token));
  const largerCandidate = leftTokens.length > rightTokens.length ? left : right;
  const trustedSegmentTokens = canonicalTokens(largerCandidate.trustedAffectedNiches.join(" "));
  const segmentQualified = rawExtraTokens.length > 0 && rawExtraTokens.every((token) => trustedSegmentTokens.includes(token)) && (compatibleCluster || trustedNicheOverlap.length > 0);
  const nearIdentity = titleTokenOverlap >= VERY_HIGH_OVERLAP && shared.length >= MINIMUM_IDENTITY_TOKENS && distinctiveSharedTokens.length > 0;
  const modifierContainment = titleTokenContainment === FULL_CONTAINMENT
    && smallerLength >= MINIMUM_CONTAINED_TOKENS
    && largerLength - smallerLength <= MAXIMUM_MODIFIER_TOKENS
    && distinctiveSharedTokens.length > 0
    && hasConsequenceConnector;
  const aliasIdentity = strongestAliasOverlap >= STRONG_ALIAS_OVERLAP && shared.length >= MINIMUM_IDENTITY_TOKENS && distinctiveSharedTokens.length > 0;
  if (!nearIdentity && !modifierContainment && !aliasIdentity && !segmentQualified) return null;

  const reasons = new Set<CrossCandidateCollisionReason>();
  if (titleTokenOverlap >= VERY_HIGH_OVERLAP) reasons.add("very_high_title_overlap");
  if (nearIdentity) reasons.add("normalized_token_near_identity");
  if (modifierContainment) reasons.add("title_containment_with_modifier");
  if (aliasIdentity) reasons.add("strong_alias_overlap");
  if (segmentQualified) reasons.add("segment_qualified_variant");
  if (compatibleCluster) reasons.add("compatible_problem_cluster");
  if (conflictingCluster) reasons.add("conflicting_problem_cluster");
  if (trustedNicheOverlap.length) reasons.add("trusted_niche_corroboration");
  if (left.activationDisposition !== right.activationDisposition) reasons.add("auto_candidate_matches_blocked_candidate");
  return {
    candidateAId: left.candidateId, candidateBId: right.candidateId,
    candidateATitle: left.candidateCanonicalTitle, candidateBTitle: right.candidateCanonicalTitle,
    candidateABaseActivationDisposition: left.activationDisposition, candidateBBaseActivationDisposition: right.activationDisposition,
    reasons: [...reasons].sort(compare),
    metrics: { titleTokenOverlap, titleTokenContainment, strongestAliasOverlap, sharedTitleTokens: shared.length },
    context: { problemClusterRelationship: compatibleCluster ? "compatible" : conflictingCluster ? "conflicting" : "unavailable", trustedNicheOverlap },
  };
}

function collisionGroups(pairs: PotentialCanonicalCollisionPair[]) {
  const adjacency = new Map<string, Set<string>>();
  for (const pair of pairs) {
    if (!adjacency.has(pair.candidateAId)) adjacency.set(pair.candidateAId, new Set());
    if (!adjacency.has(pair.candidateBId)) adjacency.set(pair.candidateBId, new Set());
    adjacency.get(pair.candidateAId)?.add(pair.candidateBId);
    adjacency.get(pair.candidateBId)?.add(pair.candidateAId);
  }
  const visited = new Set<string>();
  const groups: string[][] = [];
  for (const start of [...adjacency.keys()].sort(compare)) {
    if (visited.has(start)) continue;
    const pending = [start];
    const group: string[] = [];
    while (pending.length) {
      const current = pending.shift() as string;
      if (visited.has(current)) continue;
      visited.add(current);
      group.push(current);
      pending.push(...[...(adjacency.get(current) || [])].filter((id) => !visited.has(id)).sort(compare));
    }
    groups.push(group.sort(compare));
  }
  return groups.sort((a, b) => compare(a[0], b[0]));
}

/** Post-cluster, review-only audit. It changes no membership and makes no merge decision. */
export function auditCrossCandidateIdentities(candidates: readonly BootstrapCandidateCluster[]): { audit: CrossCandidateIdentityAudit; clusters: BootstrapCandidateCluster[] } {
  const sorted = [...candidates].sort((a, b) => compare(a.candidateId, b.candidateId));
  const eligiblePartners = sorted.filter((candidate) => candidate.activationDisposition === "auto_activatable" || candidate.disposition !== "singleton");
  const comparisons: Array<[BootstrapCandidateCluster, BootstrapCandidateCluster]> = [];
  for (let index = 0; index < eligiblePartners.length; index += 1) for (const right of eligiblePartners.slice(index + 1)) {
    const left = eligiblePartners[index];
    if (left.activationDisposition === "auto_activatable" || right.activationDisposition === "auto_activatable") comparisons.push([left, right]);
  }
  const pairs = comparisons.map(([left, right]) => comparePair(left, right)).filter((pair): pair is PotentialCanonicalCollisionPair => pair !== null);
  const collided = new Set(pairs.flatMap((pair) => [pair.candidateAId, pair.candidateBId]));
  const auto = sorted.filter((candidate) => candidate.activationDisposition === "auto_activatable").map((candidate) => candidate.candidateId);
  const blockedAuto = auto.filter((id) => collided.has(id));
  const clearlyUnique = auto.filter((id) => !collided.has(id));
  const autoMatchingBlocked = uniqueSorted(pairs.filter((pair) => pair.reasons.includes("auto_candidate_matches_blocked_candidate"))
    .flatMap((pair) => pair.candidateABaseActivationDisposition === "auto_activatable" ? [pair.candidateAId] : [pair.candidateBId]));
  const clusters = sorted.map((candidate) => {
    if (candidate.activationDisposition !== "auto_activatable") return { ...candidate, crossCandidateAuditDisposition: collided.has(candidate.candidateId) ? "potential_canonical_collision" as const : "not_applicable" as const, finalActivationDisposition: "blocked_for_review" as const };
    const collision = collided.has(candidate.candidateId);
    return { ...candidate, crossCandidateAuditDisposition: collision ? "potential_canonical_collision" as const : "clearly_unique" as const, finalActivationDisposition: collision ? "blocked_for_review" as const : "auto_activatable" as const };
  });
  return { audit: { ruleVersion: CROSS_CANDIDATE_IDENTITY_AUDIT_RULE_VERSION, candidatesAudited: eligiblePartners.length, pairComparisons: comparisons.length, potentialCollisionPairs: pairs, potentialCollisionGroups: collisionGroups(pairs), clearlyUniqueAutoActivatableCandidateIds: clearlyUnique, blockedAutoActivatableCandidateIds: blockedAuto, autoCandidatesMatchingBlockedCandidateIds: autoMatchingBlocked }, clusters };
}
