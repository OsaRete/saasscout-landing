import type { Evidence } from "../../evidence";
import type { KnowledgeProblem, KnowledgeRelationship, KnowledgeUpdateInput } from "../../knowledge";
import type { FounderOpportunityFit } from "../founder";
import type { MonetizationCandidate } from "../monetization";
import type { OpportunityCandidate } from "../opportunity";
import type { PainCandidate } from "../pain";
import type { PatternCandidate } from "../pattern";
import type { TrendCandidate } from "../trend";

export type ConfidenceLevel = "unsupported" | "low" | "moderate" | "high" | "very_high";
export type EvidenceQualitySignal = "missing" | "weak" | "acceptable" | "strong" | "excellent";
export type SourceDiversitySignal = "missing" | "single_source" | "limited" | "diverse" | "highly_diverse";
export type RecencySignal = "unknown" | "stale" | "aging" | "recent" | "fresh";
export type ConsistencySignal = "unknown" | "conflicting" | "mixed" | "consistent" | "reinforced";
export type ValidationSignal = "none" | "implicit" | "partial" | "validated" | "strongly_validated";
export type InferenceRisk = "unknown" | "low" | "moderate" | "high" | "critical";
export type ConfidenceCandidateKind = "evidence" | "knowledge" | "pain" | "pattern" | "trend" | "opportunity" | "monetization" | "founder_fit" | "recommendation" | "conclusion";

export type ConfidenceEvidence = {
  fingerprint: string;
  sourceType: Evidence["sourceType"];
  sourceName: string | null;
  sourceUrl: string | null;
  capturedAt: string;
  claim: string;
  confidenceScore: number;
  sourceQualityScore: number;
  market: string | null;
  audience: string | null;
  nicheCategory: string | null;
};

export type ConfidenceContext = {
  market: string | null;
  audience: string | null;
  nicheCategory: string | null;
  primaryClaim: string;
  evidenceFingerprints: string[];
  knowledgeProblemIds: string[];
  relatedRelationshipIds: string[];
  painCandidateIds: string[];
  patternCandidateIds: string[];
  trendCandidateIds: string[];
  opportunityCandidateIds: string[];
  monetizationCandidateIds: string[];
  founderFitCandidateIds: string[];
};

export type ConfidenceSignal = {
  id: string;
  candidateId: string;
  candidateKind: ConfidenceCandidateKind;
  context: ConfidenceContext;
  evidence: ConfidenceEvidence[];
  evidenceQualityScore: number;
  sourceDiversityScore: number;
  recencyScore: number;
  consistencyScore: number;
  validationStrengthScore: number;
  inferenceRiskScore: number;
  evidenceQualitySignal: EvidenceQualitySignal;
  sourceDiversitySignal: SourceDiversitySignal;
  recencySignal: RecencySignal;
  consistencySignal: ConsistencySignal;
  validationSignal: ValidationSignal;
  inferenceRisk: InferenceRisk;
};

export type ConfidenceScore = {
  evidenceQualityScore: number;
  sourceDiversityScore: number;
  recencyScore: number;
  consistencyScore: number;
  validationStrengthScore: number;
  inferenceRiskScore: number;
  totalScore: number;
  level: ConfidenceLevel;
  rationale: string[];
};

export type ConfidenceCandidate = {
  id: string;
  kind: ConfidenceCandidateKind;
  title: string;
  normalizedTitle: string;
  context: ConfidenceContext;
  evidence: ConfidenceEvidence[];
  score: ConfidenceScore;
  rank: number;
};

export type ConfidenceDetectionInput = {
  evidence?: Evidence[];
  knowledgeUpdates?: KnowledgeUpdateInput[];
  knownProblems?: KnowledgeProblem[];
  relationships?: KnowledgeRelationship[];
  painCandidates?: PainCandidate[];
  patternCandidates?: PatternCandidate[];
  trendCandidates?: TrendCandidate[];
  opportunityCandidates?: OpportunityCandidate[];
  monetizationCandidates?: MonetizationCandidate[];
  founderFits?: FounderOpportunityFit[];
  runId?: string;
  detectedAt?: string | Date;
};

export type ConfidenceDetectionResult = {
  runId: string;
  detectedAt: string;
  candidates: ConfidenceCandidate[];
  signals: ConfidenceSignal[];
  warnings: string[];
  summary: {
    evidenceCount: number;
    knowledgeProblemCount: number;
    painCandidateCount: number;
    patternCandidateCount: number;
    trendCandidateCount: number;
    opportunityCandidateCount: number;
    monetizationCandidateCount: number;
    founderFitCandidateCount: number;
    signalCount: number;
    candidateCount: number;
    highestScore: number;
    averageConfidence: number;
  };
};
