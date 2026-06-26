import type { FeedbackEvent, FeedbackLearningInput, FeedbackLearningResult } from "./types";

function validDate(value: string) { return !Number.isNaN(Date.parse(value)); }
function scoreInRange(value: number | null | undefined) { return value == null || (Number.isFinite(value) && value >= 0 && value <= 10); }

/** Validates feedback events before real-world outcomes are allowed to influence SaaSScout intelligence. */
export function validateFeedbackEvent(event: FeedbackEvent) {
  const errors: string[] = [];
  if (!event.id.trim()) errors.push("event id is required.");
  if (!event.title.trim()) errors.push("event title is required.");
  if (!validDate(event.occurredAt)) errors.push("event occurredAt must be a valid date.");
  if (!validDate(event.outcome.occurredAt)) errors.push("outcome occurredAt must be a valid date.");
  if (!scoreInRange(event.strengthScore)) errors.push("strengthScore must be between 0 and 10.");
  if (!scoreInRange(event.confidenceScore)) errors.push("confidenceScore must be between 0 and 10.");
  return { valid: errors.length === 0, errors };
}

/** Validates Feedback Engine input before reusable learning signals are produced. */
export function validateFeedbackLearningInput(input: FeedbackLearningInput) {
  const errors: string[] = [];
  if (!Array.isArray(input.events)) errors.push("events must be an array.");
  const invalidEvents = (input.events || []).map(validateFeedbackEvent).filter((result) => !result.valid);
  if (invalidEvents.length > 0) errors.push(`${invalidEvents.length} feedback event(s) failed validation.`);
  return { valid: errors.length === 0, errors };
}

/** Validates Feedback Engine results before future persistence or orchestration adoption. */
export function validateFeedbackLearningResult(result: FeedbackLearningResult) {
  const errors: string[] = [];
  if (!result.runId.trim()) errors.push("runId is required.");
  if (!validDate(result.learnedAt)) errors.push("learnedAt must be a valid date.");
  if (result.signals.some((signal) => signal.learningImpactScore < 0 || signal.learningImpactScore > 10)) errors.push("learning impact scores must be between 0 and 10.");
  return { valid: errors.length === 0, errors };
}
