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
    solution_intelligence: result.outputs.solutionIntelligenceEvaluation ? {
      evaluated_category_count: result.outputs.solutionIntelligenceEvaluation.diagnostics.evaluatedCategoryCount,
      recommended_category: result.outputs.solutionIntelligenceEvaluation.diagnostics.recommendedCategory,
      rejected_category_count: result.outputs.solutionIntelligenceEvaluation.diagnostics.rejectedCategoryCount,
      low_confidence_reason_count: result.outputs.solutionIntelligenceEvaluation.diagnostics.lowConfidenceReasonCount,
      missing_evidence_count: result.outputs.solutionIntelligenceEvaluation.diagnostics.missingEvidenceCount,
      warning_count: result.outputs.solutionIntelligenceEvaluation.diagnostics.warnings.length,
      recommendation_produced: Boolean(result.outputs.solutionIntelligenceEvaluation.recommendation?.recommendedCategory),
    } : null,
    deduplication_group_count:
      result.outputs.semanticProblemDeduplication?.summary.groupCount || 0,
  };
}
