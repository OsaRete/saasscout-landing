import type { Evidence } from "../../evidence";
import type { KnowledgeProblem, KnowledgeRelationship, KnowledgeUpdateInput } from "../../knowledge";
import type { MonetizationCandidate } from "../monetization";
import type { OpportunityCandidate } from "../opportunity";
import type { PainCandidate } from "../pain";
import type { PatternCandidate } from "../pattern";
import type { TrendCandidate } from "../trend";

export type FounderCapabilityType = "skill" | "experience" | "domain" | "distribution" | "technical" | "sales" | "operations" | "capital";
export type FounderConstraintType = "budget" | "time" | "technical" | "market_access" | "compliance" | "team" | "risk_tolerance";
export type FounderGoalType = "income" | "growth" | "learning" | "impact" | "automation" | "portfolio" | "exit";
export type FounderRisk = "unknown" | "low" | "moderate" | "high" | "critical";
export type FounderReadiness = "unknown" | "exploring" | "prepared" | "strong" | "exceptional";

export type FounderCapability = {
  id: string;
  type: FounderCapabilityType;
  label: string;
  normalizedLabel: string;
  strengthScore: number;
  evidenceRefs: string[];
  notes?: string | null;
};

export type FounderConstraint = {
  id: string;
  type: FounderConstraintType;
  label: string;
  normalizedLabel: string;
  severityScore: number;
  notes?: string | null;
};

export type FounderGoal = {
  id: string;
  type: FounderGoalType;
  label: string;
  normalizedLabel: string;
  priorityScore: number;
  target?: string | null;
};

export type FounderProfile = {
  id: string;
  name?: string | null;
  skills: string[];
  experience: string[];
  interests: string[];
  availableBudgetUsd: number | null;
  availableHoursPerWeek: number | null;
  capabilities?: FounderCapability[];
  constraints?: FounderConstraint[];
  goals?: FounderGoal[];
  metadata?: Record<string, unknown>;
};

export type FounderContext = {
  founderProfileId: string;
  normalizedSkills: string[];
  normalizedExperience: string[];
  normalizedInterests: string[];
  capabilityIds: string[];
  constraintIds: string[];
  goalIds: string[];
};

export type FounderSignal = {
  id: string;
  label: string;
  normalizedLabel: string;
  source: "skill" | "experience" | "interest" | "capability" | "constraint" | "goal" | "budget" | "time";
  strengthScore: number;
};

export type FounderFitCandidate = {
  id: string;
  title: string;
  normalizedTitle: string;
  opportunityCandidate: OpportunityCandidate;
  monetizationCandidate?: MonetizationCandidate | null;
  relatedPainCandidates: PainCandidate[];
  relatedPatternCandidates: PatternCandidate[];
  relatedTrendCandidates: TrendCandidate[];
  evidenceFingerprints: string[];
  knowledgeProblemIds: string[];
  relatedRelationshipIds: string[];
};

export type FounderFitScore = {
  skillFitScore: number;
  experienceFitScore: number;
  budgetFitScore: number;
  timeFitScore: number;
  interestFitScore: number;
  opportunityStrengthScore: number;
  monetizationFitScore: number;
  evidenceScore: number;
  constraintPenalty: number;
  riskPenalty: number;
  readinessScore: number;
  totalScore: number;
  rationale: string[];
};

export type FounderOpportunityFit = {
  id: string;
  founderProfileId: string;
  candidate: FounderFitCandidate;
  score: FounderFitScore;
  risk: FounderRisk;
  readiness: FounderReadiness;
  rank: number;
};

export type FounderIntelligenceInput = {
  founderProfile: FounderProfile;
  opportunityCandidates?: OpportunityCandidate[];
  monetizationCandidates?: MonetizationCandidate[];
  painCandidates?: PainCandidate[];
  patternCandidates?: PatternCandidate[];
  trendCandidates?: TrendCandidate[];
  evidence?: Evidence[];
  knowledgeUpdates?: KnowledgeUpdateInput[];
  knownProblems?: KnowledgeProblem[];
  relationships?: KnowledgeRelationship[];
  runId?: string;
  evaluatedAt?: string | Date;
};

export type FounderIntelligenceResult = {
  runId: string;
  evaluatedAt: string;
  founderProfile: FounderProfile;
  context: FounderContext;
  signals: FounderSignal[];
  capabilities: FounderCapability[];
  constraints: FounderConstraint[];
  opportunityFits: FounderOpportunityFit[];
  warnings: string[];
  summary: {
    opportunityCandidateCount: number;
    monetizationCandidateCount: number;
    fitCount: number;
    highestScore: number;
    averageReadinessScore: number;
  };
};
