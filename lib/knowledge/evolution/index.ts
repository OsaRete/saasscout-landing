export { classifyProblemEvolution } from "./classifier.ts";
export { DEFAULT_PROBLEM_EVOLUTION_OPTIONS, aggregateEvidenceCount, aggregateSourceCount, averageObservationStrength, clampEvolutionScore, confidenceScore, momentumScore, normalizeEvolutionSignal, recurrenceScore, resolveProblemEvolutionOptions, uniqueSourceTypes, validationScore, weaknessScore } from "./scoring.ts";
export type { ProblemEvolutionAssessment, ProblemEvolutionClassifierInput, ProblemEvolutionClassifierOptions, ProblemEvolutionLifecycleState, ProblemEvolutionObservation, ProblemEvolutionReason, ProblemEvolutionScores } from "./types.ts";

export { discoveredProblemRowToEvolutionObservation, problemIntelligenceRowToEvolutionObservation, weeklyDetectedProblemRowToEvolutionObservation, weeklySourceRowToEvolutionObservation, type EvolutionSourceTable, type RowLike } from "./adapters/index.ts";
