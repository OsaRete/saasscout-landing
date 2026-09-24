import { createHash } from "node:crypto";

import { prepareValidationPromotion } from "./preparation.ts";
import type { PersistedPromotionRows } from "./read-repository.ts";
import { VALIDATION_CANONICAL_RESOLVER_VERSION, VALIDATION_PROMOTION_POLICY_VERSION } from "./types.ts";

export const VALIDATION_PROMOTION_PROJECTION_VERSION = "validation_customer_interview_promotion_v1" as const;
export const VALIDATION_PROMOTION_SOURCE_TYPE = "validation_customer_interview_promotion_v1" as const;

export type ValidationPromotionAuthority = {
  observationId: string;
  classificationId: string;
  canonicalProblemId: string;
  subjectLabel: string;
  hypothesisProblemClaim: string;
  polarity: "supporting" | "contradicting" | "mixed";
  authoritySnapshot: PersistedPromotionRows;
};

export function deriveValidationPromotionAuthority(rows: PersistedPromotionRows, observationId: string): ValidationPromotionAuthority {
  const prepared = prepareValidationPromotion(rows);
  const item = prepared.evaluated.find((entry) => entry.input.observationId === observationId);
  if (!item) throw new Error("promotion_not_found");
  if (!item.eligibility.eligible) throw new Error("promotion_not_eligible");
  if (item.resolution?.status !== "resolved" || !item.resolution.canonicalProblemId) throw new Error(`promotion_canonical_${item.resolution?.status ?? "not_evaluated"}`);
  const selection = prepared.selections.find((entry) => entry.representativeObservationId === observationId);
  if (!selection) throw new Error("promotion_non_representative");
  if (!item.eligibility.classificationId) throw new Error("promotion_classification_authority");
  return {
    observationId,
    classificationId: item.eligibility.classificationId,
    canonicalProblemId: item.resolution.canonicalProblemId,
    subjectLabel: item.identity.subjectLabel ?? "",
    hypothesisProblemClaim: item.identity.hypothesisProblemClaim ?? "",
    polarity: item.eligibility.classification as "supporting" | "contradicting" | "mixed",
    authoritySnapshot: rows,
  };
}

export function validationPromotionFingerprint(input: Pick<ValidationPromotionAuthority, "observationId" | "classificationId" | "canonicalProblemId"> & { polarity: "supporting" | "contradicting" | "mixed" }) {
  const identity = [
    "saasscout:validation-customer-interview-promotion:v1",
    input.observationId,
    input.classificationId,
    input.canonicalProblemId,
    input.polarity,
    VALIDATION_PROMOTION_POLICY_VERSION,
    VALIDATION_CANONICAL_RESOLVER_VERSION,
    VALIDATION_PROMOTION_PROJECTION_VERSION,
  ].join("\n");
  return `vcip1:${createHash("sha256").update(identity, "utf8").digest("hex")}`;
}
