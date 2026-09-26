import "server-only";

import { createHash } from "node:crypto";
import {
  createSupabaseAdminClient,
  type SupabaseAdminClient,
} from "../../supabase/server-admin.ts";
import { ValidationServerError } from "../server/contracts.ts";
import { prepareValidationPromotion } from "./preparation.ts";
import { readValidationPromotionRows } from "./read-repository.ts";
import {
  VALIDATION_CANONICAL_RESOLVER_VERSION,
  VALIDATION_PROMOTION_POLICY_VERSION,
  VALIDATION_PROMOTION_PROJECTION_VERSION,
} from "./types.ts";

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const stable = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(stable).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.entries(value)
          .sort(([a], [b]) => compare(a, b))
          .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
          .join(",")}}`
      : JSON.stringify(value);

export async function promoteCustomerInterviewEvidence(
  ownerId: string,
  observationId: string,
  db: SupabaseAdminClient = createSupabaseAdminClient(),
) {
  const rows = await readValidationPromotionRows(db);
  const prepared = prepareValidationPromotion(rows);
  const item = prepared.evaluated.find(
    (candidate) => candidate.input.observationId === observationId,
  );
  if (
    !item ||
    !item.eligibility.eligible ||
    item.resolution?.status !== "resolved"
  )
    throw new ValidationServerError(
      409,
      "constraint_conflict",
      "Evidence is not eligible for shared promotion.",
    );
  const selection = prepared.selections.find(
    (candidate) => candidate.representativeObservationId === observationId,
  );
  if (!selection)
    throw new ValidationServerError(
      409,
      "constraint_conflict",
      "Evidence is not the representative for its participant group.",
    );
  const observation = rows.observations.find((row) => row.id === observationId);
  if (!observation || observation.owner_id !== ownerId)
    throw new ValidationServerError(
      404,
      "not_found",
      "Validation resource not found.",
    );
  const canonical = rows.canonicalProblems.find(
    (row) => row.id === item.resolution?.canonicalProblemId,
  );
  if (!canonical)
    throw new ValidationServerError(
      409,
      "constraint_conflict",
      "Canonical authority changed; prepare promotion again.",
    );
  const authoritySnapshot = {
    subjectLabel: item.identity.subjectLabel,
    hypothesisProblemClaim: item.identity.hypothesisProblemClaim,
    canonicalProblems: rows.canonicalProblems
      .map((row) => ({
        id: row.id,
        canonicalTitle: row.canonical_title,
        normalizedTitle: row.normalized_title,
        status: row.status,
      }))
      .sort((a, b) => compare(String(a.id), String(b.id))),
    aliases: rows.aliases
      .map((row) => ({
        canonicalProblemId: row.canonical_problem_id,
        normalizedAlias: row.normalized_alias,
      }))
      .sort((a, b) =>
        compare(
          `${a.canonicalProblemId}|${a.normalizedAlias}`,
          `${b.canonicalProblemId}|${b.normalizedAlias}`,
        ),
      ),
  };
  const fingerprint = createHash("sha256")
    .update(
      stable({
        observationId,
        classificationId: item.eligibility.classificationId,
        canonicalProblemId: item.resolution.canonicalProblemId,
        polarity: item.eligibility.classification,
        policyVersion: VALIDATION_PROMOTION_POLICY_VERSION,
        resolverVersion: VALIDATION_CANONICAL_RESOLVER_VERSION,
        projectionVersion: VALIDATION_PROMOTION_PROJECTION_VERSION,
      }),
    )
    .digest("hex");
  const { data, error } = await db.rpc(
    "validation_promote_customer_interview_evidence",
    {
      p_owner_id: ownerId,
      p_observation_id: observationId,
      p_classification_id: item.eligibility.classificationId,
      p_canonical_problem_id: item.resolution.canonicalProblemId,
      p_polarity: item.eligibility.classification,
      p_representative_group_key: selection.groupKey,
      p_promotion_fingerprint: fingerprint,
      p_authority_snapshot: authoritySnapshot,
      p_canonical_title: canonical.canonical_title,
      p_normalized_title: canonical.normalized_title,
      p_policy_version: VALIDATION_PROMOTION_POLICY_VERSION,
      p_resolver_version: VALIDATION_CANONICAL_RESOLVER_VERSION,
      p_projection_version: VALIDATION_PROMOTION_PROJECTION_VERSION,
    },
  );
  if (error || !data)
    throw new ValidationServerError(
      409,
      "constraint_conflict",
      error?.message?.includes("correction required")
        ? "Promoted evidence is final; a correction workflow is required."
        : "Evidence promotion failed closed because authoritative state changed.",
    );
  return data;
}
