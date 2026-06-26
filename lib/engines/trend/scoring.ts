import type { TrendDirection, TrendMomentum, TrendScore, TrendVelocity } from "./types";

/** Normalizes trend metrics onto SaaSScout's deterministic 0-10 intelligence scale. */
export function normalizeTrendScore(value: number | null | undefined, fallback = 0) {
  const score = Number(value ?? fallback);
  if (!Number.isFinite(score)) return fallback;
  return Math.min(10, Math.max(0, Number(score.toFixed(1))));
}

/** Calculates stable averages for temporal trend signals without using AI judgement. */
export function averageTrendScore(values: number[]) {
  if (values.length === 0) return 0;
  return normalizeTrendScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Converts a numeric momentum score into an explainable market movement bucket. */
export function momentumFromScore(score: number): TrendMomentum {
  if (score >= 8.5) return "surging";
  if (score >= 6.5) return "accelerating";
  if (score >= 3) return "building";
  if (score > 0) return "flat";
  return "unknown";
}

/** Converts a numeric velocity score into a reusable speed bucket for future opportunity timing. */
export function velocityFromScore(score: number): TrendVelocity {
  if (score >= 8.5) return "breakout";
  if (score >= 6.5) return "fast";
  if (score >= 3) return "steady";
  if (score > 0) return "slow";
  return "unknown";
}

/** Converts temporal change into a deterministic direction bucket for market movement analysis. */
export function directionFromChange(change: number): TrendDirection {
  if (change >= 3) return "rising";
  if (change >= 0.8) return "emerging";
  if (change <= -0.8) return "declining";
  if (Number.isFinite(change)) return "stable";
  return "unknown";
}

/** Converts a direction bucket back into a score so composite trend ranking remains deterministic. */
export function scoreFromDirection(direction: TrendDirection) {
  if (direction === "rising") return 9;
  if (direction === "emerging") return 7;
  if (direction === "stable") return 4;
  if (direction === "declining") return 1;
  return 0;
}

/** Calculates deterministic trend strength from temporal movement, emergence, evidence volume, and evidence quality. */
export function calculateCompositeTrendScore(input: {
  momentumScore: number;
  velocityScore: number;
  directionScore: number;
  emergenceScore: number;
  evidenceCount: number;
  confidenceScore: number;
  sourceQualityScore: number;
}): TrendScore {
  const evidenceScore = normalizeTrendScore(Math.min(10, Math.log10(Math.max(1, input.evidenceCount)) * 4 + 2));
  const confidenceScore = normalizeTrendScore(input.confidenceScore * 0.6 + input.sourceQualityScore * 0.4);
  const totalScore = normalizeTrendScore(
    input.momentumScore * 0.25 +
      input.velocityScore * 0.2 +
      input.directionScore * 0.2 +
      input.emergenceScore * 0.15 +
      evidenceScore * 0.1 +
      confidenceScore * 0.1
  );

  return {
    momentumScore: normalizeTrendScore(input.momentumScore),
    velocityScore: normalizeTrendScore(input.velocityScore),
    directionScore: normalizeTrendScore(input.directionScore),
    emergenceScore: normalizeTrendScore(input.emergenceScore),
    evidenceScore,
    confidenceScore,
    totalScore,
    rationale: [
      "Trend score is deterministic and derived only from temporal evidence, pain, pattern, and knowledge signals.",
      `${input.evidenceCount} evidence item(s) support this trend candidate.`,
    ],
  };
}
