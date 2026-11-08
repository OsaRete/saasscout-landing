// Pure disposable-harness preparation: no clients, credentials or DB connection.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { prepareValidationPromotion } from "../lib/validation/promotion/preparation.ts";
import type { PersistedPromotionRows } from "../lib/validation/promotion/read-repository.ts";
import { VALIDATION_PROMOTION_POLICY_VERSION as policyVersion,
  VALIDATION_CANONICAL_RESOLVER_VERSION as resolverVersion,
  VALIDATION_PROMOTION_PROJECTION_VERSION as projectionVersion } from "../lib/validation/promotion/types.ts";

export function prepareF4Promotion(rows: PersistedPromotionRows, observationId: string) {
  const prepared = prepareValidationPromotion(rows);
  const item = prepared.evaluated.find(row => row.input.observationId === observationId);
  const selection = prepared.selections.find(row => row.representativeObservationId === observationId);
  if (!item?.eligibility.eligible || item.resolution?.status !== "resolved" || !selection) {
    return { disposition: "qualification_deferred" as const };
  }
  const observation = rows.observations.find(row => row.id === observationId);
  const canonical = rows.canonicalProblems.find(row => row.id === item.resolution?.canonicalProblemId);
  if (!observation || !canonical || !item.eligibility.classificationId || !item.eligibility.classification) {
    throw new Error("preparation_contract_failed");
  }
  // Same sorted-key contract as production; no fixed fixture classification,
  // polarity or previously prepared command survives an attempt boundary.
  const contract = { canonicalProblemId: item.resolution.canonicalProblemId,
    classificationId: item.eligibility.classificationId, observationId,
    polarity: item.eligibility.classification, policyVersion, projectionVersion, resolverVersion };
  return { disposition: "prepared" as const, contract,
    fingerprint: createHash("sha256").update(JSON.stringify(contract)).digest("hex"),
    groupKey: selection.groupKey, participantId: observation.participant_id,
    subjectId: observation.subject_id, hypothesisVersionId: observation.hypothesis_version_id,
    canonicalTitle: canonical.canonical_title, normalizedTitle: canonical.normalized_title };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const raw = readFileSync(0, "utf8");
    if (Buffer.byteLength(raw) > 2_097_152) throw new Error("input_bound");
    const input = JSON.parse(raw) as { rows: PersistedPromotionRows; observationId: string };
    process.stdout.write(JSON.stringify(prepareF4Promotion(input.rows, input.observationId)));
  } catch {
    // Never echo stdin, qualification content or raw exception messages.
    process.stderr.write("F4 preparation failed\n");
    process.exitCode = 1;
  }
}
