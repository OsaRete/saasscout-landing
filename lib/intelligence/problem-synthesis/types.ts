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

export type ProblemSynthesisDiagnostics = {
  synthesizedTitle: string;
  synthesizedSummary: string;
  evidenceCount: number;
  evidenceReferences: string[];
  confidence: number;
  synthesisCompleteness: number;
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
