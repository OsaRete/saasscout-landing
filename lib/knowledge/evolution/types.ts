export type ProblemEvolutionLifecycleState = "new" | "recurring" | "growing" | "declining" | "validated" | "weak" | "unknown";

export type ProblemEvolutionReason =
  | "insufficient_observations"
  | "recent_first_seen"
  | "multiple_observations"
  | "multiple_source_types"
  | "recent_momentum_exceeds_history"
  | "recent_momentum_below_history"
  | "feedback_conversion_signal"
  | "strong_recurring_evidence"
  | "sparse_low_quality_evidence"
  | "low_signal_strength"
  | "no_feedback_signal"
  | "historical_comparison_available";

export type ProblemEvolutionObservation = {
  problem_title?: string | null;
  observedAt?: string | Date | null;
  pain_score?: number | null;
  revenue_score?: number | null;
  urgency_score?: number | null;
  trend_score?: number | null;
  buying_signal_score?: number | null;
  frequency_score?: number | null;
  source_quality_score?: number | null;
  opportunity_score?: number | null;
  intelligence_score?: number | null;
  prepared_count?: number | null;
  converted_count?: number | null;
  source_count?: number | null;
  evidence_count?: number | null;
  source_types?: string[] | null;
  first_seen_at?: string | Date | null;
  last_seen_at?: string | Date | null;
  problem_cluster?: string | null;
  source_evidence?: string | null;
  provenance?: {
    source_table: string;
    row_id?: string | null;
    discovery_id?: string | null;
    user_id?: string | null;
    source_url?: string | null;
    source_rank?: number | null;
  };
};

export type ProblemEvolutionClassifierInput = {
  observations?: ProblemEvolutionObservation[] | null;
  prepared_count?: number | null;
  converted_count?: number | null;
  source_count?: number | null;
  evidence_count?: number | null;
  source_types?: string[] | null;
  first_seen_at?: string | Date | null;
  last_seen_at?: string | Date | null;
  now?: string | Date | null;
};

export type ProblemEvolutionClassifierOptions = {
  recentDays?: number;
  minimumRecurringObservations?: number;
  minimumRecurringSourceTypes?: number;
  minimumHistoricalObservations?: number;
  minimumValidationConversions?: number;
  minimumValidatedEvidenceCount?: number;
  highQualityThreshold?: number;
  weakEvidenceCountThreshold?: number;
  weakSourceCountThreshold?: number;
  lowSignalThreshold?: number;
  momentumDeltaThreshold?: number;
  confidenceHighThreshold?: number;
  confidenceMediumThreshold?: number;
};

export type ProblemEvolutionScores = {
  recurrenceScore: number;
  momentumScore: number;
  validationScore: number;
  weaknessScore: number;
  confidenceScore: number;
};

export type ProblemEvolutionAssessment = {
  lifecycleState: ProblemEvolutionLifecycleState;
  scores: ProblemEvolutionScores;
  reasons: ProblemEvolutionReason[];
  diagnostics: {
    observationCount: number;
    evidenceCount: number;
    sourceCount: number;
    sourceTypeCount: number;
    preparedCount: number;
    convertedCount: number;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
    recentObservationCount: number;
    olderObservationCount: number;
  };
};
