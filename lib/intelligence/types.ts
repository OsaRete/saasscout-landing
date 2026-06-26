import type { Evidence, EvidenceInput, EvidenceValidationResult } from "../evidence";
import type {
  KnowledgeConsolidationResult,
  KnowledgeUpdateInput,
} from "../knowledge";

export type DiscoveryStage =
  | "initialized"
  | "evidence_collected"
  | "evidence_normalized"
  | "knowledge_updates_built"
  | "knowledge_consolidated"
  | "confidence_evaluated"
  | "decision_context_prepared"
  | "result_produced";

export type DiscoveryInput = {
  id?: string;
  query?: string | null;
  sources?: EvidenceInput[];
  context?: Record<string, unknown>;
  requestedAt?: string | Date;
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
  warnings: string[];
  completedStages: DiscoveryStage[];
};
