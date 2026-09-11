import { createHash } from "node:crypto";

import { calculateOverlapScore, extractProblemTokens, normalizeProblemText } from "../deduplication/helpers.ts";
import {
  CANONICAL_BOOTSTRAP_RULE_VERSION,
  type AmbiguousAliasCollision,
  type BootstrapAliasPreview,
  type BootstrapCandidateCluster,
  type BootstrapObservationAudit,
  type CanonicalBootstrapReport,
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
  return { candidateId: candidateId(sorted), disposition, candidateCanonicalTitle: titleCandidate(sorted), observations: sorted.map(auditObservation), aliasesPreview: aliases(sorted), reasons: uniqueSorted(reasons) };
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
  const aliasOwners = new Map<string, Set<string>>();
  for (const cluster of clusters) for (const alias of cluster.aliasesPreview) {
    const owners = aliasOwners.get(alias.normalizedAlias) || new Set<string>();
    owners.add(cluster.candidateId);
    aliasOwners.set(alias.normalizedAlias, owners);
  }
  const ambiguousAliasCollisions: AmbiguousAliasCollision[] = [...aliasOwners.entries()].filter(([, owners]) => owners.size > 1).map(([normalizedAlias, owners]) => ({ normalizedAlias, candidateIds: [...owners].sort(compare) })).sort((a, b) => compare(a.normalizedAlias, b.normalizedAlias));
  const normalizedCounts = new Map<string, number>();
  for (const row of rows) normalizedCounts.set(normalizedStoredTitle(row), (normalizedCounts.get(normalizedStoredTitle(row)) || 0) + 1);

  return {
    bootstrapRuleVersion: CANONICAL_BOOTSTRAP_RULE_VERSION,
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
    },
    ambiguousAliasCollisions,
    clusters,
  };
}
