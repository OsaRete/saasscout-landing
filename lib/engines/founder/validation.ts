import type { FounderIntelligenceInput, FounderIntelligenceResult, FounderProfile } from "./types";

export type FounderValidationResult = { valid: boolean; errors: string[] };

/** Validates founder profiles before they become reusable personalization intelligence. */
export function validateFounderProfile(profile: FounderProfile): FounderValidationResult {
  const errors: string[] = [];
  if (!profile.id?.trim()) errors.push("Founder profile requires an id.");
  if ((profile.availableBudgetUsd ?? 0) < 0) errors.push("Founder budget cannot be negative.");
  if ((profile.availableHoursPerWeek ?? 0) < 0) errors.push("Founder available hours cannot be negative.");
  return { valid: errors.length === 0, errors };
}

/** Validates Founder Intelligence input without requiring route, prompt, database, or UI integration. */
export function validateFounderIntelligenceInput(input: FounderIntelligenceInput): FounderValidationResult {
  const profileValidation = validateFounderProfile(input.founderProfile);
  const errors = [...profileValidation.errors];
  if (input.evaluatedAt && Number.isNaN(Date.parse(String(input.evaluatedAt)))) errors.push("Founder intelligence evaluatedAt must be a valid timestamp.");
  return { valid: errors.length === 0, errors };
}

/** Validates Founder Intelligence results so future orchestrators can trust fit ranking outputs. */
export function validateFounderIntelligenceResult(result: FounderIntelligenceResult): FounderValidationResult {
  const errors: string[] = [];
  if (!result.runId.trim()) errors.push("Founder intelligence result requires a runId.");
  if (Number.isNaN(Date.parse(result.evaluatedAt))) errors.push("Founder intelligence result requires a valid evaluatedAt timestamp.");
  if (result.opportunityFits.some((fit) => fit.rank < 1)) errors.push("Founder opportunity fits must be ranked with positive ranks.");
  return { valid: errors.length === 0, errors };
}
