import type { Evidence } from "../../evidence";
import type { KnowledgeProblem, KnowledgeRelationship, KnowledgeUpdateInput } from "../../knowledge";
import type { PainCandidate, PainSignal } from "../pain";
import type { PatternCandidate, PatternSignal } from "../pattern";

export type TrendMomentum = "unknown" | "flat" | "building" | "accelerating" | "surging";

export type TrendVelocity = "unknown" | "slow" | "steady" | "fast" | "breakout";

export type TrendDirection = "unknown" | "declining" | "stable" | "emerging" | "rising";

export type TrendEvidence = {
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

export type TrendTimeWindow = {
  id: string;
  label: string;
  startsAt: string;
  endsAt: string;
  evidenceCount: number;
  averagePainIntensity: number;
  averageFrequencySignal: number;
  averageEvidenceConfidence: number;
  averageSourceQuality: number;
};

export type TrendContext = {
  market: string | null;
  audience: string | null;
  nicheCategory: string | null;
  primaryTheme: string;
  painCandidateIds: string[];
  patternCandidateIds: string[];
  knowledgeProblemIds: string[];
  relatedRelationshipIds: string[];
};

export type TrendSignal = {
  id: string;
  label: string;
  normalizedLabel: string;
  context: TrendContext;
  evidence: TrendEvidence[];
  timeWindows: TrendTimeWindow[];
  momentum: TrendMomentum;
  velocity: TrendVelocity;
  direction: TrendDirection;
  emergenceScore: number;
  intensityChange: number;
  frequencyChange: number;
};

export type TrendScore = {
  momentumScore: number;
  velocityScore: number;
  directionScore: number;
  emergenceScore: number;
  evidenceScore: number;
  confidenceScore: number;
  totalScore: number;
  rationale: string[];
};

export type TrendCandidate = {
  id: string;
  title: string;
  normalizedTitle: string;
  context: TrendContext;
  evidence: TrendEvidence[];
  timeWindows: TrendTimeWindow[];
  momentum: TrendMomentum;
  velocity: TrendVelocity;
  direction: TrendDirection;
  score: TrendScore;
  rank: number;
};

export type TrendDetectionInput = {
  evidence?: Evidence[];
  painCandidates?: PainCandidate[];
  painSignals?: PainSignal[];
  patternCandidates?: PatternCandidate[];
  patternSignals?: PatternSignal[];
  knowledgeUpdates?: KnowledgeUpdateInput[];
  knownProblems?: KnowledgeProblem[];
  relationships?: KnowledgeRelationship[];
  timeWindowDays?: number;
  minimumWindowCount?: number;
  runId?: string;
  detectedAt?: string | Date;
};

export type TrendDetectionResult = {
  runId: string;
  detectedAt: string;
  candidates: TrendCandidate[];
  signals: TrendSignal[];
  warnings: string[];
  summary: {
    evidenceCount: number;
    painCandidateCount: number;
    patternCandidateCount: number;
    signalCount: number;
    candidateCount: number;
    highestScore: number;
    averageConfidence: number;
  };
};
