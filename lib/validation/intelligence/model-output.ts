import {
  DIMENSION_STATES,
  VALIDATION_DIMENSIONS,
  type ValidationIntelligenceResult,
} from "./contracts.ts";

export const VALIDATION_INTELLIGENCE_VALIDATION_REASONS = [
  "output_not_object",
  "forbidden_claim",
  "dimensions_invalid",
  "dimension_missing",
  "dimension_state_invalid",
  "dimension_summary_invalid",
  "dimension_evidence_basis_invalid",
  "supporting_synthesis_invalid",
  "contradicting_synthesis_invalid",
  "uncertainty_synthesis_invalid",
  "overall_assessment_invalid",
  "overall_assessment_label_invalid",
  "overall_assessment_summary_invalid",
  "next_experiment_recommendation_invalid",
  "next_experiment_goal_invalid",
  "next_experiment_reason_invalid",
  "next_experiment_evidence_gap_invalid",
  "next_experiment_family_invalid",
  "unexpected_output_shape",
] as const;

export type ValidationIntelligenceValidationReason =
  (typeof VALIDATION_INTELLIGENCE_VALIDATION_REASONS)[number];

export class ValidationIntelligenceOutputError extends Error {
  readonly code: ValidationIntelligenceValidationReason;

  constructor(code: ValidationIntelligenceValidationReason) {
    super(code);
    this.name = "ValidationIntelligenceOutputError";
    this.code = code;
  }
}

const reject = (code: ValidationIntelligenceValidationReason): never => {
  throw new ValidationIntelligenceOutputError(code);
};
const forbidden =
  /\b(validation\s*score|success\s*probability|market[- ]fit\s*probability|statistically significant|market validated)\b/i;
const text = (v: unknown, max = 1200) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
const list = (v: unknown) =>
  Array.isArray(v) && v.length <= 12 && v.every((x) => text(x, 600));
const serialize = (value: Record<string, unknown>): string => {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string")
      return reject("unexpected_output_shape");
    return serialized;
  } catch (error) {
    if (error instanceof ValidationIntelligenceOutputError) throw error;
    return reject("unexpected_output_shape");
  }
};

export function parseValidationIntelligenceOutput(
  value: unknown,
): ValidationIntelligenceResult {
  if (!value || typeof value !== "object" || Array.isArray(value))
    reject("output_not_object");
  const raw = value as Record<string, unknown>;
  const serialized = serialize(raw);
  if (
    "validationScore" in raw ||
    "successProbability" in raw ||
    forbidden.test(serialized)
  )
    reject("forbidden_claim");
  const dimensions = raw.dimensions as Record<string, unknown>;
  if (
    !dimensions ||
    typeof dimensions !== "object" ||
    Array.isArray(dimensions)
  )
    reject("dimensions_invalid");
  for (const key of VALIDATION_DIMENSIONS) {
    const dimension = dimensions[key] as Record<string, unknown>;
    if (!dimension || typeof dimension !== "object" || Array.isArray(dimension))
      reject("dimension_missing");
    if (!DIMENSION_STATES.includes(dimension.state as never))
      reject("dimension_state_invalid");
    if (!text(dimension.summary)) reject("dimension_summary_invalid");
    if (!list(dimension.evidenceBasis))
      reject("dimension_evidence_basis_invalid");
  }
  if (!list(raw.whatSupportsHypothesis)) reject("supporting_synthesis_invalid");
  if (!list(raw.whatContradictsHypothesis))
    reject("contradicting_synthesis_invalid");
  if (!list(raw.whatRemainsUncertain)) reject("uncertainty_synthesis_invalid");
  const overall = raw.overallAssessment as Record<string, unknown>;
  if (!overall || typeof overall !== "object" || Array.isArray(overall))
    reject("overall_assessment_invalid");
  if (
    !["promising", "mixed", "weak", "inconclusive"].includes(
      String(overall.label),
    )
  )
    reject("overall_assessment_label_invalid");
  if (!text(overall.summary)) reject("overall_assessment_summary_invalid");
  const next = raw.recommendedNextExperiment as Record<string, unknown>;
  if (!next || typeof next !== "object" || Array.isArray(next))
    reject("next_experiment_recommendation_invalid");
  if (!text(next.goal)) reject("next_experiment_goal_invalid");
  if (!text(next.reason)) reject("next_experiment_reason_invalid");
  if (!text(next.targetEvidenceGap))
    reject("next_experiment_evidence_gap_invalid");
  if (
    !["customer_interview", "survey", "other_future_family"].includes(
      String(next.suggestedFamily),
    )
  )
    reject("next_experiment_family_invalid");
  return value as ValidationIntelligenceResult;
}
