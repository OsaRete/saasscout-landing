import type { FeedbackScore, FeedbackStrength } from "./types";

/** Normalizes Feedback Engine values onto SaaSScout's stable 0-10 intelligence scale. */
export function normalizeFeedbackScore(value: number | null | undefined, fallback = 0) {
  const score = Number(value ?? fallback);
  if (!Number.isFinite(score)) return fallback;
  return Math.min(10, Math.max(0, Number(score.toFixed(1))));
}

/** Calculates deterministic averages so learning impact remains reproducible without AI. */
export function averageFeedbackScore(values: number[]) {
  if (values.length === 0) return 0;
  return normalizeFeedbackScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Converts a numeric feedback score into an explainable strength label for future learning loops. */
export function feedbackStrengthFromScore(score: number): FeedbackStrength {
  if (score >= 8.5) return "decisive";
  if (score >= 7) return "strong";
  if (score >= 4) return "moderate";
  if (score > 0) return "weak";
  return "none";
}

/** Builds a composite feedback score from validation, revenue, pivot, abandonment, recommendation, and relationship impact. */
export function calculateCompositeFeedbackScore(input: Omit<FeedbackScore, "totalScore" | "rationale">): FeedbackScore {
  const totalScore = normalizeFeedbackScore(input.validationScore * 0.22 + input.revenueScore * 0.24 + input.pivotScore * 0.14 + input.abandonmentScore * 0.14 + input.recommendationQualityScore * 0.12 + input.strengthScore * 0.08 + input.learningImpactScore * 0.06);
  return { ...input, totalScore, rationale: ["Feedback score is deterministic and derived from real validation, revenue, pivot, abandonment, recommendation, strength, and relationship impact signals."] };
}
