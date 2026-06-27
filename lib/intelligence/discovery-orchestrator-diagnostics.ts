import type { DiscoveryModularPipelineResult } from "./types";

function countItems<T>(items?: T[]) {
  return Array.isArray(items) ? items.length : 0;
}

export function buildDiscoveryOrchestratorDiagnosticMetrics(
  result: DiscoveryModularPipelineResult
) {
  return {
    stages_executed: result.diagnostics
      .filter((diagnostic) => diagnostic.status === "completed")
      .map((diagnostic) => diagnostic.stage),
    warnings_count: result.warnings.length,
    evidence_count: countItems(result.outputs.evidenceNormalization?.evidence),
    knowledge_update_count: countItems(
      result.outputs.knowledgeUpdatePreparation?.knowledgeUpdates
    ),
    pain_candidate_count: countItems(result.outputs.painDetection?.candidates),
    pattern_candidate_count: countItems(result.outputs.patternDetection?.candidates),
    trend_candidate_count: countItems(result.outputs.trendDetection?.candidates),
    opportunity_candidate_count: countItems(
      result.outputs.opportunityDetection?.candidates
    ),
    monetization_candidate_count: countItems(
      result.outputs.monetizationEvaluation?.candidates
    ),
    confidence_candidate_count: countItems(
      result.outputs.confidenceEvaluation?.candidates
    ),
    feedback_signal_count: countItems(result.outputs.feedbackLearning?.signals),
    deduplication_group_count:
      result.outputs.semanticProblemDeduplication?.summary.groupCount || 0,
  };
}
