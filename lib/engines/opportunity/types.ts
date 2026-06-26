import type { Evidence } from "../../evidence";
import type { KnowledgeProblem, KnowledgeRelationship, KnowledgeUpdateInput } from "../../knowledge";
import type { PainCandidate, PainSignal } from "../pain";
import type { PatternCandidate, PatternSignal } from "../pattern";
import type { TrendCandidate, TrendSignal } from "../trend";

export type OpportunityReadiness = "unknown" | "early" | "validated" | "ready" | "urgent";

export type OpportunityRisk = "unknown" | "low" | "moderate" | "high" | "critical";

export type OpportunityEvidence = {
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
  buyingIntentSignal: number;
  confidenceScore: number;
  sourceQualityScore: number;
};

export type OpportunityMarketContext = {
  market: string | null;
  audience: string | null;
  nicheCategory: string | null;
  primaryProblem: string;
  existingSolutionSignals: string[];
  underservedSignals: string[];
};

export type OpportunityContext = {
  market: string | null;
  audience: string | null;
  nicheCategory: string | null;
  primaryTheme: string;
  painCandidateIds: string[];
  patternCandidateIds: string[];
  trendCandidateIds: string[];
  knowledgeProblemIds: string[];
  relatedRelationshipIds: string[];
};

export type OpportunitySignal = {
  id: string;
  title: string;
  normalizedTitle: string;
  context: OpportunityContext;
  marketContext: OpportunityMarketContext;
  evidence: OpportunityEvidence[];
  painCandidateIds: string[];
  patternCandidateIds: string[];
  trendCandidateIds: string[];
  marketPullScore: number;
  problemUrgencyScore: number;
  solutionPotentialScore: number;
  buildSimplicityScore: number;
  differentiationPotentialScore: number;
  readiness: OpportunityReadiness;
  risk: OpportunityRisk;
};

export type OpportunityScore = {
  marketPullScore: number;
  problemUrgencyScore: number;
  solutionPotentialScore: number;
  buildSimplicityScore: number;
  differentiationPotentialScore: number;
  evidenceScore: number;
  confidenceScore: number;
  riskPenalty: number;
  totalScore: number;
  rationale: string[];
};

export type OpportunityCandidate = {
  id: string;
  title: string;
  normalizedTitle: string;
  context: OpportunityContext;
  marketContext: OpportunityMarketContext;
  evidence: OpportunityEvidence[];
  score: OpportunityScore;
  readiness: OpportunityReadiness;
  risk: OpportunityRisk;
  rank: number;
};

export type OpportunityDetectionInput = {
  evidence?: Evidence[];
  painCandidates?: PainCandidate[];
  painSignals?: PainSignal[];
  patternCandidates?: PatternCandidate[];
  patternSignals?: PatternSignal[];
  trendCandidates?: TrendCandidate[];
  trendSignals?: TrendSignal[];
  knowledgeUpdates?: KnowledgeUpdateInput[];
  knownProblems?: KnowledgeProblem[];
  relationships?: KnowledgeRelationship[];
  runId?: string;
  detectedAt?: string | Date;
};

export type OpportunityDetectionResult = {
  runId: string;
  detectedAt: string;
  candidates: OpportunityCandidate[];
  signals: OpportunitySignal[];
  warnings: string[];
  summary: {
    evidenceCount: number;
    painCandidateCount: number;
    patternCandidateCount: number;
    trendCandidateCount: number;
    signalCount: number;
    candidateCount: number;
    highestScore: number;
    averageConfidence: number;
  };
};
