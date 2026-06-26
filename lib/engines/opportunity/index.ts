export { OpportunityEngine } from "./engine";
export { rankOpportunityCandidates } from "./ranking";
export {
  createOpportunityContext,
  createOpportunityMarketContext,
  createOpportunityRelationshipId,
  dedupeOpportunityEvidence,
} from "./relationships";
export {
  averageOpportunityScore,
  calculateCompositeOpportunityScore,
  normalizeOpportunityScore,
  readinessFromScore,
  riskFromScore,
  riskPenaltyFromRisk,
} from "./scoring";
export type {
  OpportunityCandidate,
  OpportunityContext,
  OpportunityDetectionInput,
  OpportunityDetectionResult,
  OpportunityEvidence,
  OpportunityMarketContext,
  OpportunityReadiness,
  OpportunityRisk,
  OpportunityScore,
  OpportunitySignal,
} from "./types";
export { validateOpportunityDetectionInput, validateOpportunityDetectionResult } from "./validation";
