import { validateEvidence } from "../../evidence";
import type { PatternDetectionInput, PatternDetectionResult } from "./types";

/** Validates pattern detection input so the engine only connects trusted Evidence, Pain, and Knowledge objects. */
export function validatePatternDetectionInput(input: PatternDetectionInput) {
  const errors: string[] = [];
  if (input.evidence && !Array.isArray(input.evidence)) errors.push("evidence must be an array when provided.");
  if (input.painCandidates && !Array.isArray(input.painCandidates)) errors.push("painCandidates must be an array when provided.");
  if (input.painSignals && !Array.isArray(input.painSignals)) errors.push("painSignals must be an array when provided.");
  const invalidEvidence = (input.evidence || []).map(validateEvidence).filter((result) => !result.valid);
  if (invalidEvidence.length > 0) errors.push(`${invalidEvidence.length} evidence item(s) failed validation.`);
  return { valid: errors.length === 0, errors };
}

/** Validates pattern detection output before future orchestrators consume or persist pattern intelligence. */
export function validatePatternDetectionResult(result: PatternDetectionResult) {
  const errors: string[] = [];
  if (!result.runId.trim()) errors.push("runId is required.");
  if (Number.isNaN(Date.parse(result.detectedAt))) errors.push("detectedAt must be a valid date.");
  if (result.candidates.some((candidate) => candidate.score.totalScore < 0 || candidate.score.totalScore > 10)) {
    errors.push("candidate scores must be between 0 and 10.");
  }
  return { valid: errors.length === 0, errors };
}
