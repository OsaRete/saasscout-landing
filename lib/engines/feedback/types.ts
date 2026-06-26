import type { Evidence } from "../../evidence";
import type { KnowledgeProblem, KnowledgeRelationship, KnowledgeUpdateInput } from "../../knowledge";
import type { ConfidenceCandidate } from "../confidence";
import type { FounderOpportunityFit } from "../founder";
import type { MonetizationCandidate } from "../monetization";
import type { OpportunityCandidate } from "../opportunity";
import type { PainCandidate } from "../pain";
import type { PatternCandidate } from "../pattern";
import type { TrendCandidate } from "../trend";

export type FeedbackSource = "user_behavior" | "validation" | "revenue" | "pivot" | "abandonment" | "recommendation" | "market_outcome" | "manual" | "unknown";
export type FeedbackOutcomeType = "validated" | "invalidated" | "revenue_generated" | "pivoted" | "abandoned" | "recommendation_accepted" | "recommendation_rejected" | "neutral" | "unknown";
export type FeedbackStrength = "none" | "weak" | "moderate" | "strong" | "decisive";
export type FeedbackOutcome = { type: FeedbackOutcomeType; label: string; occurredAt: string; revenueUsd?: number | null; notes?: string | null };

export type FeedbackContext = { market: string | null; audience: string | null; nicheCategory: string | null; evidenceFingerprints: string[]; knowledgeProblemIds: string[]; relatedRelationshipIds: string[]; painCandidateIds: string[]; patternCandidateIds: string[]; trendCandidateIds: string[]; opportunityCandidateIds: string[]; monetizationCandidateIds: string[]; founderFitCandidateIds: string[]; confidenceCandidateIds: string[] };

export type FeedbackEvent = { id: string; source: FeedbackSource; sourceId?: string | null; title: string; occurredAt: string; outcome: FeedbackOutcome; context: FeedbackContext; strengthScore?: number | null; confidenceScore?: number | null; metadata?: Record<string, unknown> };

export type ValidationFeedback = { interviewsCompleted?: number; signups?: number; waitlistJoins?: number; paidPreorders?: number; negativeResponses?: number; targetReached?: boolean };
export type RevenueFeedback = { revenueUsd: number; payingCustomers: number; recurringRevenueUsd?: number; churnedCustomers?: number; refundCount?: number };
export type PivotFeedback = { changedMarket?: boolean; changedAudience?: boolean; changedProblem?: boolean; changedSolution?: boolean; retainedEvidenceRatio?: number };
export type AbandonmentFeedback = { reason: "no_demand" | "too_expensive" | "too_complex" | "competition" | "founder_constraint" | "unknown"; attemptsCompleted?: number; explicitNoDemandSignals?: number };
export type RecommendationFeedback = { accepted?: boolean; actedOn?: boolean; saved?: boolean; dismissed?: boolean; conversion?: boolean; rating?: number | null };

export type FeedbackSignal = { id: string; eventId: string; source: FeedbackSource; outcomeType: FeedbackOutcomeType; context: FeedbackContext; event: FeedbackEvent; validationScore: number; revenueScore: number; pivotScore: number; abandonmentScore: number; recommendationQualityScore: number; strengthScore: number; learningImpactScore: number; strength: FeedbackStrength; direction: "positive" | "negative" | "mixed" | "neutral" };

export type FeedbackScore = { validationScore: number; revenueScore: number; pivotScore: number; abandonmentScore: number; recommendationQualityScore: number; strengthScore: number; learningImpactScore: number; totalScore: number; rationale: string[] };

export type FeedbackLearningInput = { events: FeedbackEvent[]; evidence?: Evidence[]; knowledgeUpdates?: KnowledgeUpdateInput[]; knownProblems?: KnowledgeProblem[]; relationships?: KnowledgeRelationship[]; painCandidates?: PainCandidate[]; patternCandidates?: PatternCandidate[]; trendCandidates?: TrendCandidate[]; opportunityCandidates?: OpportunityCandidate[]; monetizationCandidates?: MonetizationCandidate[]; founderFits?: FounderOpportunityFit[]; confidenceCandidates?: ConfidenceCandidate[]; runId?: string; learnedAt?: string | Date };

export type FeedbackLearningResult = { runId: string; learnedAt: string; signals: FeedbackSignal[]; rankedSignals: FeedbackSignal[]; scores: FeedbackScore[]; warnings: string[]; summary: { eventCount: number; signalCount: number; positiveSignals: number; negativeSignals: number; highestLearningImpact: number; averageLearningImpact: number; affectedEvidenceCount: number; affectedOpportunityCount: number; affectedConfidenceCount: number } };
