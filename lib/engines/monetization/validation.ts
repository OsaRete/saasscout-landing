import { validateEvidence } from "../../evidence";
import type { MonetizationDetectionInput, MonetizationDetectionResult } from "./types";

/** Validates monetization input so the engine only evaluates trusted Evidence and upstream engine objects. */
export function validateMonetizationDetectionInput(input: MonetizationDetectionInput) {
  const errors: string[] = [];
  if (input.evidence && !Array.isArray(input.evidence)) errors.push("evidence must be an array when provided.");
  if (input.opportunityCandidates && !Array.isArray(input.opportunityCandidates)) errors.push("opportunityCandidates must be an array when provided.");
  if (input.painCandidates && !Array.isArray(input.painCandidates)) errors.push("painCandidates must be an array when provided.");
  if (input.patternCandidates && !Array.isArray(input.patternCandidates)) errors.push("patternCandidates must be an array when provided.");
  if (input.trendCandidates && !Array.isArray(input.trendCandidates)) errors.push("trendCandidates must be an array when provided.");
  const invalidEvidence = (input.evidence || []).map(validateEvidence).filter((result) => !result.valid);
  if (invalidEvidence.length > 0) errors.push(`${invalidEvidence.length} evidence item(s) failed validation.`);
  return { valid: errors.length === 0, errors };
}

/** Validates monetization results before future orchestrators persist or expose business viability intelligence. */
export function validateMonetizationDetectionResult(result: MonetizationDetectionResult) {
  const errors: string[] = [];
  if (!result.runId.trim()) errors.push("runId is required.");
  if (Number.isNaN(Date.parse(result.detectedAt))) errors.push("detectedAt must be a valid date.");
  if (result.candidates.some((candidate) => candidate.score.totalScore < 0 || candidate.score.totalScore > 10)) errors.push("candidate scores must be between 0 and 10.");
  return { valid: errors.length === 0, errors };
}
