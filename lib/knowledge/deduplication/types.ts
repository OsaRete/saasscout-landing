import type { Evidence } from "../../evidence";
import type { KnowledgeProblem, KnowledgeRelationship } from "../types";
import type { PainCandidate } from "../../engines/pain";
import type { PatternCandidate } from "../../engines/pattern";
import type { TrendCandidate } from "../../engines/trend";
import type { OpportunityCandidate } from "../../engines/opportunity";
import type { ConfidenceCandidate } from "../../engines/confidence";
import type { FeedbackEvent } from "../../engines/feedback";

export type ProblemSimilaritySignalKind =
  | "text"
  | "fingerprint"
  | "market"
  | "audience"
  | "pain"
  | "pattern"
  | "trend"
  | "feedback"
  | "relationship";

export type ProblemConsolidationDecisionType = "merge" | "link" | "review" | "separate";

export type ProblemDeduplicationCandidate = {
  id: string;
  title: string;
  normalizedTitle: string;
  fingerprint: string;
  tokens: string[];
  market: string | null;
  audience: string | null;
  nicheCategory: string | null;
  description: string | null;
  evidenceFingerprints: string[];
  sourceProblemId?: string | null;
  painCandidateIds: string[];
  patternCandidateIds: string[];
  trendCandidateIds: string[];
  opportunityCandidateIds: string[];
  confidenceCandidateIds: string[];
  feedbackEventIds: string[];
  confidenceScore: number;
  lastSeenAt: string | null;
};

export type ProblemCanonicalIdentity = {
  id: string;
  title: string;
  normalizedTitle: string;
  fingerprint: string;
  market: string | null;
  audience: string | null;
  nicheCategory: string | null;
  evidenceFingerprints: string[];
  aliases: ProblemAlias[];
  confidenceScore: number;
};

export type ProblemAlias = {
  id: string;
  canonicalId: string;
  title: string;
  normalizedTitle: string;
  fingerprint: string;
  evidenceFingerprints: string[];
  similarityScore: number;
  createdFromCandidateId: string;
};

export type ProblemSimilaritySignal = {
  kind: ProblemSimilaritySignalKind;
  score: number;
  weight: number;
  matched: boolean;
  rationale: string;
};

export type ProblemSimilarityScore = {
  candidateAId: string;
  candidateBId: string;
  totalScore: number;
  signals: ProblemSimilaritySignal[];
  sharedTokens: string[];
  reasons: string[];
};

export type ProblemConsolidationGroup = {
  id: string;
  canonical: ProblemCanonicalIdentity;
  candidates: ProblemDeduplicationCandidate[];
  aliases: ProblemAlias[];
  similarityScores: ProblemSimilarityScore[];
  evidenceFingerprints: string[];
};

export type ProblemConsolidationDecision = {
  groupId: string;
  decision: ProblemConsolidationDecisionType;
  score: number;
  rationale: string[];
};

export type ProblemConsolidationResult = {
  groups: ProblemConsolidationGroup[];
  decisions: ProblemConsolidationDecision[];
  ungroupedCandidates: ProblemDeduplicationCandidate[];
};

export type ProblemDeduplicationInput = {
  evidence?: Evidence[];
  knownProblems?: KnowledgeProblem[];
  relationships?: KnowledgeRelationship[];
  painCandidates?: PainCandidate[];
  patternCandidates?: PatternCandidate[];
  trendCandidates?: TrendCandidate[];
  opportunityCandidates?: OpportunityCandidate[];
  confidenceCandidates?: ConfidenceCandidate[];
  feedbackEvents?: FeedbackEvent[];
  runId?: string;
  createdAt?: string | Date;
};

export type ProblemDeduplicationResult = ProblemConsolidationResult & {
  runId: string;
  createdAt: string;
  candidates: ProblemDeduplicationCandidate[];
  warnings: string[];
  summary: {
    candidateCount: number;
    groupCount: number;
    aliasCount: number;
    mergeDecisionCount: number;
    reviewDecisionCount: number;
  };
};
