import type { SolutionIntelligenceInput, SolutionIntelligenceResult } from "./types.ts";

export function validateSolutionIntelligenceInput(input: SolutionIntelligenceInput) {
  const errors: string[] = [];
  if (!input.problemTitle?.trim()) errors.push("problemTitle is required.");
  if (!input.problemSummary?.trim()) errors.push("problemSummary is required.");
  if (input.evidenceReferences && !Array.isArray(input.evidenceReferences)) errors.push("evidenceReferences must be an array when provided.");
  return { valid: errors.length === 0, errors };
}

export function validateSolutionIntelligenceResult(result: SolutionIntelligenceResult) {
  const errors: string[] = [];
  if (!result.runId.trim()) errors.push("runId is required.");
  if (Number.isNaN(Date.parse(result.evaluatedAt))) errors.push("evaluatedAt must be a valid date.");
  if (result.evaluations.some((item) => item.scoreBreakdown.overallSolutionScore < 0 || item.scoreBreakdown.overallSolutionScore > 10)) errors.push("overall solution scores must be between 0 and 10.");
  if (result.diagnostics.evaluatedCategoryCount !== result.evaluations.length) errors.push("evaluatedCategoryCount must match evaluations length.");
  return { valid: errors.length === 0, errors };
}
