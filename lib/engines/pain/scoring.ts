import type { PainFrequency, PainScore, PainSeverity } from "./types";

/** Normalizes numeric evidence signals into SaaSScout's deterministic 0-10 intelligence scale. */
export function normalizePainScore(value: number | null | undefined, fallback = 0) {
  const score = Number(value ?? fallback);
  if (!Number.isFinite(score)) return fallback;
  return Math.min(10, Math.max(0, Number(score.toFixed(1))));
}

/** Calculates the arithmetic mean used by pain scoring without introducing AI-dependent judgement. */
export function averagePainScore(values: number[]) {
  if (values.length === 0) return 0;
  return normalizePainScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Converts a numeric intensity signal into an explainable severity bucket for future opportunity engines. */
export function severityFromScore(score: number): PainSeverity {
  if (score >= 8.5) return "critical";
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  if (score > 0) return "low";
  return "unknown";
}

/** Converts a numeric recurrence signal into a stable frequency bucket for market pain comparison. */
export function frequencyFromScore(score: number): PainFrequency {
  if (score >= 8.5) return "persistent";
  if (score >= 6.5) return "recurring";
  if (score >= 3) return "occasional";
  if (score > 0) return "rare";
  return "unknown";
}

/** Builds the composite pain score that future engines can reuse before a conclusion becomes an opportunity. */
export function calculateCompositePainScore(input: {
  severityScore: number;
  frequencyScore: number;
  evidenceCount: number;
  confidenceScore: number;
  sourceQualityScore: number;
}): PainScore {
  const evidenceScore = normalizePainScore(Math.min(10, Math.log10(Math.max(1, input.evidenceCount)) * 4 + 2));
  const confidenceScore = normalizePainScore(input.confidenceScore * 0.6 + input.sourceQualityScore * 0.4);
  const totalScore = normalizePainScore(
    input.severityScore * 0.35 + input.frequencyScore * 0.25 + evidenceScore * 0.2 + confidenceScore * 0.2
  );

  return {
    severityScore: normalizePainScore(input.severityScore),
    frequencyScore: normalizePainScore(input.frequencyScore),
    evidenceScore,
    confidenceScore,
    totalScore,
    rationale: [
      "Pain score is deterministic and derived only from normalized evidence and knowledge signals.",
      `${input.evidenceCount} evidence item(s) support this pain candidate.`,
    ],
  };
}
