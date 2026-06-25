import type { Evidence, EvidenceValidationResult } from "./types";

function isIsoDate(value: string) {
  return !Number.isNaN(Date.parse(value));
}

function isScore(value: number | null) {
  return value === null || (Number.isFinite(value) && value >= 0 && value <= 10);
}

export function validateEvidence(evidence: Evidence): EvidenceValidationResult {
  const errors: string[] = [];

  if (!evidence.sourceType) errors.push("sourceType is required.");
  if (!evidence.capturedText.trim()) errors.push("capturedText is required.");
  if (!isIsoDate(evidence.capturedAt)) errors.push("capturedAt must be a valid date.");
  if (!evidence.deduplicationFingerprint.trim()) {
    errors.push("deduplicationFingerprint is required.");
  }

  const scoreFields: Array<[string, number | null]> = [
    ["painIntensity", evidence.painIntensity],
    ["frequencySignal", evidence.frequencySignal],
    ["buyingIntentSignal", evidence.buyingIntentSignal],
    ["confidenceScore", evidence.confidenceScore],
    ["sourceQualityScore", evidence.sourceQualityScore],
  ];

  for (const [field, value] of scoreFields) {
    if (!isScore(value)) errors.push(`${field} must be between 0 and 10.`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function assertValidEvidence(evidence: Evidence) {
  const result = validateEvidence(evidence);

  if (!result.valid) {
    throw new Error(`Invalid evidence: ${result.errors.join(" ")}`);
  }

  return evidence;
}
