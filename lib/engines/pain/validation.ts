import { validateEvidence } from "../../evidence";
import type { PainDetectionInput, PainDetectionResult } from "./types";

/** Validates pain detection input so the engine reasons only over reusable Evidence and Knowledge objects. */
export function validatePainDetectionInput(input: PainDetectionInput) {
  const errors: string[] = [];
  if (!Array.isArray(input.evidence)) errors.push("evidence must be an array.");
  const invalidEvidence = (input.evidence || []).map(validateEvidence).filter((result) => !result.valid);
  if (invalidEvidence.length > 0) errors.push(`${invalidEvidence.length} evidence item(s) failed validation.`);
  return { valid: errors.length === 0, errors };
}

/** Validates the produced result before future orchestrators persist or consume pain intelligence. */
export function validatePainDetectionResult(result: PainDetectionResult) {
  const errors: string[] = [];
  if (!result.runId.trim()) errors.push("runId is required.");
  if (Number.isNaN(Date.parse(result.detectedAt))) errors.push("detectedAt must be a valid date.");
  if (result.candidates.some((candidate) => candidate.score.totalScore < 0 || candidate.score.totalScore > 10)) {
    errors.push("candidate scores must be between 0 and 10.");
  }
  return { valid: errors.length === 0, errors };
}
