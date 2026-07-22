import "server-only";

import { createSupabaseAdminClient } from "./supabase/server-admin.ts";

export type OperationalWorkflow = "scan" | "weekly_intelligence" | "discover" | "results_validation";
export type OperationalEventStatus = "started" | "claimed" | "processing" | "completed" | "failed" | "reused" | "degraded" | "partial_persistence";

export type OperationalEventInput = Readonly<{
  workflow: OperationalWorkflow;
  eventType: string;
  status: OperationalEventStatus;
  userId?: string | null;
  requestId?: string | null;
  durationMs?: number | null;
  failureCategory?: string | null;
  safeMetadata?: Record<string, unknown> | null;
}>;

type OperationalEventsClient = Readonly<{
  from(table: "operational_events"): {
    insert(row: Record<string, unknown>): Promise<{ error?: unknown }>;
  };
}>;

const FORBIDDEN_METADATA_KEYS = new Set([
  "prompt",
  "prompts",
  "response",
  "responses",
  "ai_response",
  "airesponse",
  "completion",
  "completions",
  "evidence",
  "evidence_text",
  "evidencetext",
  "raw_evidence",
  "rawevidence",
  "tokens",
  "token",
  "provider_output",
  "provideroutput",
  "provider_response",
  "providerresponse",
  "user_text",
  "usertext",
  "email",
  "emails",
  "authorization",
  "auth_header",
  "authheader",
  "secret",
  "secrets",
  "api_key",
  "apikey",
  "credential",
  "credentials",
]);

function normalizeKey(key: string) {
  return key.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype);
}

function sanitizeMetadataValue(value: unknown, depth = 0): unknown {
  if (depth > 2) return null;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, 160);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeMetadataValue(item, depth + 1));
  if (!isPlainObject(value)) return null;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !FORBIDDEN_METADATA_KEYS.has(normalizeKey(key)))
      .slice(0, 20)
      .map(([key, child]) => [key.slice(0, 80), sanitizeMetadataValue(child, depth + 1)]),
  );
}

export function sanitizeOperationalMetadata(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return {};
  return sanitizeMetadataValue(metadata) as Record<string, unknown>;
}

function boundedText(value: string | null | undefined, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, maxLength) : null;
}

export async function recordOperationalEvent(
  input: OperationalEventInput,
  client?: OperationalEventsClient,
): Promise<void> {
  try {
    const persistenceClient = client || (createSupabaseAdminClient() as unknown as OperationalEventsClient);
    const { error } = await persistenceClient.from("operational_events").insert({
      workflow: input.workflow,
      event_type: boundedText(input.eventType, 80) || input.status,
      status: input.status,
      user_id: input.userId || null,
      request_id: boundedText(input.requestId, 120),
      duration_ms: typeof input.durationMs === "number" && Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : null,
      failure_category: boundedText(input.failureCategory, 80),
      safe_metadata: sanitizeOperationalMetadata(input.safeMetadata),
    });

    if (error) throw error;
  } catch (error) {
    console.warn("Operational event persistence failed", {
      workflow: input.workflow,
      eventType: input.eventType,
      status: input.status,
      failureCategory: boundedText(input.failureCategory, 80),
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}
