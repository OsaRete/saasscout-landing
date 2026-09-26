import "server-only";

import { createHash } from "node:crypto";
import {
  createSupabaseAdminClient,
  type SupabaseAdminClient,
} from "../../supabase/server-admin.ts";
import { ValidationServerError } from "../server/contracts.ts";
import { prepareValidationPromotion } from "./preparation.ts";
import { readValidationPromotionRowsForOwner } from "./read-repository.ts";
import {
  VALIDATION_CANONICAL_RESOLVER_VERSION,
  VALIDATION_PROMOTION_POLICY_VERSION,
  VALIDATION_PROMOTION_PROJECTION_VERSION,
} from "./types.ts";

const compare = (a: string, b: string) =>
  a < b ? -1 : a > b ? 1 : 0;

const stable = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(stable).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.entries(value)
          .sort(([a], [b]) => compare(a, b))
          .map(
            ([key, item]) =>
              `${JSON.stringify(key)}:${stable(item)}`,
          )
          .join(",")}}`
      : JSON.stringify(value);

/**
 * Captures the persisted Validation state for the participant whose
 * representative is about to be promoted.
 *
 * This does NOT decide which observation is representative.
 * Representative selection remains exclusively in the TypeScript B2
 * preparation pipeline.
 *
 * PostgreSQL compares this server-derived snapshot after acquiring the
 * B3.1 coordination locks. If ranking-relevant persisted state changed
 * between preparation and promotion, the transaction fails closed and
 * the caller must prepare again.
 */
function buildRepresentativeState(
  rows: NonNullable<
    Awaited<ReturnType<typeof readValidationPromotionRowsForOwner>>
  >,
  participantId: string,
) {
  const observations = rows.observations
    .filter((row) => row.participant_id === participantId)
    .sort((a, b) =>
      compare(
        String(a.id ?? ""),
        String(b.id ?? ""),
      ),
    );

  const observationIds = new Set(
    observations.map((row) => String(row.id ?? "")),
  );

  const experimentVersionIds = new Set(
    observations
      .map((row) => String(row.experiment_version_id ?? ""))
      .filter(Boolean),
  );

  const sessionIds = new Set(
    observations
      .map((row) => String(row.interview_session_id ?? ""))
      .filter(Boolean),
  );

  return {
    participant: rows.participants
      .filter((row) => row.id === participantId)
      .sort((a, b) =>
        compare(
          String(a.id ?? ""),
          String(b.id ?? ""),
        ),
      ),

    observations,

    classifications: rows.classifications
      .filter((row) =>
        observationIds.has(String(row.observation_id ?? "")),
      )
      .sort((a, b) =>
        compare(
          String(a.id ?? ""),
          String(b.id ?? ""),
        ),
      ),

    sessions: rows.sessions
      .filter((row) =>
        sessionIds.has(String(row.id ?? "")),
      )
      .sort((a, b) =>
        compare(
          String(a.id ?? ""),
          String(b.id ?? ""),
        ),
      ),

    experiments: rows.experiments
      .filter((row) =>
        experimentVersionIds.has(String(row.id ?? "")),
      )
      .sort((a, b) =>
        compare(
          String(a.id ?? ""),
          String(b.id ?? ""),
        ),
      ),
  };
}

export async function promoteCustomerInterviewEvidence(
  ownerId: string,
  observationId: string,
  db: SupabaseAdminClient = createSupabaseAdminClient(),
) {
  /*
   * Interactive B3.1 preparation is owner-scoped.
   *
   * The global B2 reader remains available for the read-only dry-run
   * pipeline, but an authenticated interactive request must never load
   * another owner's private Validation corpus.
   */
  const rows = await readValidationPromotionRowsForOwner(
    ownerId,
    observationId,
    db,
  );

  if (!rows) {
    throw new ValidationServerError(
      404,
      "not_found",
      "Validation resource not found.",
    );
  }

  /*
   * TypeScript remains authoritative for:
   * - eligibility
   * - exact canonical resolution
   * - representative selection
   *
   * PostgreSQL must not independently reproduce these algorithms.
   */
  const prepared = prepareValidationPromotion(rows);

  const item = prepared.evaluated.find(
    (candidate) =>
      candidate.input.observationId === observationId,
  );

  if (
    !item ||
    !item.eligibility.eligible ||
    item.resolution?.status !== "resolved"
  ) {
    throw new ValidationServerError(
      409,
      "constraint_conflict",
      "Evidence is not eligible for shared promotion.",
    );
  }

  const selection = prepared.selections.find(
    (candidate) =>
      candidate.representativeObservationId === observationId,
  );

  if (!selection) {
    throw new ValidationServerError(
      409,
      "constraint_conflict",
      "Evidence is not the representative for its participant group.",
    );
  }

  const observation = rows.observations.find(
    (row) => row.id === observationId,
  );

  if (!observation) {
    throw new ValidationServerError(
      409,
      "constraint_conflict",
      "Authoritative Validation state changed; prepare promotion again.",
    );
  }

  const participantId =
    typeof observation.participant_id === "string"
      ? observation.participant_id
      : null;

  if (!participantId) {
    throw new ValidationServerError(
      409,
      "constraint_conflict",
      "Evidence has no authoritative participant identity.",
    );
  }

  /*
   * P1 freshness proof.
   *
   * This snapshot is generated exclusively by the server from persisted
   * Validation rows. The browser never supplies representative authority.
   *
   * It deliberately contains persisted state rather than the result of
   * the ranking algorithm. PostgreSQL therefore only has to answer:
   *
   * "Is the state against which TypeScript selected this representative
   * still the current persisted state after coordination locks?"
   *
   * If not, promotion fails closed and TypeScript prepares again.
   */
  const representativeState = buildRepresentativeState(
    rows,
    participantId,
  );

  const canonical = rows.canonicalProblems.find(
    (row) =>
      row.id === item.resolution?.canonicalProblemId,
  );

  if (!canonical) {
    throw new ValidationServerError(
      409,
      "constraint_conflict",
      "Canonical authority changed; prepare promotion again.",
    );
  }

  /*
   * Canonical authority snapshot remains independent from representative
   * freshness. B3.0.2 TypeScript exact resolution remains authoritative;
   * SQL only verifies that the persisted canonical authority has not
   * changed since preparation.
   */
  const authoritySnapshot = {
    subjectLabel: item.identity.subjectLabel,
    hypothesisProblemClaim:
      item.identity.hypothesisProblemClaim,

    canonicalProblems: rows.canonicalProblems
      .map((row) => ({
        id: row.id,
        canonicalTitle: row.canonical_title,
        normalizedTitle: row.normalized_title,
        status: row.status,
      }))
      .sort((a, b) =>
        compare(
          String(a.id),
          String(b.id),
        ),
      ),

    aliases: rows.aliases
      .map((row) => ({
        canonicalProblemId:
          row.canonical_problem_id,
        normalizedAlias:
          row.normalized_alias,
      }))
      .sort((a, b) =>
        compare(
          `${a.canonicalProblemId}|${a.normalizedAlias}`,
          `${b.canonicalProblemId}|${b.normalizedAlias}`,
        ),
      ),
  };

  /*
   * The promotion fingerprint identifies the requested final promotion
   * contract.
   *
   * Representative freshness is intentionally NOT part of this
   * fingerprint. Freshness is a concurrency precondition, not the
   * identity of the promoted evidence.
   */
  const fingerprint = createHash("sha256")
    .update(
      stable({
        observationId,
        classificationId:
          item.eligibility.classificationId,
        canonicalProblemId:
          item.resolution.canonicalProblemId,
        polarity:
          item.eligibility.classification,
        policyVersion:
          VALIDATION_PROMOTION_POLICY_VERSION,
        resolverVersion:
          VALIDATION_CANONICAL_RESOLVER_VERSION,
        projectionVersion:
          VALIDATION_PROMOTION_PROJECTION_VERSION,
      }),
    )
    .digest("hex");

  const { data, error } = await db.rpc(
    "validation_promote_customer_interview_evidence",
    {
      p_owner_id: ownerId,
      p_observation_id: observationId,
      p_classification_id:
        item.eligibility.classificationId,
      p_canonical_problem_id:
        item.resolution.canonicalProblemId,
      p_polarity:
        item.eligibility.classification,
      p_representative_group_key:
        selection.groupKey,
      p_promotion_fingerprint:
        fingerprint,

      /*
       * Server-derived freshness precondition.
       *
       * The SQL boundary must compare this against the current persisted
       * participant state only AFTER acquiring canonical -> experiment ->
       * participant -> representative-group coordination locks.
       */
      p_representative_state:
        representativeState,

      p_authority_snapshot:
        authoritySnapshot,
      p_canonical_title:
        canonical.canonical_title,
      p_normalized_title:
        canonical.normalized_title,
      p_policy_version:
        VALIDATION_PROMOTION_POLICY_VERSION,
      p_resolver_version:
        VALIDATION_CANONICAL_RESOLVER_VERSION,
      p_projection_version:
        VALIDATION_PROMOTION_PROJECTION_VERSION,
    },
  );

  if (error || !data) {
    throw new ValidationServerError(
      409,
      "constraint_conflict",
      error?.message?.includes(
        "correction required",
      )
        ? "Promoted evidence is final; a correction workflow is required."
        : "Evidence promotion failed closed because authoritative state changed.",
    );
  }

  return data;
}