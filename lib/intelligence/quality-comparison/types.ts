export type QualityComparisonWinner = "legacy" | "modular" | "tie" | "insufficient_data";

export type QualityCategory =
  | "title_specificity"
  | "summary_quality"
  | "evidence_quality"
  | "evidence_compactness"
  | "score_consistency"
  | "opportunity_completeness"
  | "market_coverage"
  | "fallback_usage"
  | "synthesis_completeness"
  | "quality_gate_results";

export type QualityCategoryScore = {
  category: QualityCategory;
  legacyScore: number;
  modularScore: number;
  winner: QualityComparisonWinner;
  diagnostics: string[];
};

export type LegacyQualityMetrics = {
  problemCount: number;
  averageTitleSpecificity: number;
  averageSummaryQuality: number;
  averageEvidenceQuality: number;
  averageEvidenceCompactness: number;
  averageScoreConsistency: number;
  averageOpportunityCompleteness: number;
  marketCoverageScore: number;
  fallbackUsageScore: number;
  synthesisCompletenessScore: number;
  qualityGateScore: number;
};

export type ModularQualityMetrics = LegacyQualityMetrics & {
  plannedRowCount: number;
  synthesisCandidateCount: number;
  qualityGateAcceptedRows: number;
  qualityGateRejectedRows: number;
  fallbackFieldCount: number;
  orchestratorWarningCount: number;
};

export type QualityComparisonDiagnostics = {
  categoryCount: number;
  legacyProblemCount: number;
  modularCandidateCount: number;
  modularPlannedRowCount: number;
  modularSynthesisCandidateCount: number;
  fallbackFieldCount: number;
  qualityGateIssueCount: number;
  notes: string[];
};

export type DiscoveryQualityComparison = {
  categories: QualityCategoryScore[];
  legacyMetrics: LegacyQualityMetrics;
  modularMetrics: ModularQualityMetrics;
  overallLegacyScore: number;
  overallModularScore: number;
  overallWinner: QualityComparisonWinner;
  diagnostics: QualityComparisonDiagnostics;
};
