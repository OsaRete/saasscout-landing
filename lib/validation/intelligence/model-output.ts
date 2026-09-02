import {
  DIMENSION_STATES,
  VALIDATION_DIMENSIONS,
  type ValidationIntelligenceResult,
} from "./contracts.ts";
const forbidden =
  /\b(validation\s*score|success\s*probability|market[- ]fit\s*probability|statistically significant|market validated)\b/i;
const text = (v: unknown, max = 1200) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
const list = (v: unknown) =>
  Array.isArray(v) && v.length <= 12 && v.every((x) => text(x, 600));
export function parseValidationIntelligenceOutput(
  value: unknown,
): ValidationIntelligenceResult {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("malformed_output");
  const raw = value as Record<string, unknown>;
  if (
    "validationScore" in raw ||
    "successProbability" in raw ||
    forbidden.test(JSON.stringify(raw))
  )
    throw new Error("forbidden_claim");
  const dimensions = raw.dimensions as Record<string, unknown>;
  if (!dimensions || typeof dimensions !== "object")
    throw new Error("missing_dimensions");
  for (const key of VALIDATION_DIMENSIONS) {
    const d = dimensions[key] as Record<string, unknown>;
    if (
      !d ||
      !DIMENSION_STATES.includes(d.state as never) ||
      !text(d.summary) ||
      !list(d.evidenceBasis)
    )
      throw new Error(`invalid_dimension_${key}`);
  }
  if (
    !list(raw.whatSupportsHypothesis) ||
    !list(raw.whatContradictsHypothesis) ||
    !list(raw.whatRemainsUncertain)
  )
    throw new Error("missing_synthesis");
  const overall = raw.overallAssessment as Record<string, unknown>;
  if (
    !overall ||
    !["promising", "mixed", "weak", "inconclusive"].includes(
      String(overall.label),
    ) ||
    !text(overall.summary)
  )
    throw new Error("invalid_overall");
  const next = raw.recommendedNextExperiment as Record<string, unknown>;
  if (
    !next ||
    !text(next.goal) ||
    !text(next.reason) ||
    !text(next.targetEvidenceGap) ||
    !["customer_interview", "survey", "other_future_family"].includes(
      String(next.suggestedFamily),
    )
  )
    throw new Error("invalid_recommendation");
  return value as ValidationIntelligenceResult;
}
