import { buildSolutionDiagnosticAggregateReport, formatSolutionDiagnosticSummary } from "./solution-diagnostics/index.ts";
import type { DiscoveryModularPipelineResult } from "./types";

function countItems<T>(items?: T[]) {
  return Array.isArray(items) ? items.length : 0;
}

function isSolutionIntelligenceDiagnosticsEnabled() {
  return process.env.SOLUTION_INTELLIGENCE_DIAGNOSTICS === "1";
}

function isDiscoveryOrchestratorDiagnosticsEnabled() {
  return process.env.DISCOVERY_ORCHESTRATOR_DIAGNOSTICS === "1";
}

function buildSolutionIntelligenceDiagnosticReport(result: DiscoveryModularPipelineResult) {
  if (!isSolutionIntelligenceDiagnosticsEnabled() || !result.outputs.solutionIntelligenceEvaluation) return null;
  const aggregateReport = buildSolutionDiagnosticAggregateReport([result.outputs.solutionIntelligenceEvaluation]);
  return {
    aggregate_report: aggregateReport,
    developer_summary: formatSolutionDiagnosticSummary(aggregateReport),
  };
}

export function buildDiscoveryOrchestratorDiagnosticMetrics(
  result: DiscoveryModularPipelineResult
) {
  const solutionIntelligenceDiagnosticReport = buildSolutionIntelligenceDiagnosticReport(result);
  const solutionIntelligenceStage = result.diagnostics.find(
    (diagnostic) => diagnostic.stage === "solution_intelligence_evaluation"
  );
  return {
    environment_flags: {
      DISCOVERY_ORCHESTRATOR_DIAGNOSTICS: isDiscoveryOrchestratorDiagnosticsEnabled(),
      SOLUTION_INTELLIGENCE_DIAGNOSTICS: isSolutionIntelligenceDiagnosticsEnabled(),
    },
    modular_stage_statuses: result.diagnostics.map((diagnostic) => ({
      stage: diagnostic.stage,
      status: diagnostic.status,
      missingInputs: diagnostic.missingInputs,
      warnings: diagnostic.warnings,
    })),
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
    solution_intelligence_stage: {
      included: Boolean(solutionIntelligenceStage || result.outputs.solutionIntelligenceEvaluation),
      completed: solutionIntelligenceStage?.status === "completed" || Boolean(result.outputs.solutionIntelligenceEvaluation),
      skipped: solutionIntelligenceStage?.status === "skipped",
      missing_inputs_caused_skip: Boolean(
        solutionIntelligenceStage?.status === "skipped" && solutionIntelligenceStage.missingInputs.length > 0
      ),
      missingInputs: solutionIntelligenceStage?.missingInputs || [],
      warnings: solutionIntelligenceStage?.warnings || [],
    },
    solution_intelligence: result.outputs.solutionIntelligenceEvaluation ? {
      evaluated_category_count: result.outputs.solutionIntelligenceEvaluation.diagnostics.evaluatedCategoryCount,
      recommended_category: result.outputs.solutionIntelligenceEvaluation.diagnostics.recommendedCategory,
      rejected_category_count: result.outputs.solutionIntelligenceEvaluation.diagnostics.rejectedCategoryCount,
      low_confidence_reason_count: result.outputs.solutionIntelligenceEvaluation.diagnostics.lowConfidenceReasonCount,
      missing_evidence_count: result.outputs.solutionIntelligenceEvaluation.diagnostics.missingEvidenceCount,
      warning_count: result.outputs.solutionIntelligenceEvaluation.diagnostics.warnings.length,
      recommendation_produced: Boolean(result.outputs.solutionIntelligenceEvaluation.recommendation?.recommendedCategory),
    } : null,
    ...(solutionIntelligenceDiagnosticReport ? { solution_intelligence_diagnostic_report: solutionIntelligenceDiagnosticReport } : {}),
    deduplication_group_count:
      result.outputs.semanticProblemDeduplication?.summary.groupCount || 0,
  };
}
