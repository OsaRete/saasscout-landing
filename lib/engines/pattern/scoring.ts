import type { PatternFrequency, PatternScore, PatternStrength } from "./types";

/** Normalizes pattern metrics onto SaaSScout's deterministic 0-10 intelligence scale. */
export function normalizePatternScore(value: number | null | undefined, fallback = 0) {
  const score = Number(value ?? fallback);
  if (!Number.isFinite(score)) return fallback;
  return Math.min(10, Math.max(0, Number(score.toFixed(1))));
}

/** Calculates a stable average for pattern signals without delegating judgement to an AI model. */
export function averagePatternScore(values: number[]) {
  if (values.length === 0) return 0;
  return normalizePatternScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Converts a numeric pattern score into a strength bucket future opportunity engines can explain. */
export function strengthFromScore(score: number): PatternStrength {
  if (score >= 8.5) return "dominant";
  if (score >= 7) return "strong";
  if (score >= 4) return "moderate";
  if (score > 0) return "weak";
  return "unknown";
}

/** Converts repeated evidence and relationship density into a reusable pattern frequency bucket. */
export function patternFrequencyFromScore(score: number): PatternFrequency {
  if (score >= 8.5) return "systemic";
  if (score >= 6.5) return "recurring";
  if (score >= 3) return "repeated";
  if (score > 0) return "isolated";
  return "unknown";
}

/** Calculates deterministic pattern strength from relationship density, evidence volume, and evidence quality. */
export function calculateCompositePatternScore(input: {
  themeScore: number;
  relationshipScore: number;
  frequencyScore: number;
  evidenceCount: number;
  confidenceScore: number;
  sourceQualityScore: number;
}): PatternScore {
  const evidenceScore = normalizePatternScore(Math.min(10, Math.log10(Math.max(1, input.evidenceCount)) * 4 + 2));
  const confidenceScore = normalizePatternScore(input.confidenceScore * 0.6 + input.sourceQualityScore * 0.4);
  const totalScore = normalizePatternScore(
    input.themeScore * 0.25 + input.relationshipScore * 0.25 + input.frequencyScore * 0.2 + evidenceScore * 0.15 + confidenceScore * 0.15
  );

  return {
    themeScore: normalizePatternScore(input.themeScore),
    relationshipScore: normalizePatternScore(input.relationshipScore),
    frequencyScore: normalizePatternScore(input.frequencyScore),
    evidenceScore,
    confidenceScore,
    totalScore,
    rationale: [
      "Pattern score is deterministic and derived only from evidence, pain, and knowledge relationship signals.",
      `${input.evidenceCount} evidence item(s) support this pattern candidate.`,
    ],
  };
}
