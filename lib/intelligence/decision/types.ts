import type { DiscoveredProblem } from "../discovery-response-normalization";
import type { DiscoveryPersistencePlan } from "../discovery-orchestrator-persistence-plan";
import type { DiscoveryPersistenceQualityGateResult } from "../discovery-persistence-quality-gates";
import type { DiscoveryShadowComparisonMetrics } from "../discovery-shadow-comparison";
import type { DiscoveryQualityComparison } from "../quality-comparison";

export type DiscoveryDecision =
  | "use_legacy"
  | "use_modular"
  | "use_modular_with_fallback"
  | "reject_modular"
  | "insufficient_data";

export type DiscoveryDecisionReason =
  | "modular_quality_below_legacy"
  | "modular_failed_quality_gates"
  | "modular_has_low_title_specificity"
  | "modular_has_collapsed_scores"
  | "modular_evidence_too_verbose"
  | "modular_quality_above_threshold"
  | "legacy_unavailable"
  | "insufficient_modular_candidates"
  | "modular_rejected_rows_exceed_threshold"
  | "modular_score_delta_above_legacy"
  | "modular_fallback_usage_exceeds_threshold"
  | "modular_requires_legacy_fallback"
  | "shadow_comparison_divergent"
  | "orchestrator_has_warnings";

export type DiscoveryDecisionConfidence = "low" | "medium" | "high";

export type DiscoveryPipelineRecommendation = {
  primaryPipeline: "legacy" | "modular" | "none";
  allowFallback: boolean;
  persistModular: false;
  productionBehaviorChanged: false;
  explanation: string;
};

export type DiscoveryDecisionThresholds = {
  minimumModularOverallQualityScore: number;
  minimumModularCandidateCount: number;
  maximumRejectedRowRatio: number;
  minimumModularVsLegacyScoreDelta: number;
  maximumFallbackUsage: number;
  maximumOrchestratorWarnings: number;
};

export type DiscoveryDecisionDiagnostics = {
  legacyProblemCount: number;
  modularCandidateCount: number;
  modularPlannedRowCount: number;
  modularAcceptedRowCount: number;
  modularRejectedRowCount: number;
  modularRejectedRowRatio: number;
  modularOverallQualityScore: number;
  legacyOverallQualityScore: number;
  modularVsLegacyScoreDelta: number;
  modularFallbackUsageRatio: number;
  qualityGateIssueCount: number;
  orchestratorWarningCount: number;
  shadowParityStatus?: DiscoveryShadowComparisonMetrics["parity_status"];
  thresholds: DiscoveryDecisionThresholds;
};

export type DiscoveryDecisionInput = {
  legacyProblems: DiscoveredProblem[];
  persistencePlan: DiscoveryPersistencePlan;
  qualityGateResult: DiscoveryPersistenceQualityGateResult;
  qualityComparison: DiscoveryQualityComparison;
  orchestratorDiagnostics?: { warnings_count?: number; [key: string]: unknown };
  shadowComparisonMetrics?: DiscoveryShadowComparisonMetrics;
  thresholds?: Partial<DiscoveryDecisionThresholds>;
};

export type DiscoveryDecisionResult = {
  decision: DiscoveryDecision;
  reasons: DiscoveryDecisionReason[];
  confidence: DiscoveryDecisionConfidence;
  diagnostics: DiscoveryDecisionDiagnostics;
  recommendation: DiscoveryPipelineRecommendation;
};
