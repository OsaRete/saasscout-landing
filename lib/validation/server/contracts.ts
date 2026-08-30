export const LIMITS = { label: 200, text: 4_000, jsonBytes: 32_000, list: 50, ingestionKey: 200 } as const;

export type ValidationErrorCode = "unauthenticated" | "not_found" | "invalid_request" | "invalid_hypothesis" | "invalid_experiment_design" | "invalid_lifecycle_transition" | "invalid_evidence_origin" | "invalid_evidence_classification" | "version_conflict" | "idempotency_conflict" | "participant_scope_mismatch" | "constraint_conflict";

export class ValidationServerError extends Error {
  constructor(readonly status: number, readonly code: ValidationErrorCode, message: string) { super(message); this.name = "ValidationServerError"; }
}

export type HypothesisVersionInput = { targetSegment: string; problemClaim: string; expectedObservableBehavior: string; commercialAssumption?: string; supportCriteria: string[]; contradictionCriteria: string[]; inconclusiveCriteria: string[]; scope: { included: string[]; excluded: string[] }; supersedesVersionId?: string };
export type ExperimentVersionInput = { hypothesisVersionId: string; family: "customer_interview" | "survey"; targetAudience: string[]; collectionMethod: string; designSnapshot: Record<string, unknown>; screeningCriteria: string[]; consentPrivacyMode: "anonymous_notes" | "pseudonymous_notes" | "identified_with_explicit_consent"; supersedesVersionId?: string };

export type ValidationSubjectSummary = { id: string; creationOrigin: string; label: string; contextSnapshot: Record<string, unknown>; status: string; createdAt: string };
export type ValidationSubjectListItem = ValidationSubjectSummary & { latestHypothesis: { versionNumber: number; problemClaim: string } | null; experimentCount: number; experimentLifecycles: string[]; observationCount: number };
export type ValidationWorkspaceView = { subject: ValidationSubjectSummary; links: unknown[]; hypotheses: unknown[]; experiments: unknown[]; participantCount: number; observations: unknown[]; classifications: unknown[]; interviewPlans: unknown[]; interviewSessions: unknown[]; participants: unknown[] };
export type ValidationHypothesisView = { id: string; subjectId: string; status: string; createdAt: string; versions: unknown[] };
export type ValidationExperimentView = { id: string; subjectId: string; visibility: string; createdAt: string; versions: unknown[] };

export function assertObject(value: unknown, name = "request"): asserts value is Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationServerError(400, "invalid_request", `${name} must be an object.`); }
export function text(value: unknown, name: string, max: number = LIMITS.text): string { if (typeof value !== "string" || !value.trim() || value.length > max) throw new ValidationServerError(400, "invalid_request", `${name} is required and must be at most ${max} characters.`); return value.trim(); }
export function optionalText(value: unknown, name: string, max: number = LIMITS.text): string | undefined { return value == null ? undefined : text(value, name, max); }
export function stringList(value: unknown, name: string, required = false): string[] { if (!Array.isArray(value) || value.length > LIMITS.list || (required && !value.length)) throw new ValidationServerError(400, "invalid_request", `${name} must be a bounded${required ? ", non-empty" : ""} string array.`); return value.map((v, i) => text(v, `${name}.${i}`)); }
export function jsonObject(value: unknown, name: string): Record<string, unknown> { assertObject(value, name); if (Buffer.byteLength(JSON.stringify(value)) > LIMITS.jsonBytes) throw new ValidationServerError(413, "invalid_request", `${name} exceeds ${LIMITS.jsonBytes} bytes.`); return value; }
export function rejectAuthorityFields(input: Record<string, unknown>) { for (const field of ["owner_id", "ownerId", "created_at", "collected_at", "classified_at", "version_number", "started_at", "completed_at", "cancelled_at", "subject_id", "hypothesis_id", "experiment_id"]) if (field in input) throw new ValidationServerError(400, "invalid_request", `${field} is server-owned.`); }
