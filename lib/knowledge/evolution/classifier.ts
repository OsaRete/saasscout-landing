import { aggregateEvidenceCount, aggregateSourceCount, averageObservationStrength, confidenceScore, momentumScore, recurrenceScore, resolveProblemEvolutionOptions, uniqueSourceTypes, validationScore, weaknessScore } from "./scoring.ts";
import type { ProblemEvolutionAssessment, ProblemEvolutionClassifierInput, ProblemEvolutionClassifierOptions, ProblemEvolutionObservation, ProblemEvolutionReason } from "./types.ts";

function toTime(value: string | Date | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function iso(value: string | Date | null | undefined) {
  const time = toTime(value);
  return time === null ? null : new Date(time).toISOString();
}

function splitObservations(observations: ProblemEvolutionObservation[], now: Date, recentDays: number) {
  const boundary = now.getTime() - recentDays * 24 * 60 * 60 * 1000;
  const recent: ProblemEvolutionObservation[] = [];
  const older: ProblemEvolutionObservation[] = [];
  for (const observation of observations) {
    const observedAt = toTime(observation.observedAt);
    if (observedAt === null || observedAt >= boundary) recent.push(observation);
    else older.push(observation);
  }
  return { recent, older };
}

function push(reasons: ProblemEvolutionReason[], reason: ProblemEvolutionReason) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

export function classifyProblemEvolution(input: ProblemEvolutionClassifierInput, options: ProblemEvolutionClassifierOptions = {}): ProblemEvolutionAssessment {
  const thresholds = resolveProblemEvolutionOptions(options);
  const observations = [...(input.observations || [])].sort((a, b) => (toTime(a.observedAt) || 0) - (toTime(b.observedAt) || 0));
  const now = new Date(input.now || Date.now());
  const { recent, older } = splitObservations(observations, now, thresholds.recentDays);
  const evidenceCount = aggregateEvidenceCount({ ...input, observations });
  const sourceCount = aggregateSourceCount({ ...input, observations });
  const sourceTypes = uniqueSourceTypes({ ...input, observations });
  const firstSeenAt = iso(input.first_seen_at) || iso(observations[0]?.observedAt);
  const lastSeenAt = iso(input.last_seen_at) || iso(observations[observations.length - 1]?.observedAt);
  const scores = {
    recurrenceScore: recurrenceScore({ ...input, observations }, thresholds),
    momentumScore: momentumScore(recent, older),
    validationScore: validationScore({ ...input, observations }, thresholds),
    weaknessScore: weaknessScore({ ...input, observations }, thresholds),
    confidenceScore: 0,
  };
  scores.confidenceScore = confidenceScore({ ...input, observations }, scores);

  const reasons: ProblemEvolutionReason[] = [];
  if (observations.length === 0 && evidenceCount === 0) push(reasons, "insufficient_observations");
  if (observations.length >= thresholds.minimumRecurringObservations) push(reasons, "multiple_observations");
  if (sourceTypes.length >= thresholds.minimumRecurringSourceTypes) push(reasons, "multiple_source_types");
  if (Number(input.converted_count || 0) >= thresholds.minimumValidationConversions) push(reasons, "feedback_conversion_signal");
  if (older.length > 0 && recent.length > 0) push(reasons, "historical_comparison_available");
  if (older.length > 0 && recent.length > 0 && averageObservationStrength(recent) - averageObservationStrength(older) >= thresholds.momentumDeltaThreshold) push(reasons, "recent_momentum_exceeds_history");
  if (older.length >= Math.floor(thresholds.minimumHistoricalObservations / 2) && recent.length >= Math.ceil(thresholds.minimumHistoricalObservations / 2) && averageObservationStrength(older) - averageObservationStrength(recent) >= thresholds.momentumDeltaThreshold) push(reasons, "recent_momentum_below_history");
  if (evidenceCount >= thresholds.minimumValidatedEvidenceCount && scores.recurrenceScore >= thresholds.confidenceHighThreshold && averageObservationStrength(observations) >= thresholds.highQualityThreshold) push(reasons, "strong_recurring_evidence");
  if (evidenceCount <= thresholds.weakEvidenceCountThreshold && sourceCount <= thresholds.weakSourceCountThreshold) push(reasons, "sparse_low_quality_evidence");
  if (averageObservationStrength(observations) > 0 && averageObservationStrength(observations) <= thresholds.lowSignalThreshold) push(reasons, "low_signal_strength");
  if (Number(input.converted_count || 0) === 0 && Number(input.prepared_count || 0) === 0) push(reasons, "no_feedback_signal");
  if (firstSeenAt && now.getTime() - new Date(firstSeenAt).getTime() <= thresholds.recentDays * 24 * 60 * 60 * 1000 && observations.length <= 1) push(reasons, "recent_first_seen");

  let lifecycleState: ProblemEvolutionAssessment["lifecycleState"] = "unknown";
  if (reasons.includes("insufficient_observations")) lifecycleState = "unknown";
  else if (reasons.includes("feedback_conversion_signal") || reasons.includes("strong_recurring_evidence")) lifecycleState = "validated";
  else if (reasons.includes("recent_momentum_below_history")) lifecycleState = "declining";
  else if (reasons.includes("recent_momentum_exceeds_history")) lifecycleState = "growing";
  else if (scores.weaknessScore >= thresholds.confidenceHighThreshold && reasons.includes("low_signal_strength")) lifecycleState = "weak";
  else if (reasons.includes("multiple_observations") || reasons.includes("multiple_source_types")) lifecycleState = "recurring";
  else if (reasons.includes("recent_first_seen")) lifecycleState = "new";

  return {
    lifecycleState,
    scores,
    reasons,
    diagnostics: {
      observationCount: observations.length,
      evidenceCount,
      sourceCount,
      sourceTypeCount: sourceTypes.length,
      preparedCount: Number(input.prepared_count || 0),
      convertedCount: Number(input.converted_count || 0),
      firstSeenAt,
      lastSeenAt,
      recentObservationCount: recent.length,
      olderObservationCount: older.length,
    },
  };
}
