import { createHash } from "node:crypto";

import { calculateOverlapScore, extractProblemTokens, normalizeProblemText } from "../deduplication/helpers.ts";
import {
  CANONICAL_ACTIVATION_ELIGIBILITY_RULE_VERSION,
  CANONICAL_BOOTSTRAP_RULE_VERSION,
  type ActivationBlockReason,
  type AmbiguousAliasCollision,
  type BootstrapAliasPreview,
  type BootstrapCandidateCluster,
  type BootstrapObservationAudit,
  type CanonicalBootstrapReport,
  type NormalizedIdentityCollision,
  type UnresolvedProblemObservation,
} from "./types.ts";

const HIGH_TITLE_OVERLAP = 8;
const REVIEW_TITLE_OVERLAP = 4.5;
const CORROBORATING_SUMMARY_OVERLAP = 5;

const compare = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
const uniqueSorted = (values: string[]) => [...new Set(values.filter(Boolean))].sort(compare);
const normalizedStoredTitle = (row: UnresolvedProblemObservation) => normalizeProblemText(row.normalized_problem_title) || normalizeProblemText(row.problem_title);
const normalizedCluster = (row: UnresolvedProblemObservation) => normalizeProblemText(row.problem_cluster);
const normalizedNiches = (row: UnresolvedProblemObservation) => uniqueSorted(row.affected_niches.map(normalizeProblemText));
const overlap = (left: string[], right: string[]) => calculateOverlapScore(left, right);

const INTERNAL_CONTEXT_TOKENS = new Set([
  "architecture", "bootstrap", "canonical", "data", "debug", "engine", "evidence", "intelligence", "moat", "pipeline", "signal", "signals", "source", "sources", "weekly",
]);
const PROSE_CONTEXT_TOKENS = new Set([
  "are", "because", "cannot", "delays", "errors", "face", "facing", "lack", "lead", "leads", "multiple", "poor", "struggle", "struggles", "visibility", "with",
]);
const TRUSTED_MULTI_WORD_ENDINGS = new Set([
  "agencies", "businesses", "companies", "consultants", "freelancers", "professionals", "retailers", "services", "teams",
]);

/** Conservative structural classifier: it decides corroboration safety, not ontology membership. */
export function classifyBootstrapContext(value: string): "trusted_context" | "untrusted_internal_or_prose_context" {
  const normalized = normalizeProblemText(value);
  const tokens = normalized.split(" ").filter(Boolean);
  if (!normalized || tokens.length > 3 || tokens.some((token) => (/\d/.test(token) && token !== "b2b") || INTERNAL_CONTEXT_TOKENS.has(token) || PROSE_CONTEXT_TOKENS.has(token))) {
    return "untrusted_internal_or_prose_context";
  }
  if (tokens.length === 1) return "trusted_context";
  return TRUSTED_MULTI_WORD_ENDINGS.has(tokens[tokens.length - 1]) ? "trusted_context" : "untrusted_internal_or_prose_context";
}

type Relationship = Readonly<{ kind: "high" | "review" | "separate"; reasons: string[] }>;

function contextRelationship(left: UnresolvedProblemObservation, right: UnresolvedProblemObservation) {
  const leftCluster = normalizedCluster(left);
  const rightCluster = normalizedCluster(right);
  const clustersConflict = Boolean(leftCluster && rightCluster && leftCluster !== rightCluster);
  const clustersAgree = Boolean(leftCluster && leftCluster === rightCluster);
  const nichesOverlap = overlap(normalizedNiches(left), normalizedNiches(right)) > 0;
  const summaryOverlap = overlap(extractProblemTokens(left.problem_summary), extractProblemTokens(right.problem_summary));
  return { clustersAgree, clustersConflict, nichesOverlap, summaryOverlap };
}

function relationship(left: UnresolvedProblemObservation, right: UnresolvedProblemObservation): Relationship {
  const leftTitle = normalizedStoredTitle(left);
  const rightTitle = normalizedStoredTitle(right);
  const titleOverlap = overlap(extractProblemTokens(leftTitle), extractProblemTokens(rightTitle));
  const exactTitle = Boolean(leftTitle && leftTitle === rightTitle);
  const context = contextRelationship(left, right);

  if (exactTitle && !context.clustersConflict) {
    return { kind: "high", reasons: ["exact_normalized_title", context.clustersAgree ? "matching_problem_cluster" : "no_conflicting_problem_cluster"] };
  }
  if (titleOverlap >= HIGH_TITLE_OVERLAP && !context.clustersConflict && (context.clustersAgree || context.nichesOverlap || context.summaryOverlap >= CORROBORATING_SUMMARY_OVERLAP)) {
    const corroboration = context.clustersAgree ? "matching_problem_cluster" : context.nichesOverlap ? "overlapping_affected_niches" : "corroborating_summary_overlap";
    return { kind: "high", reasons: [`title_token_overlap_at_least_${HIGH_TITLE_OVERLAP}`, corroboration] };
  }
  if (exactTitle || titleOverlap >= REVIEW_TITLE_OVERLAP || (titleOverlap > 0 && context.summaryOverlap >= CORROBORATING_SUMMARY_OVERLAP)) {
    const reasons = [exactTitle ? "exact_title_with_conflicting_context" : `title_token_overlap_at_least_${REVIEW_TITLE_OVERLAP}`];
    if (context.clustersConflict) reasons.push("conflicting_problem_cluster");
    else reasons.push("insufficient_context_corroboration");
    return { kind: "review", reasons };
  }
  return { kind: "separate", reasons: ["insufficient_identity_evidence"] };
}

function candidateId(rows: UnresolvedProblemObservation[]) {
  const stableMembers = [...rows].sort((a, b) => compare(a.id, b.id)).map((row) => `${row.id}:${row.observation_fingerprint}`).join("|");
  return `cb1_${createHash("sha256").update(`${CANONICAL_BOOTSTRAP_RULE_VERSION}|${stableMembers}`).digest("hex").slice(0, 24)}`;
}

function titleCandidate(rows: UnresolvedProblemObservation[]) {
  const score = (row: UnresolvedProblemObservation) => {
    const tokens = extractProblemTokens(normalizedStoredTitle(row));
    const totalOverlap = rows.reduce((sum, other) => sum + overlap(tokens, extractProblemTokens(normalizedStoredTitle(other))), 0);
    const recurrence = rows.filter((other) => normalizedStoredTitle(other) === normalizedStoredTitle(row)).length;
    return { row, recurrence, totalOverlap, specificity: tokens.length };
  };
  return rows.map(score).sort((a, b) => b.recurrence - a.recurrence || b.totalOverlap - a.totalOverlap || b.specificity - a.specificity || a.row.problem_title.length - b.row.problem_title.length || compare(a.row.problem_title, b.row.problem_title) || compare(a.row.id, b.row.id))[0].row.problem_title;
}

function aliases(rows: UnresolvedProblemObservation[]): BootstrapAliasPreview[] {
  const values = new Map<string, BootstrapAliasPreview>();
  for (const row of rows) {
    const originalNormalized = normalizeProblemText(row.problem_title);
    const storedNormalized = normalizedStoredTitle(row);
    if (originalNormalized) values.set(`original_title\0${originalNormalized}`, { text: row.problem_title, normalizedAlias: originalNormalized, kind: "original_title" });
    if (storedNormalized) values.set(`normalized_title\0${storedNormalized}`, { text: storedNormalized, normalizedAlias: storedNormalized, kind: "normalized_title" });
  }
  return [...values.values()].sort((a, b) => compare(a.normalizedAlias, b.normalizedAlias) || compare(a.kind, b.kind) || compare(a.text, b.text));
}

function auditObservation(row: UnresolvedProblemObservation): BootstrapObservationAudit {
  return { id: row.id, title: row.problem_title, normalizedTitle: normalizedStoredTitle(row), sourceTable: row.source_table, sourceRowId: row.source_row_id, affectedNiches: normalizedNiches(row), problemCluster: normalizedCluster(row) || null, observedAt: row.observed_at };
}

function buildCluster(rows: UnresolvedProblemObservation[], disposition: BootstrapCandidateCluster["disposition"], reasons: string[]): BootstrapCandidateCluster {
  const sorted = [...rows].sort((a, b) => compare(a.id, b.id));
  return { candidateId: candidateId(sorted), disposition, candidateCanonicalTitle: titleCandidate(sorted), observations: sorted.map(auditObservation), aliasesPreview: aliases(sorted), reasons: uniqueSorted(reasons), activationDisposition: "blocked_for_review", activationBlockReasons: ["non_high_confidence_disposition"], trustedAffectedNiches: [], ignoredAffectedNiches: [] };
}

function collisionIndex(clusters: BootstrapCandidateCluster[], values: (cluster: BootstrapCandidateCluster) => string[]) {
  const owners = new Map<string, Set<string>>();
  for (const cluster of clusters) for (const value of uniqueSorted(values(cluster))) {
    const candidates = owners.get(value) || new Set<string>();
    candidates.add(cluster.candidateId);
    owners.set(value, candidates);
  }
  const entries: [string, string[]][] = [...owners.entries()].map(([value, candidates]) => [value, [...candidates].sort(compare)]);
  return new Map(entries.sort(([left], [right]) => compare(left, right)));
}

function activationContext(cluster: BootstrapCandidateCluster) {
  const contexts = uniqueSorted(cluster.observations.flatMap((observation) => observation.affectedNiches));
  return {
    trusted: contexts.filter((value) => classifyBootstrapContext(value) === "trusted_context"),
    ignored: contexts.filter((value) => classifyBootstrapContext(value) !== "trusted_context"),
  };
}

function activationRelationship(left: BootstrapObservationAudit, right: BootstrapObservationAudit, hasSummaryCorroboration: boolean) {
  if (left.normalizedTitle === right.normalizedTitle) return { coherent: true, contextIssue: false, clusterConflict: false };
  const clusterConflict = Boolean(left.problemCluster && right.problemCluster && left.problemCluster !== right.problemCluster);
  const clusterAgreement = Boolean(left.problemCluster && left.problemCluster === right.problemCluster);
  const trustedLeft = left.affectedNiches.filter((value) => classifyBootstrapContext(value) === "trusted_context");
  const trustedRight = right.affectedNiches.filter((value) => classifyBootstrapContext(value) === "trusted_context");
  const trustedNicheOverlap = overlap(trustedLeft, trustedRight) > 0;
  // Summaries are intentionally absent from report observations; the original high-confidence
  // reason records whether summary evidence, rather than contaminated niches, corroborated it.
  return { coherent: !clusterConflict && (clusterAgreement || trustedNicheOverlap || hasSummaryCorroboration), contextIssue: !clusterConflict && !clusterAgreement && !trustedNicheOverlap && !hasSummaryCorroboration, clusterConflict };
}

function calibrateCluster(cluster: BootstrapCandidateCluster, aliasIndex: Map<string, string[]>, identityIndex: Map<string, string[]>): BootstrapCandidateCluster {
  const context = activationContext(cluster);
  const reasons = new Set<ActivationBlockReason>();
  if (cluster.aliasesPreview.some((alias) => (aliasIndex.get(alias.normalizedAlias)?.length || 0) > 1)) reasons.add("ambiguous_alias_collision");
  const identities = uniqueSorted([normalizeProblemText(cluster.candidateCanonicalTitle), ...cluster.observations.map((item) => item.normalizedTitle)]);
  if (identities.some((identity) => (identityIndex.get(identity)?.length || 0) > 1)) reasons.add("duplicate_normalized_identity_across_candidates");
  if (cluster.disposition !== "high_confidence_cluster") {
    if (cluster.reasons.includes("conflicting_problem_cluster")) reasons.add("conflicting_problem_cluster");
    reasons.add("non_high_confidence_disposition");
    return { ...cluster, activationBlockReasons: [...reasons].sort(compare), trustedAffectedNiches: context.trusted, ignoredAffectedNiches: context.ignored };
  }
  for (let index = 0; index < cluster.observations.length; index += 1) for (const right of cluster.observations.slice(index + 1)) {
    const relation = activationRelationship(cluster.observations[index], right, cluster.reasons.includes("corroborating_summary_overlap"));
    if (relation.clusterConflict) reasons.add("conflicting_problem_cluster");
    if (!relation.coherent) reasons.add(relation.contextIssue ? "insufficient_trusted_context" : "incomplete_complete_link_identity");
  }
  // Exact-title clusters do not need context corroboration. For near duplicates, matching
  // cluster or trusted niche evidence must survive the conservative activation filter.
  const sortedReasons = [...reasons].sort(compare);
  return { ...cluster, activationDisposition: sortedReasons.length ? "blocked_for_review" : "auto_activatable", activationBlockReasons: sortedReasons, trustedAffectedNiches: context.trusted, ignoredAffectedNiches: context.ignored };
}

/** Pure, model-free analysis. It cannot receive a database client and has no persistence path. */
export function analyzeCanonicalBootstrap(input: readonly UnresolvedProblemObservation[]): CanonicalBootstrapReport {
  const rows = [...input].sort((a, b) => compare(a.id, b.id));
  for (const row of rows) if (row.canonical_problem_id !== null) throw new Error(`Observation ${row.id} is already canonicalized.`);

  const unassigned = new Set(rows.map((row) => row.id));
  const high: BootstrapCandidateCluster[] = [];
  for (const seed of rows) {
    if (!unassigned.has(seed.id)) continue;
    const members = [seed];
    for (const candidate of rows) {
      if (!unassigned.has(candidate.id) || candidate.id === seed.id) continue;
      if (members.every((member) => relationship(member, candidate).kind === "high")) members.push(candidate);
    }
    if (members.length > 1) {
      members.forEach((member) => unassigned.delete(member.id));
      const reasons = members.flatMap((left, index) => members.slice(index + 1).flatMap((right) => relationship(left, right).reasons));
      high.push(buildCluster(members, "high_confidence_cluster", reasons));
    }
  }

  const review: BootstrapCandidateCluster[] = [];
  for (const seed of rows) {
    if (!unassigned.has(seed.id)) continue;
    const members = [seed];
    for (const candidate of rows) {
      if (!unassigned.has(candidate.id) || candidate.id === seed.id) continue;
      if (members.some((member) => relationship(member, candidate).kind === "review")) members.push(candidate);
    }
    if (members.length > 1) {
      members.forEach((member) => unassigned.delete(member.id));
      const reasons = members.flatMap((left, index) => members.slice(index + 1).filter((right) => relationship(left, right).kind === "review").flatMap((right) => relationship(left, right).reasons));
      review.push(buildCluster(members, "review_required", reasons));
    }
  }

  const singletons = rows.filter((row) => unassigned.has(row.id)).map((row) => buildCluster([row], "singleton", ["no_high_confidence_or_review_relationship"]));
  const clusters = [...high, ...review, ...singletons].sort((a, b) => compare(a.candidateId, b.candidateId));
  const aliasIndex = collisionIndex(clusters, (cluster) => cluster.aliasesPreview.map((alias) => alias.normalizedAlias));
  const identityIndex = collisionIndex(clusters, (cluster) => [normalizeProblemText(cluster.candidateCanonicalTitle), ...cluster.observations.map((item) => item.normalizedTitle)]);
  const ambiguousAliasCollisions: AmbiguousAliasCollision[] = [...aliasIndex.entries()].filter(([, owners]) => owners.length > 1).map(([normalizedAlias, candidateIds]) => ({ normalizedAlias, candidateIds }));
  const normalizedIdentityCollisions: NormalizedIdentityCollision[] = [...identityIndex.entries()].filter(([, owners]) => owners.length > 1).map(([normalizedIdentity, candidateIds]) => ({ normalizedIdentity, candidateIds }));
  const calibratedClusters = clusters.map((cluster) => calibrateCluster(cluster, aliasIndex, identityIndex));
  const autoActivatable = calibratedClusters.filter((cluster) => cluster.activationDisposition === "auto_activatable");
  const blockedHighConfidence = calibratedClusters.filter((cluster) => cluster.disposition === "high_confidence_cluster" && cluster.activationDisposition === "blocked_for_review");
  const normalizedCounts = new Map<string, number>();
  for (const row of rows) normalizedCounts.set(normalizedStoredTitle(row), (normalizedCounts.get(normalizedStoredTitle(row)) || 0) + 1);

  return {
    bootstrapRuleVersion: CANONICAL_BOOTSTRAP_RULE_VERSION,
    activationEligibilityRuleVersion: CANONICAL_ACTIVATION_ELIGIBILITY_RULE_VERSION,
    summary: {
      observationsAnalyzed: rows.length,
      distinctSourceTables: uniqueSorted(rows.map((row) => row.source_table || "unknown")),
      distinctNormalizedTitles: normalizedCounts.size,
      highConfidenceCandidateClusters: high.length,
      observationsInHighConfidenceClusters: high.reduce((sum, cluster) => sum + cluster.observations.length, 0),
      reviewRequiredClusters: review.length,
      observationsInReviewRequiredClusters: review.reduce((sum, cluster) => sum + cluster.observations.length, 0),
      singletonObservations: singletons.length,
      exactTitleDuplicateGroups: [...normalizedCounts.values()].filter((count) => count > 1).length,
      ambiguousAliasCollisions: ambiguousAliasCollisions.length,
      autoActivatableClusters: autoActivatable.length,
      observationsInAutoActivatableClusters: autoActivatable.reduce((sum, cluster) => sum + cluster.observations.length, 0),
      blockedHighConfidenceClusters: blockedHighConfidence.length,
      observationsInBlockedHighConfidenceClusters: blockedHighConfidence.reduce((sum, cluster) => sum + cluster.observations.length, 0),
      blockedByAliasCollision: blockedHighConfidence.filter((cluster) => cluster.activationBlockReasons.includes("ambiguous_alias_collision")).length,
      blockedByNormalizedIdentityCollision: blockedHighConfidence.filter((cluster) => cluster.activationBlockReasons.includes("duplicate_normalized_identity_across_candidates")).length,
      blockedByContextIssue: blockedHighConfidence.filter((cluster) => cluster.activationBlockReasons.includes("insufficient_trusted_context")).length,
      blockedByClusterConflict: blockedHighConfidence.filter((cluster) => cluster.activationBlockReasons.includes("conflicting_problem_cluster")).length,
    },
    ambiguousAliasCollisions,
    normalizedIdentityCollisions,
    clusters: calibratedClusters,
  };
}
