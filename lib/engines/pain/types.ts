import type { Evidence } from "../../evidence";
import type { KnowledgeProblem, KnowledgeRelationship, KnowledgeUpdateInput } from "../../knowledge";

export type PainSeverity = "unknown" | "low" | "medium" | "high" | "critical";

export type PainFrequency = "unknown" | "rare" | "occasional" | "recurring" | "persistent";

export type PainEvidence = {
  fingerprint: string;
  sourceType: Evidence["sourceType"];
  sourceName: string | null;
  sourceUrl: string | null;
  capturedAt: string;
  claim: string;
  painIntensity: number;
  frequencySignal: number;
  confidenceScore: number;
  sourceQualityScore: number;
};

export type PainContext = {
  market: string | null;
  audience: string | null;
  nicheCategory: string | null;
  knowledgeProblemId: string | null;
  relatedRelationshipIds: string[];
};

export type PainSignal = {
  id: string;
  title: string;
  normalizedTitle: string;
  context: PainContext;
  evidence: PainEvidence[];
  severity: PainSeverity;
  frequency: PainFrequency;
  averagePainIntensity: number;
  averageFrequencySignal: number;
  averageEvidenceConfidence: number;
  averageSourceQuality: number;
};

export type PainScore = {
  severityScore: number;
  frequencyScore: number;
  evidenceScore: number;
  confidenceScore: number;
  totalScore: number;
  rationale: string[];
};

export type PainCandidate = {
  id: string;
  title: string;
  normalizedTitle: string;
  context: PainContext;
  evidence: PainEvidence[];
  severity: PainSeverity;
  frequency: PainFrequency;
  score: PainScore;
  rank: number;
};

export type PainDetectionInput = {
  evidence: Evidence[];
  knowledgeUpdates?: KnowledgeUpdateInput[];
  knownProblems?: KnowledgeProblem[];
  relationships?: KnowledgeRelationship[];
  runId?: string;
  detectedAt?: string | Date;
};

export type PainDetectionResult = {
  runId: string;
  detectedAt: string;
  candidates: PainCandidate[];
  signals: PainSignal[];
  warnings: string[];
  summary: {
    evidenceCount: number;
    signalCount: number;
    candidateCount: number;
    highestScore: number;
    averageConfidence: number;
  };
};
