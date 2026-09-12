import { extractProblemTokens, normalizeProblemText } from "../deduplication/helpers.ts";
import {
  CAUSE_CONSEQUENCE_IDENTITY_AUDIT_RULE_VERSION,
  type BootstrapCandidateCluster,
  type CauseConsequenceCollisionReason,
  type CauseConsequenceIdentityAudit,
  type PotentialCauseConsequenceCollisionPair,
} from "./types.ts";

const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const uniqueSorted = (values: string[]) => [...new Set(values.filter(Boolean))].sort(compare);
const GENERIC_TOKENS = new Set(["automation", "business", "businesses", "gap", "gaps", "inefficiency", "inefficiencies", "manual", "operation", "operations", "problem", "problems", "process", "processes", "workflow", "workflows"]);
const MORPHOLOGY = new Map([ ["leads", "lead"], ["operations", "operation"], ["processes", "process"], ["tasks", "task"], ["workflows", "workflow"] ]);
const CONNECTORS = ["resulting in", "leading to", "caused by", "results in", "leads to", "due to", "causing", "causes", "from"] as const;

const tokens = (value: string) => uniqueSorted(extractProblemTokens(value).map((token) => MORPHOLOGY.get(token) || token));
const intersection = (left: string[], right: string[]) => left.filter((token) => new Set(right).has(token));

function causalParts(title: string) {
  const normalized = normalizeProblemText(title);
  for (const connector of CONNECTORS) {
    const marker = ` ${connector} `;
    const index = normalized.indexOf(marker);
    if (index < 0) continue;
    const before = tokens(normalized.slice(0, index));
    const after = tokens(normalized.slice(index + marker.length));
    const consequenceFirst = connector === "due to" || connector === "caused by" || connector === "from";
    return consequenceFirst ? { cause: after, consequence: before, consequenceFirst } : { cause: before, consequence: after, consequenceFirst };
  }
  return null;
}

function comparePair(left: BootstrapCandidateCluster, right: BootstrapCandidateCluster): PotentialCauseConsequenceCollisionPair | null {
  const leftParts = causalParts(left.candidateCanonicalTitle);
  const rightParts = causalParts(right.candidateCanonicalTitle);
  if (!leftParts || !rightParts || leftParts.consequenceFirst === rightParts.consequenceFirst) return null;
  const causeSideOverlap = uniqueSorted(intersection(leftParts.cause, rightParts.cause));
  const consequenceSideOverlap = uniqueSorted(intersection(leftParts.consequence, rightParts.consequence));
  const specificCause = causeSideOverlap.filter((token) => !GENERIC_TOKENS.has(token));
  const specificConsequence = consequenceSideOverlap.filter((token) => !GENERIC_TOKENS.has(token));
  const sharedSpecificTokens = uniqueSorted([...specificCause, ...specificConsequence]);
  if (causeSideOverlap.length < 2 || specificCause.length < 1 || consequenceSideOverlap.length < 3 || specificConsequence.length < 3 || sharedSpecificTokens.length < 4) return null;

  const leftClusters = uniqueSorted(left.observations.map((item) => item.problemCluster || ""));
  const rightClusters = uniqueSorted(right.observations.map((item) => item.problemCluster || ""));
  const compatible = intersection(leftClusters, rightClusters).length > 0;
  const conflicting = leftClusters.length > 0 && rightClusters.length > 0 && !compatible;
  const trustedNicheOverlap = uniqueSorted(intersection(left.trustedAffectedNiches, right.trustedAffectedNiches));
  const reasons = new Set<CauseConsequenceCollisionReason>(["cause_consequence_reversal", "shared_specific_cause_identity", "shared_specific_consequence_identity", "strong_specific_token_overlap"]);
  if (compatible) reasons.add("compatible_problem_cluster");
  if (trustedNicheOverlap.length) reasons.add("trusted_niche_corroboration");
  if (left.finalActivationDisposition !== right.finalActivationDisposition) reasons.add("auto_candidate_matches_blocked_causal_family");
  return { candidateAId: left.candidateId, candidateBId: right.candidateId, candidateATitle: left.candidateCanonicalTitle, candidateBTitle: right.candidateCanonicalTitle,
    candidateAPriorDisposition: left.finalActivationDisposition, candidateBPriorDisposition: right.finalActivationDisposition, reasons: [...reasons].sort(compare), sharedSpecificTokens,
    causeSideOverlap, consequenceSideOverlap, trustedNicheOverlap, problemClusterRelationship: compatible ? "compatible" : conflicting ? "conflicting" : "unavailable" };
}

/** Final pure safety layer: it can only preserve or reduce B0.1.2 auto eligibility. */
export function auditCauseConsequenceIdentities(candidates: readonly BootstrapCandidateCluster[]): { audit: CauseConsequenceIdentityAudit; clusters: BootstrapCandidateCluster[] } {
  const sorted = [...candidates].sort((a, b) => compare(a.candidateId, b.candidateId));
  const comparable = sorted.filter((candidate) => candidate.disposition !== "singleton");
  const comparisons: Array<[BootstrapCandidateCluster, BootstrapCandidateCluster]> = [];
  for (let index = 0; index < comparable.length; index += 1) for (const right of comparable.slice(index + 1)) {
    const left = comparable[index];
    if (left.finalActivationDisposition === "auto_activatable" || right.finalActivationDisposition === "auto_activatable") comparisons.push([left, right]);
  }
  const pairs = comparisons.map(([left, right]) => comparePair(left, right)).filter((pair): pair is PotentialCauseConsequenceCollisionPair => pair !== null);
  const collided = new Set(pairs.flatMap((pair) => [pair.candidateAId, pair.candidateBId]));
  const initiallyAuto = sorted.filter((candidate) => candidate.finalActivationDisposition === "auto_activatable").map((candidate) => candidate.candidateId);
  const blockedInitiallyAutoCandidateIds = initiallyAuto.filter((id) => collided.has(id));
  const clearlyUniqueAutoCandidateIds = initiallyAuto.filter((id) => !collided.has(id));
  const clusters = sorted.map((candidate) => candidate.finalActivationDisposition !== "auto_activatable"
    ? { ...candidate, causeConsequenceAuditDisposition: collided.has(candidate.candidateId) ? "potential_cause_consequence_collision" as const : "not_applicable" as const, postCauseConsequenceActivationDisposition: "blocked_for_review" as const }
    : { ...candidate, causeConsequenceAuditDisposition: collided.has(candidate.candidateId) ? "potential_cause_consequence_collision" as const : "clearly_unique" as const, postCauseConsequenceActivationDisposition: collided.has(candidate.candidateId) ? "blocked_for_review" as const : "auto_activatable" as const });
  return { audit: { ruleVersion: CAUSE_CONSEQUENCE_IDENTITY_AUDIT_RULE_VERSION, candidatesAudited: comparable.length, pairComparisons: comparisons.length, potentialCollisionPairs: pairs, blockedInitiallyAutoCandidateIds, clearlyUniqueAutoCandidateIds }, clusters };
}
