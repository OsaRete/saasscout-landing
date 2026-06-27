import type { Evidence, EvidenceInput, EvidenceValidationResult } from "../evidence";
import type {
  KnowledgeConsolidationResult,
  KnowledgeProblem,
  KnowledgeRelationship,
  KnowledgeUpdateInput,
} from "../knowledge";
import type { ProblemDeduplicationResult } from "../knowledge/deduplication";
import type { PainDetectionResult } from "../engines/pain";
import type { PatternDetectionResult } from "../engines/pattern";
import type { TrendDetectionResult } from "../engines/trend";
import type { OpportunityDetectionResult } from "../engines/opportunity";
import type { MonetizationDetectionResult } from "../engines/monetization";
import type { FounderIntelligenceResult, FounderProfile } from "../engines/founder";
import type { ConfidenceDetectionResult } from "../engines/confidence";
import type { FeedbackEvent, FeedbackLearningResult } from "../engines/feedback";

export type DiscoveryStage =
  | "initialized"
  | "evidence_collected"
  | "evidence_normalized"
  | "knowledge_updates_built"
  | "knowledge_consolidated"
  | "confidence_evaluated"
  | "decision_context_prepared"
  | "result_produced";

export type DiscoveryPipelineStage =
  | "evidence_normalization"
  | "knowledge_update_preparation"
  | "pain_detection"
  | "pattern_detection"
  | "trend_detection"
  | "opportunity_detection"
  | "monetization_evaluation"
  | "founder_intelligence"
  | "confidence_evaluation"
  | "feedback_learning"
  | "semantic_problem_deduplication";

export type DiscoveryStageStatus = "ready" | "skipped" | "completed";

export type DiscoveryPipelineStageDiagnostic = {
  stage: DiscoveryPipelineStage;
  status: DiscoveryStageStatus;
  requiredInputs: string[];
  availableInputs: string[];
  missingInputs: string[];
  warnings: string[];
};

export type DiscoveryInput = {
  id?: string;
  query?: string | null;
  sources?: EvidenceInput[];
  knownProblems?: KnowledgeProblem[];
  relationships?: KnowledgeRelationship[];
  founderProfile?: FounderProfile | null;
  feedbackEvents?: FeedbackEvent[];
  context?: Record<string, unknown>;
  requestedAt?: string | Date;
};

export type DiscoveryModularPipelineOptions = {
  enabled?: boolean;
  dryRun?: boolean;
  stages?: DiscoveryPipelineStage[];
};

export type DiscoveryContext = {
  runId: string;
  requestedAt: string;
  metadata: Record<string, unknown>;
};

export type DiscoveryMetrics = {
  evidenceInputCount: number;
  evidenceCount: number;
  validEvidenceCount: number;
  knowledgeUpdateCount: number;
  relationshipCount: number;
  consolidationCandidateCount: number;
  confidenceScore: number;
  completedStageCount: number;
  modularStageCount?: number;
  skippedModularStageCount?: number;
};

export type DiscoveryModularPipelineOutputs = {
  evidenceNormalization?: {
    evidence: Evidence[];
    validation: EvidenceValidationResult[];
  };
  knowledgeUpdatePreparation?: {
    knowledgeUpdates: KnowledgeUpdateInput[];
  };
  painDetection?: PainDetectionResult;
  patternDetection?: PatternDetectionResult;
  trendDetection?: TrendDetectionResult;
  opportunityDetection?: OpportunityDetectionResult;
  monetizationEvaluation?: MonetizationDetectionResult;
  founderIntelligence?: FounderIntelligenceResult;
  confidenceEvaluation?: ConfidenceDetectionResult;
  feedbackLearning?: FeedbackLearningResult;
  semanticProblemDeduplication?: ProblemDeduplicationResult;
};

export type DiscoveryModularPipelineResult = {
  runId: string;
  dryRun: boolean;
  diagnostics: DiscoveryPipelineStageDiagnostic[];
  outputs: DiscoveryModularPipelineOutputs;
  warnings: string[];
  completedAt: string;
};

export type DiscoveryDecisionContext = {
  evidence: Evidence[];
  knowledgeUpdates: KnowledgeUpdateInput[];
  consolidation: KnowledgeConsolidationResult;
  confidenceScore: number;
  rationale: string[];
};

export type DiscoveryResult = {
  runId: string;
  stage: DiscoveryStage;
  decisionContext: DiscoveryDecisionContext;
  metrics: DiscoveryMetrics;
  modularPipeline?: DiscoveryModularPipelineResult;
  warnings: string[];
  completedAt: string;
};

export type DiscoveryPipelineState = {
  input: DiscoveryInput;
  context: DiscoveryContext;
  stage: DiscoveryStage;
  rawEvidenceInputs: EvidenceInput[];
  collectedEvidence: Evidence[];
  normalizedEvidence: Evidence[];
  evidenceValidation: EvidenceValidationResult[];
  knowledgeUpdates: KnowledgeUpdateInput[];
  consolidation: KnowledgeConsolidationResult | null;
  confidenceScore: number | null;
  decisionContext: DiscoveryDecisionContext | null;
  result: DiscoveryResult | null;
  modularPipeline: DiscoveryModularPipelineResult | null;
  warnings: string[];
  completedStages: DiscoveryStage[];
};
