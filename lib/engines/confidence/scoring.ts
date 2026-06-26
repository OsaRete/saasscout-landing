import type { ConfidenceLevel, ConfidenceScore, ConsistencySignal, EvidenceQualitySignal, InferenceRisk, RecencySignal, SourceDiversitySignal, ValidationSignal } from "./types";

/** Normalizes Confidence Engine inputs onto SaaSScout's stable 0-10 intelligence scale. */
export function normalizeConfidenceScore(value: number | null | undefined, fallback = 0) {
  const score = Number(value ?? fallback);
  if (!Number.isFinite(score)) return fallback;
  return Math.min(10, Math.max(0, Number(score.toFixed(1))));
}

/** Calculates deterministic averages so future trust decisions remain reproducible and model-independent. */
export function averageConfidenceScore(values: number[]) {
  if (values.length === 0) return 0;
  return normalizeConfidenceScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Converts evidence-quality scores into explainable quality labels for downstream recommendations. */
export function evidenceQualityFromScore(score: number): EvidenceQualitySignal {
  if (score >= 8.5) return "excellent";
  if (score >= 7) return "strong";
  if (score >= 4) return "acceptable";
  if (score > 0) return "weak";
  return "missing";
}

/** Converts source-diversity scores into labels that reveal whether a conclusion depends on too few sources. */
export function sourceDiversityFromScore(score: number): SourceDiversitySignal {
  if (score >= 8.5) return "highly_diverse";
  if (score >= 6.5) return "diverse";
  if (score >= 3.5) return "limited";
  if (score > 0) return "single_source";
  return "missing";
}

/** Converts temporal support into recency labels so old evidence can be discounted without deleting knowledge. */
export function recencyFromScore(score: number): RecencySignal {
  if (score >= 8.5) return "fresh";
  if (score >= 6.5) return "recent";
  if (score >= 3.5) return "aging";
  if (score > 0) return "stale";
  return "unknown";
}

/** Converts agreement scores into consistency labels for identifying reinforced or conflicting market intelligence. */
export function consistencyFromScore(score: number): ConsistencySignal {
  if (score >= 8.5) return "reinforced";
  if (score >= 6.5) return "consistent";
  if (score >= 3.5) return "mixed";
  if (score > 0) return "conflicting";
  return "unknown";
}

/** Converts validation scores into labels that distinguish assumptions from externally supported conclusions. */
export function validationFromScore(score: number): ValidationSignal {
  if (score >= 8.5) return "strongly_validated";
  if (score >= 7) return "validated";
  if (score >= 4) return "partial";
  if (score > 0) return "implicit";
  return "none";
}

/** Converts inference-risk pressure into a stable label used to suppress unsupported recommendations. */
export function inferenceRiskFromScore(score: number): InferenceRisk {
  if (score >= 8.5) return "critical";
  if (score >= 6.5) return "high";
  if (score >= 3.5) return "moderate";
  if (score > 0) return "low";
  return "unknown";
}

/** Assigns a Confidence Level that future decision layers can expose beside every conclusion. */
export function confidenceLevelFromScore(score: number): ConfidenceLevel {
  if (score >= 8.5) return "very_high";
  if (score >= 7) return "high";
  if (score >= 4.5) return "moderate";
  if (score > 0) return "low";
  return "unsupported";
}

/** Builds the composite Confidence Score from evidence quality, diversity, recency, consistency, validation, and risk. */
export function calculateCompositeConfidenceScore(input: { evidenceQualityScore: number; sourceDiversityScore: number; recencyScore: number; consistencyScore: number; validationStrengthScore: number; inferenceRiskScore: number; evidenceCount: number }): ConfidenceScore {
  const weightedScore = input.evidenceQualityScore * 0.25 + input.sourceDiversityScore * 0.18 + input.recencyScore * 0.12 + input.consistencyScore * 0.2 + input.validationStrengthScore * 0.18 + (10 - input.inferenceRiskScore) * 0.07;
  const totalScore = normalizeConfidenceScore(input.evidenceCount === 0 ? 0 : weightedScore);
  return {
    evidenceQualityScore: normalizeConfidenceScore(input.evidenceQualityScore),
    sourceDiversityScore: normalizeConfidenceScore(input.sourceDiversityScore),
    recencyScore: normalizeConfidenceScore(input.recencyScore),
    consistencyScore: normalizeConfidenceScore(input.consistencyScore),
    validationStrengthScore: normalizeConfidenceScore(input.validationStrengthScore),
    inferenceRiskScore: normalizeConfidenceScore(input.inferenceRiskScore),
    totalScore,
    level: confidenceLevelFromScore(totalScore),
    rationale: ["Confidence is deterministic and derived from evidence quality, source diversity, recency, consistency, validation strength, and inference risk.", `${input.evidenceCount} evidence item(s) support this confidence candidate.`],
  };
}
