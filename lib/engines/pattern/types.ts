import type { Evidence } from "../../evidence";
import type { KnowledgeProblem, KnowledgeRelationship, KnowledgeUpdateInput } from "../../knowledge";
import type { PainCandidate, PainSignal } from "../pain";

export type PatternStrength = "unknown" | "weak" | "moderate" | "strong" | "dominant";

export type PatternFrequency = "unknown" | "isolated" | "repeated" | "recurring" | "systemic";

export type PatternRelationshipType = "theme" | "market" | "audience" | "workflow" | "niche" | "knowledge";

export type PatternEvidence = {
  fingerprint: string;
  sourceType: Evidence["sourceType"];
  sourceName: string | null;
  sourceUrl: string | null;
  capturedAt: string;
  claim: string;
  market: string | null;
  audience: string | null;
  nicheCategory: string | null;
  painIntensity: number;
  frequencySignal: number;
  confidenceScore: number;
  sourceQualityScore: number;
};

export type PatternContext = {
  primaryTheme: string;
  markets: string[];
  audiences: string[];
  niches: string[];
  workflowTerms: string[];
  painCandidateIds: string[];
  knowledgeProblemIds: string[];
  relatedRelationshipIds: string[];
};

export type PatternRelationship = {
  id: string;
  relationshipType: PatternRelationshipType;
  label: string;
  strength: number;
  evidenceCount: number;
  confidenceScore: number;
  relatedPainCandidateIds: string[];
  relatedKnowledgeRelationshipIds: string[];
};

export type PatternSignal = {
  id: string;
  label: string;
  normalizedLabel: string;
  signalType: PatternRelationshipType;
  context: PatternContext;
  evidence: PatternEvidence[];
  relationships: PatternRelationship[];
  averagePainIntensity: number;
  averageFrequencySignal: number;
  averageEvidenceConfidence: number;
  averageSourceQuality: number;
};

export type PatternScore = {
  themeScore: number;
  relationshipScore: number;
  frequencyScore: number;
  evidenceScore: number;
  confidenceScore: number;
  totalScore: number;
  rationale: string[];
};

export type PatternCandidate = {
  id: string;
  title: string;
  normalizedTitle: string;
  context: PatternContext;
  evidence: PatternEvidence[];
  relationships: PatternRelationship[];
  strength: PatternStrength;
  frequency: PatternFrequency;
  score: PatternScore;
  rank: number;
};

export type PatternDetectionInput = {
  evidence?: Evidence[];
  painCandidates?: PainCandidate[];
  painSignals?: PainSignal[];
  knowledgeUpdates?: KnowledgeUpdateInput[];
  knownProblems?: KnowledgeProblem[];
  relationships?: KnowledgeRelationship[];
  workflowKeywords?: string[];
  runId?: string;
  detectedAt?: string | Date;
};

export type PatternDetectionResult = {
  runId: string;
  detectedAt: string;
  candidates: PatternCandidate[];
  signals: PatternSignal[];
  relationships: PatternRelationship[];
  warnings: string[];
  summary: {
    evidenceCount: number;
    painCandidateCount: number;
    signalCount: number;
    relationshipCount: number;
    candidateCount: number;
    highestScore: number;
    averageConfidence: number;
  };
};
