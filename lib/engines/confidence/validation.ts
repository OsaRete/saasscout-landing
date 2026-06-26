import { validateEvidence } from "../../evidence";
import type { ConfidenceDetectionInput, ConfidenceDetectionResult } from "./types";

/** Validates Confidence Engine input before trust scoring is applied to evidence or upstream intelligence. */
export function validateConfidenceDetectionInput(input: ConfidenceDetectionInput) {
  const errors: string[] = [];
  if (input.evidence && !Array.isArray(input.evidence)) errors.push("evidence must be an array when provided.");
  if (input.knownProblems && !Array.isArray(input.knownProblems)) errors.push("knownProblems must be an array when provided.");
  if (input.relationships && !Array.isArray(input.relationships)) errors.push("relationships must be an array when provided.");
  const invalidEvidence = (input.evidence || []).map(validateEvidence).filter((result) => !result.valid);
  if (invalidEvidence.length > 0) errors.push(`${invalidEvidence.length} evidence item(s) failed validation.`);
  return { valid: errors.length === 0, errors };
}

/** Validates Confidence Engine results before future orchestrators persist or expose trust intelligence. */
export function validateConfidenceDetectionResult(result: ConfidenceDetectionResult) {
  const errors: string[] = [];
  if (!result.runId.trim()) errors.push("runId is required.");
  if (Number.isNaN(Date.parse(result.detectedAt))) errors.push("detectedAt must be a valid date.");
  if (result.candidates.some((candidate) => candidate.score.totalScore < 0 || candidate.score.totalScore > 10)) errors.push("candidate scores must be between 0 and 10.");
  return { valid: errors.length === 0, errors };
}
