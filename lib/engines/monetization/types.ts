import type { Evidence } from "../../evidence";
import type { KnowledgeProblem, KnowledgeRelationship, KnowledgeUpdateInput } from "../../knowledge";
import type { OpportunityCandidate, OpportunitySignal } from "../opportunity";
import type { PainCandidate, PainSignal } from "../pain";
import type { PatternCandidate, PatternSignal } from "../pattern";
import type { TrendCandidate, TrendSignal } from "../trend";

export type RevenuePotential = "unknown" | "weak" | "modest" | "strong" | "exceptional";
export type PricingHypothesis = "unknown" | "usage_based" | "seat_based" | "subscription" | "transactional" | "enterprise";
export type MonetizationRisk = "unknown" | "low" | "moderate" | "high" | "critical";
export type WillingnessToPaySignal = "unknown" | "low" | "moderate" | "high" | "urgent";
export type MarketSizeSignal = "unknown" | "niche" | "focused" | "large" | "expansive";
export type CompetitionSignal = "unknown" | "low" | "moderate" | "crowded" | "saturated";
export type RecurrenceSignal = "unknown" | "one_time" | "occasional" | "recurring" | "persistent";

export type MonetizationEvidence = {
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

export type MonetizationContext = {
  market: string | null;
  audience: string | null;
  nicheCategory: string | null;
  primaryProblem: string;
  opportunityCandidateIds: string[];
  painCandidateIds: string[];
  patternCandidateIds: string[];
  trendCandidateIds: string[];
  knowledgeProblemIds: string[];
  evidenceFingerprints: string[];
  relatedRelationshipIds: string[];
};

export type MonetizationSignal = {
  id: string;
  title: string;
  normalizedTitle: string;
  context: MonetizationContext;
  evidence: MonetizationEvidence[];
  willingnessToPayScore: number;
  revenuePotentialScore: number;
  pricingHypothesisScore: number;
  marketSizeScore: number;
  competitionPressureScore: number;
  recurringPotentialScore: number;
  willingnessToPaySignal: WillingnessToPaySignal;
  revenuePotential: RevenuePotential;
  pricingHypothesis: PricingHypothesis;
  marketSizeSignal: MarketSizeSignal;
  competitionSignal: CompetitionSignal;
  recurrenceSignal: RecurrenceSignal;
  risk: MonetizationRisk;
};

export type MonetizationScore = {
  willingnessToPayScore: number;
  revenuePotentialScore: number;
  pricingHypothesisScore: number;
  marketSizeScore: number;
  competitionPressureScore: number;
  recurringPotentialScore: number;
  evidenceScore: number;
  confidenceScore: number;
  riskPenalty: number;
  totalScore: number;
  rationale: string[];
};

export type MonetizationCandidate = {
  id: string;
  title: string;
  normalizedTitle: string;
  context: MonetizationContext;
  evidence: MonetizationEvidence[];
  score: MonetizationScore;
  willingnessToPaySignal: WillingnessToPaySignal;
  revenuePotential: RevenuePotential;
  pricingHypothesis: PricingHypothesis;
  marketSizeSignal: MarketSizeSignal;
  competitionSignal: CompetitionSignal;
  recurrenceSignal: RecurrenceSignal;
  risk: MonetizationRisk;
  rank: number;
};

export type MonetizationDetectionInput = {
  evidence?: Evidence[];
  opportunityCandidates?: OpportunityCandidate[];
  opportunitySignals?: OpportunitySignal[];
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

export type MonetizationDetectionResult = {
  runId: string;
  detectedAt: string;
  candidates: MonetizationCandidate[];
  signals: MonetizationSignal[];
  warnings: string[];
  summary: {
    evidenceCount: number;
    opportunityCandidateCount: number;
    painCandidateCount: number;
    patternCandidateCount: number;
    trendCandidateCount: number;
    signalCount: number;
    candidateCount: number;
    highestScore: number;
    averageConfidence: number;
  };
};
