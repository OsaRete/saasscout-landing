import type {
  DiscoveryDecision,
  DiscoveryDecisionConfidence,
  DiscoveryDecisionDiagnostics,
  DiscoveryDecisionInput,
  DiscoveryDecisionReason,
  DiscoveryDecisionResult,
  DiscoveryDecisionThresholds,
  DiscoveryPipelineRecommendation,
} from "./types";

export type {
  DiscoveryDecision,
  DiscoveryDecisionConfidence,
  DiscoveryDecisionDiagnostics,
  DiscoveryDecisionInput,
  DiscoveryDecisionReason,
  DiscoveryDecisionResult,
  DiscoveryDecisionThresholds,
  DiscoveryPipelineRecommendation,
} from "./types";

export const DEFAULT_DISCOVERY_DECISION_THRESHOLDS: DiscoveryDecisionThresholds = {
  minimumModularOverallQualityScore: 70,
  minimumModularCandidateCount: 3,
  maximumRejectedRowRatio: 0.2,
  minimumModularVsLegacyScoreDelta: 5,
  maximumFallbackUsage: 0.25,
  maximumOrchestratorWarnings: 2,
};

function round(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function uniqueReasons(reasons: DiscoveryDecisionReason[]) {
  return [...new Set(reasons)].sort();
}

function fallbackUsageRatio(input: DiscoveryDecisionInput) {
  const plannedRows = input.persistencePlan.diagnostics.planned_row_count;
  if (plannedRows === 0) return 0;
  const fallbackFields = input.persistencePlan.diagnostics.fallback_fields_by_row.reduce((sum, row) => sum + row.fields.length, 0);
  return round(fallbackFields / Math.max(1, plannedRows * 5));
}

function buildDiagnostics(input: DiscoveryDecisionInput, thresholds: DiscoveryDecisionThresholds): DiscoveryDecisionDiagnostics {
  const modularPlannedRowCount = input.persistencePlan.diagnostics.planned_row_count;
  const modularRejectedRowCount = input.qualityGateResult.summary.rejected_row_count;
  const orchestratorWarningCount = Number(input.orchestratorDiagnostics?.warnings_count ?? input.qualityComparison.modularMetrics.orchestratorWarningCount ?? 0);

  return {
    legacyProblemCount: input.legacyProblems.length,
    modularCandidateCount: input.qualityComparison.diagnostics.modularCandidateCount,
    modularPlannedRowCount,
    modularAcceptedRowCount: input.qualityGateResult.summary.accepted_row_count,
    modularRejectedRowCount,
    modularRejectedRowRatio: modularPlannedRowCount === 0 ? 0 : round(modularRejectedRowCount / modularPlannedRowCount),
    modularOverallQualityScore: input.qualityComparison.overallModularScore,
    legacyOverallQualityScore: input.qualityComparison.overallLegacyScore,
    modularVsLegacyScoreDelta: round(input.qualityComparison.overallModularScore - input.qualityComparison.overallLegacyScore),
    modularFallbackUsageRatio: fallbackUsageRatio(input),
    qualityGateIssueCount: input.qualityGateResult.summary.issue_count,
    orchestratorWarningCount,
    shadowParityStatus: input.shadowComparisonMetrics?.parity_status,
    thresholds,
  };
}

function confidenceFor(decision: DiscoveryDecision, diagnostics: DiscoveryDecisionDiagnostics, reasons: DiscoveryDecisionReason[]): DiscoveryDecisionConfidence {
  if (decision === "insufficient_data") return "high";
  if (reasons.includes("shadow_comparison_divergent") || diagnostics.orchestratorWarningCount > diagnostics.thresholds.maximumOrchestratorWarnings) return "medium";
  if (decision === "use_modular" && diagnostics.modularVsLegacyScoreDelta >= diagnostics.thresholds.minimumModularVsLegacyScoreDelta * 2) return "high";
  if (["reject_modular", "use_legacy"].includes(decision) && reasons.length > 1) return "high";
  return "medium";
}

function recommendationFor(decision: DiscoveryDecision): DiscoveryPipelineRecommendation {
  if (decision === "use_modular") {
    return { primaryPipeline: "modular", allowFallback: false, persistModular: false, productionBehaviorChanged: false, explanation: "Diagnostic-only recommendation: modular quality is sufficient, but modular persistence remains disabled." };
  }
  if (decision === "use_modular_with_fallback") {
    return { primaryPipeline: "modular", allowFallback: true, persistModular: false, productionBehaviorChanged: false, explanation: "Diagnostic-only recommendation: modular can be evaluated while keeping legacy fallback available." };
  }
  if (decision === "insufficient_data") {
    return { primaryPipeline: "none", allowFallback: true, persistModular: false, productionBehaviorChanged: false, explanation: "Diagnostic-only recommendation: collect more modular candidates before changing pipeline ownership." };
  }
  return { primaryPipeline: "legacy", allowFallback: true, persistModular: false, productionBehaviorChanged: false, explanation: "Diagnostic-only recommendation: keep legacy primary until modular quality is consistently safer." };
}

export function decideDiscoveryPipeline(input: DiscoveryDecisionInput): DiscoveryDecisionResult {
  const thresholds = { ...DEFAULT_DISCOVERY_DECISION_THRESHOLDS, ...input.thresholds };
  const diagnostics = buildDiagnostics(input, thresholds);
  const reasons: DiscoveryDecisionReason[] = [];

  if (diagnostics.modularCandidateCount < thresholds.minimumModularCandidateCount || diagnostics.modularPlannedRowCount < thresholds.minimumModularCandidateCount) reasons.push("insufficient_modular_candidates");
  if (!input.qualityGateResult.allRowsPass || diagnostics.qualityGateIssueCount > 0) reasons.push("modular_failed_quality_gates");
  if (diagnostics.modularRejectedRowRatio > thresholds.maximumRejectedRowRatio) reasons.push("modular_rejected_rows_exceed_threshold");
  if (diagnostics.modularOverallQualityScore < thresholds.minimumModularOverallQualityScore) reasons.push("modular_quality_below_legacy");
  if (diagnostics.modularVsLegacyScoreDelta < thresholds.minimumModularVsLegacyScoreDelta && diagnostics.legacyProblemCount > 0) reasons.push("modular_quality_below_legacy");
  if (input.qualityComparison.modularMetrics.averageTitleSpecificity < 55) reasons.push("modular_has_low_title_specificity");
  if (input.qualityComparison.modularMetrics.averageScoreConsistency < 45) reasons.push("modular_has_collapsed_scores");
  if (input.qualityComparison.modularMetrics.averageEvidenceCompactness < 80 || input.qualityGateResult.summary.issue_counts_by_code.source_evidence_too_long > 0) reasons.push("modular_evidence_too_verbose");
  if (diagnostics.modularFallbackUsageRatio > thresholds.maximumFallbackUsage) reasons.push("modular_fallback_usage_exceeds_threshold");
  if (diagnostics.orchestratorWarningCount > thresholds.maximumOrchestratorWarnings) reasons.push("orchestrator_has_warnings");
  if (diagnostics.shadowParityStatus === "divergent") reasons.push("shadow_comparison_divergent");
  if (diagnostics.legacyProblemCount === 0) reasons.push("legacy_unavailable");
  if (diagnostics.modularOverallQualityScore >= thresholds.minimumModularOverallQualityScore) reasons.push("modular_quality_above_threshold");
  if (diagnostics.modularVsLegacyScoreDelta >= thresholds.minimumModularVsLegacyScoreDelta) reasons.push("modular_score_delta_above_legacy");

  const blockingReasons = new Set<DiscoveryDecisionReason>([
    "insufficient_modular_candidates",
    "modular_failed_quality_gates",
    "modular_rejected_rows_exceed_threshold",
    "modular_has_low_title_specificity",
    "modular_has_collapsed_scores",
    "modular_evidence_too_verbose",
    "shadow_comparison_divergent",
  ]);
  const fallbackReasons = new Set<DiscoveryDecisionReason>([
    "modular_fallback_usage_exceeds_threshold",
    "orchestrator_has_warnings",
  ]);

  let decision: DiscoveryDecision;
  if (reasons.includes("insufficient_modular_candidates")) decision = "insufficient_data";
  else if ([...blockingReasons].some((reason) => reasons.includes(reason))) decision = "reject_modular";
  else if (diagnostics.legacyProblemCount > 0 && diagnostics.modularVsLegacyScoreDelta < thresholds.minimumModularVsLegacyScoreDelta) decision = "use_legacy";
  else if ([...fallbackReasons].some((reason) => reasons.includes(reason))) {
    reasons.push("modular_requires_legacy_fallback");
    decision = "use_modular_with_fallback";
  } else decision = "use_modular";

  const stableReasons = uniqueReasons(reasons);
  return {
    decision,
    reasons: stableReasons,
    confidence: confidenceFor(decision, diagnostics, stableReasons),
    diagnostics,
    recommendation: recommendationFor(decision),
  };
}
