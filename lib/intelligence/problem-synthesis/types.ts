import type { Evidence } from "../../evidence";
import type { ConfidenceDetectionResult } from "../../engines/confidence";
import type { FeedbackLearningResult } from "../../engines/feedback";
import type { MonetizationDetectionResult } from "../../engines/monetization";
import type { OpportunityDetectionResult } from "../../engines/opportunity";
import type { PainDetectionResult } from "../../engines/pain";
import type { PatternDetectionResult } from "../../engines/pattern";
import type { TrendDetectionResult } from "../../engines/trend";
import type { KnowledgeProblem, KnowledgeRelationship, KnowledgeUpdateInput } from "../../knowledge";

export type ProblemSynthesisInput = {
  evidence: Evidence[];
  knowledgeUpdates?: KnowledgeUpdateInput[];
  knownProblems?: KnowledgeProblem[];
  relationships?: KnowledgeRelationship[];
  painDetection?: PainDetectionResult;
  patternDetection?: PatternDetectionResult;
  trendDetection?: TrendDetectionResult;
  opportunityDetection?: OpportunityDetectionResult;
  monetizationEvaluation?: MonetizationDetectionResult;
  confidenceEvaluation?: ConfidenceDetectionResult;
  feedbackLearning?: FeedbackLearningResult;
  runId?: string;
  synthesizedAt?: string | Date;
};

export type ProblemNarrative = {
  title: string;
  summary: string;
  primaryTheme: string;
  rationale: string[];
};

export type ProblemScoreBreakdown = {
  painScore: number;
  urgencyScore: number;
  frequencyScore: number;
  trendScore: number;
  opportunityScore: number;
  revenueScore: number;
  buyingSignalScore: number;
  sourceQualityScore: number;
  confidenceScore: number;
  totalScore: number;
};

export type ProblemEvidenceSummary = {
  evidenceCount: number;
  sourceCount: number;
  sourceNames: string[];
  markets: string[];
  audiences: string[];
  claims: string[];
  references: string[];
  summary: string;
};

export type ProblemSynthesisSeedDiagnostic = {
  title: string;
  normalizedTitle: string;
  market: string;
  audience: string;
  problemCluster: string;
  score: number;
  rejectionReasons: string[];
  engineSupport: string[];
  evidenceCount: number;
  genericTitle: boolean;
  downrankedGeneric: boolean;
  semanticTitle?: string;
  semanticTitleScore?: number;
  rawTitleRejected?: boolean;
  rawTitleRejectionReasons?: string[];
};

export type ProblemSynthesisCandidateCollapseReport = {
  upstreamCandidateCounts: {
    pain: number;
    pattern: number;
    trend: number;
    opportunity: number;
    monetization: number;
    confidence: number;
  };
  totalPossibleSynthesisSeedCount: number;
  uniqueNormalizedTitleCount: number;
  uniqueTitleMarketAudienceClusterCount: number;
  eligibleSynthesisClusterCount: number;
  emittedSynthesisCandidateCount: number;
  rejectedSynthesisClusterCount: number;
  rejectionReasons: Array<{ reason: string; count: number }>;
  topPotentialNextCandidateTitles: string[];
  extractedSeedCount: number;
  rankedSeedCount: number;
  genericTitleSeedCount: number;
  downrankedGenericSeedCount: number;
  topRankedSeedTitles: string[];
  topRankedSeedScores: number[];
  topRejectedSeedTitles: string[];
  topRejectionReasons: string[];
  seedsWithCrossEngineSupport: number;
  seedsWithoutEnoughEvidence: number;
  rankedSeeds: ProblemSynthesisSeedDiagnostic[];
  singleCandidateMode: boolean;
  semanticTitlesGenerated: number;
  semanticTitlesSelected: number;
  semanticTitlesRejected: number;
  semanticTitleRejectionReasons: Array<{ reason: string; count: number }>;
  semanticTitleCanonicalization: {
    generatedCount: number;
    uniqueCanonicalTitleCount: number;
    duplicateCanonicalTitleCount: number;
    canonicalTitleCounts: Array<{ title: string; count: number }>;
  };
  rawTitlesRejected: number;
  semanticTitleScoreDistribution: { min: number; max: number; average: number };
  topSemanticTitles: Array<{ title: string; score: number; sourceTitle: string }>;
  rawTitleRejectionReasons: Array<{ reason: string; count: number }>;
  multiCandidateModeEnabled: boolean;
  maxCandidateCount: number;
  emittedCandidateCount: number;
  rejectedCandidateCount: number;
  emittedCandidateTitles: string[];
  rejectedCandidateTitles: string[];
  duplicateRejectionCount: number;
  weakEvidenceRejectionCount: number;
  genericTitleRejectionCount: number;
  semanticTitleQualityScores: Array<{ title: string; score: number }>;
  diversity_score: number;
  emitted_candidate_diversity: Array<{ title: string; businessProcess: string; operationalDomain: string; affectedAudience: string; workflowCategory: string; businessProblemKey: string; diversity_score: number }>;
  suppressed_duplicate_clusters: Array<{ cluster: string; count: number; titles: string[] }>;
  candidate_selection_rejections: Array<{ title: string; reasons: string[]; diversity_score: number }>;
  diversity_distribution: { min: number; max: number; average: number };
  domain_diversity_buckets: Array<{ domain: string; count: number; emitted: number; rejected: number; titles: string[] }>;
  emitted_candidate_domains: Array<{ title: string; domain: string }>;
  rejected_candidate_domains: Array<{ title: string; domain: string; reasons: string[] }>;
  domain_suppression_reasons: Array<{ domain: string; reason: string; count: number }>;
  domain_fill_attempts: Array<{ pass: string; title: string; domain: string; accepted: boolean; reasons: string[] }>;
  available_high_quality_domain_count: number;
  underfilled_candidate_slots_reason: string | null;
  refined_titles_generated: number;
  refined_titles_selected: number;
  title_specificity_distribution: { min: number; max: number; average: number };
  generic_title_penalty_count: number;
  canonical_title_bonus_count: number;
  business_context_bonus_count: number;
  duplicate_title_penalty_count: number;
  title_refinement_rejections: Array<{ reason: string; count: number }>;
  semantic_summaries_generated: number;
  semantic_summaries_selected: number;
  average_summary_length: number;
  duplicated_summary_count: number;
  summary_quality_distribution: { min: number; max: number; average: number };
  summary_generation_rejections: Array<{ reason: string; count: number }>;
  summary_generation_warnings: Array<{ warning: string; count: number }>;
  collapseExplanation: string;
};

export type ProblemSynthesisDiagnostics = {
  synthesizedTitle: string;
  synthesizedSummary: string;
  evidenceCount: number;
  evidenceReferences: string[];
  confidence: number;
  synthesisCompleteness: number;
  candidateCollapseReport: ProblemSynthesisCandidateCollapseReport;
  engineCandidateCounts: {
    pain: number;
    pattern: number;
    trend: number;
    opportunity: number;
    monetization: number;
    confidence: number;
    feedback: number;
  };
  warnings: string[];
};

export type ProblemSynthesisCandidate = {
  id: string;
  synthesizedProblemTitle: string;
  synthesizedSummary: string;
  affectedMarkets: string[];
  affectedAudiences: string[];
  suggestedSolutions: string[];
  conciseEvidenceSummary: string;
  canonicalProblemCluster: string;
  scoreBreakdown: ProblemScoreBreakdown;
  supportingEvidenceReferences: string[];
  confidence: number;
  narrative: ProblemNarrative;
  evidenceSummary: ProblemEvidenceSummary;
  diagnostics: ProblemSynthesisDiagnostics;
};

export type ProblemSynthesisResult = {
  runId: string;
  synthesizedAt: string;
  candidates: ProblemSynthesisCandidate[];
  diagnostics: ProblemSynthesisDiagnostics[];
  warnings: string[];
  summary: {
    evidenceCount: number;
    candidateCount: number;
    averageConfidence: number;
    averageCompleteness: number;
  };
};
