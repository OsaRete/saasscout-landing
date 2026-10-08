import "server-only";

import { createHash } from "node:crypto";
import {
  createSupabaseAdminClient,
  type SupabaseAdminClient,
} from "../../supabase/server-admin.ts";
import {
  VALIDATION_CANONICAL_RESOLVER_VERSION,
  VALIDATION_PROMOTION_POLICY_VERSION,
  VALIDATION_PROMOTION_PROJECTION_VERSION,
} from "./types.ts";

/** Sanitized shared fields only. No private qualification lineage escapes. */
export type TrustedQualifiedValidationEvidence = Readonly<{
  id: string;
  canonical_problem_id: string;
  problem_title: string;
  source_evidence: string;
  source_type: "customer_interview_human_reviewed";
  evidence_polarity: "supporting" | "contradicting" | "mixed";
  observed_at: string;
  projection_version: typeof VALIDATION_PROMOTION_PROJECTION_VERSION;
}>;

export type TrustedQualifiedValidationEvidenceResult = Readonly<{
  observations: readonly TrustedQualifiedValidationEvidence[];
  /** Successful reads are complete; incomplete bounded reads throw. */
  complete: boolean;
}>;

const MAX_CANDIDATES = 100;
const SOURCE_TYPE = "customer_interview_human_reviewed";

// The composite FK binds BOTH result ID and canonical ID. The older
// single-column FK must not be selected implicitly by PostgREST.
const PROJECTION = [
  "id,observation_id,classification_id,participant_id",
  "integrity_verified:validation_b42_snapshot_verified",
  "policy_version,eligible,eligibility_reasons",
  "independence_kind,independence_private_id,polarity",
  "representative_group_key,representative_selected",
  "canonical_problem_id,resolution_status,resolution_reason,resolver_version",
  "problem_observation_id,promotion_fingerprint,projection_version",
  "supersedes_promotion_id,deactivation_reason",
  "shared:problem_observations!validation_promotions_result_canonical_fk(" +
    "id,canonical_problem_id,problem_title,source_evidence,source_type," +
    "evidence_polarity,observed_at,observation_fingerprint,metadata)",
  "snapshot:validation_qualified_evidence_snapshots!validation_snapshots_promotion_fk(" +
    "promotion_id,problem_observation_id,canonical_problem_id,problem_title,source_evidence," +
    "source_type,evidence_polarity,observed_at,observation_fingerprint,promotion_fingerprint," +
    "projection_version,attestation_version)",
].join(",");

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function uuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

function polarity(value: unknown): value is TrustedQualifiedValidationEvidence["evidence_polarity"] {
  return value === "supporting" || value === "contradicting" || value === "mixed";
}

function observedTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  // Accept ordinary PostgREST timestamptz representations, not infinity,
  // locale-dependent dates, or timestamps whose zone has been lost.
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  return date.toISOString().slice(0, 10) === `${match[1]}-${match[2]}-${match[3]}`;
}

function qualify(
  row: unknown,
  canonicalProblemId: string,
): TrustedQualifiedValidationEvidence | null {
  if (!object(row)) return null;
  // Qualification is established from the immutable private ledger FIRST.
  // Only demonstrably unsupported/nonqualified B3.1 proof may be excluded.
  // B3.1 has no status column: finality is the persisted result linkage.
  // Corrections/deactivation are outside this supported promotion contract.
  if (
    !uuid(row.observation_id) || !uuid(row.classification_id) ||
    !uuid(row.participant_id) || !uuid(row.problem_observation_id) ||
    row.canonical_problem_id !== canonicalProblemId ||
    row.eligible !== true || row.representative_selected !== true ||
    !Array.isArray(row.eligibility_reasons) ||
    row.eligibility_reasons.length !== 1 || row.eligibility_reasons[0] !== "eligible" ||
    row.resolution_status !== "resolved" ||
    row.resolution_reason !== "server_exact_authority_snapshot" ||
    row.policy_version !== VALIDATION_PROMOTION_POLICY_VERSION ||
    row.resolver_version !== VALIDATION_CANONICAL_RESOLVER_VERSION ||
    row.projection_version !== VALIDATION_PROMOTION_PROJECTION_VERSION ||
    row.supersedes_promotion_id !== null || row.deactivation_reason !== null ||
    row.independence_kind !== "participant" ||
    row.independence_private_id !== row.participant_id ||
    !polarity(row.polarity) ||
    row.representative_group_key !==
      `participant:${row.participant_id}|${canonicalProblemId}|${row.polarity}`
  ) return null;

  // Same sorted-key JSON contract as promotion-service.ts; never hash titles
  // or respondent prose to infer canonical identity or qualification.
  const contract = {
    canonicalProblemId,
    classificationId: row.classification_id,
    observationId: row.observation_id,
    polarity: row.polarity,
    policyVersion: row.policy_version,
    projectionVersion: row.projection_version,
    resolverVersion: row.resolver_version,
  };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(contract))
    .digest("hex");
  if (
    row.promotion_fingerprint !== fingerprint
  ) return null;

  // A supported final ledger cannot be silently lost through missing,
  // historical, unsupported or corrupt integrity proof. Fail the whole read.
  if (!uuid(row.id) || !object(row.shared) || !object(row.snapshot)) {
    throw new Error("integrity_proof_failed");
  }
  const shared = row.shared;
  const snapshot = row.snapshot;
  if (row.integrity_verified !== true ||
    snapshot.attestation_version !== "v8-b4.2-b1-full-row.2" ||
    snapshot.promotion_id !== row.id ||
    snapshot.problem_observation_id !== row.problem_observation_id ||
    snapshot.canonical_problem_id !== canonicalProblemId ||
    snapshot.promotion_fingerprint !== fingerprint ||
    snapshot.projection_version !== row.projection_version ||
    ["problem_title", "source_evidence", "source_type", "evidence_polarity",
      "observed_at", "observation_fingerprint"]
      .some((field) => snapshot[field] !== shared[field]) ||
    shared.id !== row.problem_observation_id ||
    shared.canonical_problem_id !== canonicalProblemId ||
    shared.evidence_polarity !== row.polarity ||
    shared.source_type !== SOURCE_TYPE ||
    !object(shared.metadata) ||
    shared.metadata.projectionVersion !== VALIDATION_PROMOTION_PROJECTION_VERSION ||
    typeof shared.problem_title !== "string" || !shared.problem_title.trim() ||
    typeof shared.source_evidence !== "string" || !shared.source_evidence.trim() ||
    Array.from(shared.source_evidence).length > 500 ||
    !observedTime(shared.observed_at) ||
    shared.observation_fingerprint !== `validation-promotion:${fingerprint}`
  ) throw new Error("integrity_proof_failed");

  return Object.freeze({
    id: row.problem_observation_id,
    canonical_problem_id: canonicalProblemId,
    problem_title: shared.problem_title,
    source_evidence: shared.source_evidence,
    source_type: SOURCE_TYPE,
    evidence_polarity: row.polarity,
    observed_at: shared.observed_at,
    projection_version: VALIDATION_PROMOTION_PROJECTION_VERSION,
  });
}

/**
 * Bounded SELECT-only boundary; no endpoint or downstream integration.
 * The optional admin client is server-side dependency injection only.
 * At most 100 final candidates for ONE persisted canonical identity are read.
 * B4.2-B1 requires immutable snapshots; incomplete reads throw a generic error.
 */
export async function readTrustedQualifiedValidationEvidence(
  canonicalProblemId: string,
  db?: SupabaseAdminClient,
): Promise<TrustedQualifiedValidationEvidenceResult> {
  if (!uuid(canonicalProblemId)) {
    throw new Error("trusted_qualified_evidence_invalid_canonical_id");
  }

  try {
    const result = await (db ?? createSupabaseAdminClient())
      .from("validation_evidence_promotions")
      .select(PROJECTION, { count: "exact" })
      .eq("canonical_problem_id", canonicalProblemId)
      .eq("eligible", true)
      .eq("representative_selected", true)
      .eq("resolution_status", "resolved")
      .eq("policy_version", VALIDATION_PROMOTION_POLICY_VERSION)
      .eq("resolver_version", VALIDATION_CANONICAL_RESOLVER_VERSION)
      .eq("projection_version", VALIDATION_PROMOTION_PROJECTION_VERSION)
      .not("problem_observation_id", "is", null)
      .order("problem_observation_id", { ascending: true })
      .limit(MAX_CANDIDATES);

    // Malformed envelopes and relationship/schema errors must not masquerade
    // as successful reads. Never forward DB error text or attach a cause.
    if (result.error || !Array.isArray(result.data) || result.data.length > MAX_CANDIDATES ||
      !Number.isSafeInteger(result.count) || result.count! < result.data.length) {
      throw new Error("invalid_read_result");
    }
    // B4.2-B1: incomplete reads cannot expose a partially verified subset.
    if (result.count !== result.data.length) throw new Error("incomplete_read_result");

    const qualified = result.data
      .map((row: unknown) => qualify(row, canonicalProblemId))
      .filter((row): row is TrustedQualifiedValidationEvidence => row !== null);

    // DB uniqueness is still authoritative; reject duplicate proof results
    // defensively instead of creating extra evidence from a malformed response.
    const ids = new Set<string>();
    for (const row of qualified) {
      if (ids.has(row.id)) throw new Error("duplicate_read_result");
      ids.add(row.id);
    }
    return Object.freeze({
      observations: Object.freeze(qualified),
      complete: result.count === result.data.length,
    });
  } catch {
    throw new Error("trusted_qualified_evidence_read_failed");
  }
}
