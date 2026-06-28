import type { ProblemEvolutionClassifierInput, ProblemEvolutionClassifierOptions, ProblemEvolutionObservation } from "./types.ts";

export const DEFAULT_PROBLEM_EVOLUTION_OPTIONS: Required<ProblemEvolutionClassifierOptions> = {
  recentDays: 30,
  minimumRecurringObservations: 2,
  minimumRecurringSourceTypes: 2,
  minimumHistoricalObservations: 4,
  minimumValidationConversions: 1,
  minimumValidatedEvidenceCount: 5,
  highQualityThreshold: 7,
  weakEvidenceCountThreshold: 1,
  weakSourceCountThreshold: 1,
  lowSignalThreshold: 3.5,
  momentumDeltaThreshold: 1.2,
  confidenceHighThreshold: 7,
  confidenceMediumThreshold: 4,
};

export function resolveProblemEvolutionOptions(options: ProblemEvolutionClassifierOptions = {}) {
  return { ...DEFAULT_PROBLEM_EVOLUTION_OPTIONS, ...options };
}

export function clampEvolutionScore(value: number | null | undefined) {
  const score = Number(value ?? 0);
  if (!Number.isFinite(score)) return 0;
  return Math.min(10, Math.max(0, Number(score.toFixed(1))));
}

export function normalizeEvolutionSignal(value: number | null | undefined) {
  const score = Number(value ?? 0);
  if (!Number.isFinite(score)) return 0;
  return clampEvolutionScore(score > 10 ? score / 10 : score);
}

export function uniqueSourceTypes(input: ProblemEvolutionClassifierInput) {
  return Array.from(new Set([...(input.source_types || []), ...(input.observations || []).flatMap((item) => item.source_types || [])].map((item) => item.trim().toLowerCase()).filter(Boolean))).sort();
}

export function aggregateEvidenceCount(input: ProblemEvolutionClassifierInput) {
  return Math.max(Number(input.evidence_count || 0), ...(input.observations || []).map((item) => Number(item.evidence_count || 0)), input.observations?.length || 0);
}

export function aggregateSourceCount(input: ProblemEvolutionClassifierInput) {
  return Math.max(Number(input.source_count || 0), uniqueSourceTypes(input).length, ...(input.observations || []).map((item) => Number(item.source_count || 0)));
}

export function observationStrength(observation: ProblemEvolutionObservation) {
  const signals = [
    observation.pain_score,
    observation.revenue_score,
    observation.urgency_score,
    observation.trend_score,
    observation.buying_signal_score,
    observation.frequency_score,
    observation.source_quality_score,
    observation.opportunity_score,
    observation.intelligence_score,
  ].map(normalizeEvolutionSignal).filter((score) => score > 0);
  if (signals.length === 0) return 0;
  return clampEvolutionScore(signals.reduce((sum, score) => sum + score, 0) / signals.length);
}

export function averageObservationStrength(observations: ProblemEvolutionObservation[]) {
  if (observations.length === 0) return 0;
  return clampEvolutionScore(observations.reduce((sum, item) => sum + observationStrength(item), 0) / observations.length);
}

export function recurrenceScore(input: ProblemEvolutionClassifierInput, options: ProblemEvolutionClassifierOptions = {}) {
  const thresholds = resolveProblemEvolutionOptions(options);
  const observationCount = input.observations?.length || 0;
  const evidenceCount = aggregateEvidenceCount(input);
  const sourceCount = aggregateSourceCount(input);
  const sourceTypeCount = uniqueSourceTypes(input).length;
  const observationScore = Math.min(4, (observationCount / thresholds.minimumRecurringObservations) * 3);
  const evidenceScore = Math.min(3, evidenceCount * 0.6);
  const sourceScore = Math.min(3, Math.max(sourceCount, sourceTypeCount) * 1.2);
  return clampEvolutionScore(observationScore + evidenceScore + sourceScore);
}

export function momentumScore(recentObservations: ProblemEvolutionObservation[], olderObservations: ProblemEvolutionObservation[]) {
  if (recentObservations.length === 0) return 0;
  const recent = averageObservationStrength(recentObservations);
  if (olderObservations.length === 0) return clampEvolutionScore(recent / 2);
  return clampEvolutionScore(5 + recent - averageObservationStrength(olderObservations));
}

export function validationScore(input: ProblemEvolutionClassifierInput, options: ProblemEvolutionClassifierOptions = {}) {
  const thresholds = resolveProblemEvolutionOptions(options);
  const converted = Number(input.converted_count || 0);
  const prepared = Number(input.prepared_count || 0);
  const conversionScore = converted >= thresholds.minimumValidationConversions ? 5 + Math.min(3, converted) : 0;
  const preparedScore = Math.min(1.5, prepared * 0.3);
  const qualityScore = averageObservationStrength(input.observations || []) >= thresholds.highQualityThreshold && aggregateEvidenceCount(input) >= thresholds.minimumValidatedEvidenceCount ? 2 : 0;
  return clampEvolutionScore(conversionScore + preparedScore + qualityScore);
}

export function weaknessScore(input: ProblemEvolutionClassifierInput, options: ProblemEvolutionClassifierOptions = {}) {
  const thresholds = resolveProblemEvolutionOptions(options);
  const evidenceCount = aggregateEvidenceCount(input);
  const sourceCount = aggregateSourceCount(input);
  const averageStrength = averageObservationStrength(input.observations || []);
  const sparseScore = evidenceCount <= thresholds.weakEvidenceCountThreshold && sourceCount <= thresholds.weakSourceCountThreshold ? 4 : 0;
  const lowSignalScore = averageStrength > 0 && averageStrength <= thresholds.lowSignalThreshold ? 4 : 0;
  const noFeedbackScore = Number(input.converted_count || 0) === 0 && Number(input.prepared_count || 0) === 0 ? 2 : 0;
  return clampEvolutionScore(sparseScore + lowSignalScore + noFeedbackScore);
}

export function confidenceScore(input: ProblemEvolutionClassifierInput, scores: { recurrenceScore: number; validationScore: number; weaknessScore: number }) {
  const observationCount = input.observations?.length || 0;
  const evidenceCount = aggregateEvidenceCount(input);
  const sourceCount = aggregateSourceCount(input);
  return clampEvolutionScore(Math.min(3, observationCount) + Math.min(3, evidenceCount * 0.5) + Math.min(2, sourceCount * 0.7) + Math.min(2, Math.max(scores.recurrenceScore, scores.validationScore, scores.weaknessScore) * 0.2));
}
