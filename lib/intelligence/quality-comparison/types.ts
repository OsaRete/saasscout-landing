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
  | "row_level_synthesis_readiness"
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
  rowLevelSynthesisReadinessScore: number;
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
  fallbackFieldsCounted: string[];
  fallbackFieldsByRow: Array<{ rowIndex: number; fields: string[] }>;
  buildDifficultyFallbackOnlyRowCount: number;
  buildDifficultyFallbackOnlyRows: number[];
  qualityGateIssueCount: number;
  buildDifficultyMappingByRow: Array<{ rowIndex: number; diagnostic: { source: string; opportunityCandidateId: string | null; rawBuildSimplicityScore: number | null; persistedValue: string; attribution: string } }>;
  affectedNicheEnrichmentByRow: Array<{ rowIndex: number; diagnostic: { source: string; baseValueCount: number; enrichedValueCount: number; addedValues: string[]; persistedValue: string; fallbackAvoided: boolean } }>;
  marketCoverage: {
    legacyUniqueAffectedNicheTokens: string[];
    modularUniqueAffectedNicheTokens: string[];
    denominator: number;
    calculation: string;
  };
  synthesisCompleteness: {
    modularCandidateCount: number;
    modularSynthesisCandidateCount: number;
    formula: string;
    representsCandidateCompressionRatio: boolean;
    representsTrueRowQuality: boolean;
    explanation: string;
  };
  synthesisCompressionRatio: {
    score: number;
    formula: string;
    explanation: string;
  };
  rowLevelSynthesisReadiness: {
    score: number;
    plannedRowCount: number;
    acceptedRowCount: number;
    rejectedRowCount: number;
    issueCount: number;
    formula: string;
    explanation: string;
  };
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
