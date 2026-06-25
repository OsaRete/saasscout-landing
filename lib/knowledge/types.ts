import type { EvidenceSourceType } from "../evidence";

export type KnowledgeEntityType =
  | "problem"
  | "market"
  | "audience"
  | "source"
  | "opportunity";

export type KnowledgeRelationshipType =
  | "appears_in_market"
  | "affects_audience"
  | "supported_by_source"
  | "similar_to"
  | "duplicates"
  | "competes_with"
  | "enables_opportunity"
  | "derived_from_evidence";

export type KnowledgeSource = {
  id: string;
  sourceType: EvidenceSourceType;
  name: string | null;
  url: string | null;
  qualityScore: number;
  capturedAt: string;
  evidenceFingerprint: string;
  provenance?: Record<string, unknown>;
};

export type KnowledgeProblem = {
  id: string;
  title: string;
  normalizedTitle: string;
  fingerprint: string;
  market: string | null;
  audience: string | null;
  nicheCategory: string | null;
  description: string | null;
  evidenceCount: number;
  averagePainIntensity: number;
  averageFrequencySignal: number;
  averageBuyingIntentSignal: number;
  confidenceScore: number;
  firstSeenAt: string;
  lastSeenAt: string;
  sourceIds: string[];
};

export type KnowledgeRelationship = {
  id: string;
  from: {
    type: KnowledgeEntityType;
    id: string;
  };
  to: {
    type: KnowledgeEntityType;
    id: string;
  };
  relationshipType: KnowledgeRelationshipType;
  strength: number;
  evidenceCount: number;
  confidenceScore: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

export type KnowledgeUpdateInput = {
  problem: Omit<
    KnowledgeProblem,
    | "id"
    | "evidenceCount"
    | "averagePainIntensity"
    | "averageFrequencySignal"
    | "averageBuyingIntentSignal"
    | "confidenceScore"
    | "firstSeenAt"
    | "lastSeenAt"
    | "sourceIds"
  >;
  source: KnowledgeSource;
  evidence: {
    fingerprint: string;
    capturedAt: string;
    confidenceScore: number;
    painIntensity: number;
    frequencySignal: number;
    buyingIntentSignal: number;
  };
  relationships: KnowledgeRelationship[];
};

export type KnowledgeConsolidationCandidate = {
  fingerprint: string;
  normalizedTitle: string;
  market: string | null;
  audience: string | null;
  evidenceFingerprints: string[];
  evidenceCount: number;
  confidenceScore: number;
  lastSeenAt: string;
};

export type KnowledgeConsolidationResult = {
  canonicalFingerprint: string;
  candidates: KnowledgeConsolidationCandidate[];
  mergedEvidenceCount: number;
  confidenceScore: number;
  relationshipStrength: number;
  shouldMerge: boolean;
  reasons: string[];
};

export type ConfidenceEvolutionInput = {
  evidenceCount: number;
  averageEvidenceConfidence: number;
  averageSourceQuality: number;
  latestEvidenceAt: string;
  now?: string | Date;
};
