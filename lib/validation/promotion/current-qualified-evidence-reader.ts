import "server-only";

import {
  createSupabaseAdminClient,
  type SupabaseAdminClient,
} from "../../supabase/server-admin.ts";
import { VALIDATION_PROMOTION_PROJECTION_VERSION } from "./types.ts";

export type CurrentQualifiedValidationEvidence = Readonly<{
  id: string;
  canonical_problem_id: string;
  problem_title: string;
  source_evidence: string;
  source_type: "customer_interview_human_reviewed";
  evidence_polarity: "supporting" | "contradicting" | "mixed";
  observed_at: string;
  projection_version: typeof VALIDATION_PROMOTION_PROJECTION_VERSION;
}>;

export type CurrentQualifiedValidationEvidenceResult = Readonly<{
  observations: readonly CurrentQualifiedValidationEvidence[];
  complete: true;
}>;

const MAX_CANDIDATES = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return false;
  const match = TIMESTAMP.exec(value);
  if (!match) return false;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  return date.toISOString().slice(0, 10) === `${match[1]}-${match[2]}-${match[3]}`;
}

function validEvidence(value: unknown, canonicalId: string): value is CurrentQualifiedValidationEvidence {
  if (!object(value)) return false;
  return typeof value.id === "string" && UUID.test(value.id) &&
    value.canonical_problem_id === canonicalId &&
    typeof value.problem_title === "string" && value.problem_title.trim().length > 0 &&
    typeof value.source_evidence === "string" && value.source_evidence.trim().length > 0 &&
    Array.from(value.source_evidence).length <= 500 &&
    value.source_type === "customer_interview_human_reviewed" &&
    (value.evidence_polarity === "supporting" || value.evidence_polarity === "contradicting" || value.evidence_polarity === "mixed") &&
    validTimestamp(value.observed_at) &&
    value.projection_version === VALIDATION_PROMOTION_PROJECTION_VERSION &&
    Object.keys(value).sort().join(",") === [
      "canonical_problem_id", "evidence_polarity", "id", "observed_at", "problem_title",
      "projection_version", "source_evidence", "source_type",
    ].sort().join(",");
}

/** Reads the fixed-purpose current boundary. It is intentionally disconnected from consumers. */
export async function readCurrentQualifiedValidationEvidence(
  canonicalProblemId: string,
  db?: SupabaseAdminClient,
): Promise<CurrentQualifiedValidationEvidenceResult> {
  if (!UUID.test(canonicalProblemId)) {
    throw new Error("current_qualified_evidence_invalid_canonical_id");
  }
  const canonicalId = canonicalProblemId.toLowerCase();

  try {
    const { data, error } = await (db ?? createSupabaseAdminClient()).rpc(
      "validation_b43_read_current_evidence",
      { p_canonical_problem_id: canonicalId },
    );
    if (error || !object(data) || data.complete !== true || !Array.isArray(data.observations) ||
      data.observations.length > MAX_CANDIDATES ||
      !data.observations.every((row) => validEvidence(row, canonicalId))) {
      throw new Error("invalid_boundary_result");
    }
    const observations = data.observations.map((row) => Object.freeze({
      id: row.id,
      canonical_problem_id: row.canonical_problem_id,
      problem_title: row.problem_title,
      source_evidence: row.source_evidence,
      source_type: row.source_type,
      evidence_polarity: row.evidence_polarity,
      observed_at: row.observed_at,
      projection_version: row.projection_version,
    }));
    return Object.freeze({ observations: Object.freeze(observations), complete: true });
  } catch {
    throw new Error("current_qualified_evidence_read_failed");
  }
}
