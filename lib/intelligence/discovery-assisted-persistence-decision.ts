import type { DiscoveryDecisionResult } from "./decision";
import type { PlannedDiscoveredProblem, validateDiscoveryPersistencePlanRows } from "./discovery-orchestrator-persistence-plan";
import type { evaluateDiscoveryPersistenceQuality } from "./discovery-persistence-quality-gates";

export function buildSafeAssistedPersistenceDecisionDiagnostics({
  decisionResult,
  qualityGatePassed,
  plannedRowCount,
  fallbackUsed,
}: {
  decisionResult: DiscoveryDecisionResult;
  qualityGatePassed: boolean;
  plannedRowCount: number;
  fallbackUsed: boolean;
}) {
  return {
    decision: decisionResult.decision,
    reasons: decisionResult.reasons,
    modular_quality_score: decisionResult.diagnostics.modularOverallQualityScore,
    legacy_quality_score: decisionResult.diagnostics.legacyOverallQualityScore,
    quality_gate_passed: qualityGatePassed,
    planned_row_count: plannedRowCount,
    fallback_used: fallbackUsed,
  };
}

export function selectDecisionGatedAssistedPersistenceRows({
  plannedRows,
  validation,
  qualityGateResult,
  decisionResult,
}: {
  plannedRows: PlannedDiscoveredProblem[];
  validation: ReturnType<typeof validateDiscoveryPersistencePlanRows>;
  qualityGateResult: ReturnType<typeof evaluateDiscoveryPersistenceQuality>;
  decisionResult: DiscoveryDecisionResult;
}): PlannedDiscoveredProblem[] | null {
  const hasInvalidRows = validation.some((result) => !result.valid);
  const decisionApprovesModular = ["use_modular", "use_modular_with_fallback"].includes(decisionResult.decision);
  const plannedRowsAreValid = plannedRows.length > 0 && !hasInvalidRows && qualityGateResult.allRowsPass;

  if (!decisionApprovesModular || !plannedRowsAreValid) return null;

  return qualityGateResult.acceptedRows;
}
