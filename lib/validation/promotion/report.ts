import { createHash } from "node:crypto";

import { VALIDATION_CANONICAL_RESOLVER_VERSION, VALIDATION_PROMOTION_POLICY_VERSION, type PromotionEligibilityReason } from "./types.ts";
import type { PersistedPromotionRows } from "./read-repository.ts";
import { prepareValidationPromotion } from "./preparation.ts";

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const reasons: PromotionEligibilityReason[] = ["eligible", "missing_authoritative_classification", "ambiguous_authoritative_classification", "classification_not_promotable", "unsupported_evidence_origin", "missing_independence_identity", "empty_evidence_content", "invalid_validation_lineage", "experiment_state_not_eligible", "target_relevance_unproven", "participant_state_not_eligible", "survey_projection_required"];
const resolutionStatuses = ["resolved", "unmatched", "ambiguous", "insufficient_identity"] as const;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => compare(a, b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export type ValidationPromotionDryRunReport = ReturnType<typeof buildValidationPromotionDryRunReport>;

export function assertPromotionReportReconciles(report: { summary: Record<string, number>; representativeCandidates: Array<{ observationId: string; canonicalProblemId: string; polarity: string; groupReference: string }>; deferred: Array<{ observationId: string }> }) {
  const s = report.summary;
  if (s.observationsEvaluated !== s.eligibleObservations + s.deferredObservations) throw new Error("promotion_reconciliation:eligibility");
  if (s.eligibleObservations !== s.canonicalResolvedEligible + s.canonicalDeferredEligible) throw new Error("promotion_reconciliation:canonical_resolution");
  if (s.canonicalResolvedEligible !== s.representativesSelected + s.nonRepresentativeEligibleObservations) throw new Error("promotion_reconciliation:representatives");
  const selected = new Set<string>(), groups = new Set<string>(), deferred = new Set(report.deferred.map((item) => item.observationId));
  for (const item of report.representativeCandidates) {
    if (selected.has(item.observationId) || deferred.has(item.observationId)) throw new Error("promotion_reconciliation:observation_overlap");
    const group = `${item.canonicalProblemId}|${item.polarity}|${item.groupReference}`;
    if (groups.has(group)) throw new Error("promotion_reconciliation:duplicate_group");
    selected.add(item.observationId); groups.add(group);
  }
  if (selected.size !== s.representativesSelected || groups.size !== s.independenceGroups) throw new Error("promotion_reconciliation:group_count");
}

export function buildValidationPromotionDryRunReport(rows: PersistedPromotionRows, generatedAt = new Date().toISOString()) {
  const prepared = prepareValidationPromotion(rows);
  const eligible = prepared.evaluated.filter((item) => item.eligibility.eligible);
  const resolved = eligible.filter((item) => item.resolution?.status === "resolved");
  const selectedIds = new Set(prepared.selections.map((item) => item.representativeObservationId));
  const selectionById = new Map(prepared.selections.map((item, index) => [item.representativeObservationId, { selection: item, index }]));
  const eligibilityReasonCounts = Object.fromEntries(reasons.map((reason) => [reason, prepared.evaluated.filter((item) => item.eligibility.reasons.includes(reason)).length]));
  const canonicalResolutionCounts = Object.fromEntries(resolutionStatuses.map((status) => [status, eligible.filter((item) => item.resolution?.status === status).length]));
  const representativeCandidates = resolved.filter((item) => selectedIds.has(item.input.observationId)).map((item) => {
    const selection = selectionById.get(item.input.observationId)!;
    return { observationId: item.input.observationId, classificationId: item.eligibility.classificationId!, polarity: item.eligibility.classification!, canonicalProblemId: item.resolution!.canonicalProblemId!, canonicalResolutionReason: item.resolution!.reason, identitySource: item.resolution!.identitySource, groupReference: `group-${String(selection.index + 1).padStart(6, "0")}`, groupObservationCount: selection.selection.memberObservationIds.length, observedAt: item.observedAt, specificity: item.specificity, statementKind: item.statementKind, contentLength: item.contentLength };
  }).sort((a, b) => compare(a.observationId, b.observationId));
  const deferred: Array<{ observationId: string; reasons: string[]; classificationStatus: string; canonicalResolutionStatus: string }> = [];
  for (const item of prepared.evaluated) {
    if (!item.eligibility.eligible) deferred.push({ observationId: item.input.observationId, reasons: [...item.eligibility.reasons].sort(compare), classificationStatus: item.eligibility.classification ? "resolved" : item.eligibility.reasons.includes("ambiguous_authoritative_classification") ? "ambiguous" : "missing", canonicalResolutionStatus: "not_evaluated" });
    else if (item.resolution?.status !== "resolved") deferred.push({ observationId: item.input.observationId, reasons: [`canonical_${item.resolution?.status ?? "insufficient_identity"}`], classificationStatus: "resolved", canonicalResolutionStatus: item.resolution?.status ?? "insufficient_identity" });
  }
  deferred.sort((a, b) => compare(a.observationId, b.observationId));
  const canonicalProblems = prepared.registry.filter((canonical) => canonical.status === "active").map((canonical) => {
    const items = resolved.filter((item) => item.resolution?.canonicalProblemId === canonical.id);
    return { canonicalProblemId: canonical.id, canonicalTitle: canonical.canonicalTitle, eligibleObservationCount: items.length, independentParticipantCount: new Set(items.map((item) => item.eligibility.independenceUnit!.privateId)).size, supportingCount: items.filter((item) => item.eligibility.classification === "supporting").length, contradictingCount: items.filter((item) => item.eligibility.classification === "contradicting").length, mixedCount: items.filter((item) => item.eligibility.classification === "mixed").length, representativeCount: items.filter((item) => selectedIds.has(item.input.observationId)).length };
  }).filter((item) => item.eligibleObservationCount > 0).sort((a, b) => compare(a.canonicalProblemId, b.canonicalProblemId));
  const summary = { observationsEvaluated: prepared.evaluated.length, eligibleObservations: eligible.length, deferredObservations: prepared.evaluated.length - eligible.length, supportingEligible: eligible.filter((item) => item.eligibility.classification === "supporting").length, contradictingEligible: eligible.filter((item) => item.eligibility.classification === "contradicting").length, mixedEligible: eligible.filter((item) => item.eligibility.classification === "mixed").length, canonicalResolved: resolved.length, canonicalUnmatched: canonicalResolutionCounts.unmatched, canonicalAmbiguous: canonicalResolutionCounts.ambiguous, canonicalInsufficientIdentity: canonicalResolutionCounts.insufficient_identity, canonicalResolvedEligible: resolved.length, canonicalDeferredEligible: eligible.length - resolved.length, independenceGroups: prepared.selections.length, representativesSelected: prepared.selections.length, nonRepresentativeEligibleObservations: resolved.length - prepared.selections.length };
  const semantic = { policyVersion: VALIDATION_PROMOTION_POLICY_VERSION, resolverVersion: VALIDATION_CANONICAL_RESOLVER_VERSION, summary, eligibilityReasonCounts, canonicalResolutionCounts, canonicalProblems, representativeCandidates, deferred };
  const report = { ...semantic, promotionPreparationSnapshotHash: createHash("sha256").update(stable(semantic)).digest("hex"), generatedAt };
  assertPromotionReportReconciles(report);
  return report;
}
