export { calculateKnowledgeConfidence } from "./confidence";
export {
  evaluateKnowledgeConsolidation,
  prepareProblemConsolidationCandidates,
} from "./consolidation";
export { evidenceToKnowledgeUpdateInput } from "./evidence";
export {
  generateKnowledgeId,
  generateKnowledgeProblemFingerprint,
  normalizeKnowledgeText,
} from "./fingerprint";
export { createKnowledgeRelationship, relationshipEntityId } from "./relationships";
export type {
  ConfidenceEvolutionInput,
  KnowledgeConsolidationCandidate,
  KnowledgeConsolidationResult,
  KnowledgeEntityType,
  KnowledgeProblem,
  KnowledgeRelationship,
  KnowledgeRelationshipType,
  KnowledgeSource,
  KnowledgeUpdateInput,
} from "./types";

export * from "./deduplication";
export * from "./evolution";

export { updateProblemIntelligence } from "./problem-intelligence-store";
export type { ProblemIntelligenceInput } from "./problem-intelligence-store";
