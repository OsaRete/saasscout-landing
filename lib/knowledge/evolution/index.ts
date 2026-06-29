export { classifyProblemEvolution } from "./classifier.ts";
export { DEFAULT_PROBLEM_EVOLUTION_OPTIONS, aggregateEvidenceCount, aggregateSourceCount, averageObservationStrength, clampEvolutionScore, confidenceScore, momentumScore, normalizeEvolutionSignal, recurrenceScore, resolveProblemEvolutionOptions, uniqueSourceTypes, validationScore, weaknessScore } from "./scoring.ts";
export type { ProblemEvolutionAssessment, ProblemEvolutionClassifierInput, ProblemEvolutionClassifierOptions, ProblemEvolutionLifecycleState, ProblemEvolutionObservation, ProblemEvolutionReason, ProblemEvolutionScores } from "./types.ts";

export { discoveredProblemRowToEvolutionObservation, problemIntelligenceRowToEvolutionObservation, weeklyDetectedProblemRowToEvolutionObservation, weeklySourceRowToEvolutionObservation, type EvolutionSourceTable, type RowLike } from "./adapters/index.ts";

export { assessProblemEvolution, getProblemEvolutionObservations, getRecentProblemEvolutionAssessments } from "./repository.ts";
export type { KnowledgeEvolutionSupabaseClient, ProblemEvolutionAssessmentResult, ProblemEvolutionObservationsResult, ProblemEvolutionRepositoryDiagnostics, ProblemEvolutionRepositoryOptions, ProblemEvolutionSourceDiagnostic, RecentProblemEvolutionAssessmentsResult } from "./repository.ts";

export { runKnowledgeEvolutionDiscoveryDiagnostics } from "./discovery-diagnostics.ts";
export type { KnowledgeEvolutionDiscoveryDiagnosticProblem, KnowledgeEvolutionDiscoveryDiagnostics } from "./discovery-diagnostics.ts";

export { runKnowledgeEvolutionWeeklyDiagnostics } from "./weekly-diagnostics.ts";
export type { KnowledgeEvolutionWeeklyDiagnosticProblem, KnowledgeEvolutionWeeklyDiagnostics } from "./weekly-diagnostics.ts";
