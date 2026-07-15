import assert from "node:assert/strict";
import test from "node:test";

import {
  summarizeScanGrounding,
  validateScanGroundedClaim,
} from "../lib/scan/grounding.ts";

const allowed = new Set(["evidence-001", "evidence-002"]);

test("validates evidence-grounded and inference claims without mutation", () => {
  const evidenceClaim = Object.freeze({
    text: "Users report manual reporting pain.",
    groundingMode: "evidence",
    evidenceRefs: Object.freeze([{ evidenceId: "evidence-001", relevance: "primary" }]),
  });
  const inferenceClaim = Object.freeze({
    text: "A dashboard may reduce reporting time.",
    groundingMode: "inference",
    evidenceRefs: Object.freeze([]),
    inferenceReason: "This is a solution recommendation inferred from the pain pattern.",
  });

  const validatedEvidence = validateScanGroundedClaim(evidenceClaim, { allowedEvidenceIds: allowed, path: "claim" });
  const validatedInference = validateScanGroundedClaim(inferenceClaim, { allowedEvidenceIds: allowed, path: "claim" });

  assert.equal(validatedEvidence.issues.length, 0);
  assert.equal(validatedInference.issues.length, 0);
  assert.deepEqual(evidenceClaim.evidenceRefs, [{ evidenceId: "evidence-001", relevance: "primary" }]);
});

test("rejects invalid grounding shapes deterministically", () => {
  const cases = [
    { text: "No refs", groundingMode: "evidence", evidenceRefs: [] },
    { text: "Bad inference", groundingMode: "inference", evidenceRefs: [{ evidenceId: "evidence-001" }], inferenceReason: "because" },
    { text: "Missing reason", groundingMode: "inference", evidenceRefs: [] },
    { text: "Unknown", groundingMode: "evidence", evidenceRefs: [{ evidenceId: "missing" }] },
    { text: "Duplicate", groundingMode: "evidence", evidenceRefs: [{ evidenceId: "evidence-001" }, { evidenceId: "evidence-001" }] },
    { text: "x".repeat(1201), groundingMode: "inference", evidenceRefs: [], inferenceReason: "too long claim" },
    { text: "Long reason", groundingMode: "inference", evidenceRefs: [], inferenceReason: "x".repeat(281) },
  ];

  const first = cases.map((item, index) => validateScanGroundedClaim(item, { allowedEvidenceIds: allowed, path: `claims.${index}` }).issues.map((issue) => issue.code));
  const second = cases.map((item, index) => validateScanGroundedClaim(item, { allowedEvidenceIds: allowed, path: `claims.${index}` }).issues.map((issue) => issue.code));

  assert.deepEqual(first, second);
  assert.ok(first.every((issues) => issues.length > 0));
});

test("accepts contradicting references and summarizes safe aggregate diagnostics", () => {
  const result = validateScanGroundedClaim({
    text: "Some evidence contradicts broad demand.",
    groundingMode: "evidence",
    evidenceRefs: [{ evidenceId: "evidence-002", relevance: "contradicting" }],
  }, { allowedEvidenceIds: allowed, path: "claim" });

  assert.equal(result.issues.length, 0);
  const summary = summarizeScanGrounding(result.claim ? [result.claim] : [], allowed);
  assert.deepEqual(summary, {
    totalClaims: 1,
    evidenceGroundedClaims: 1,
    inferenceClaims: 0,
    unsupportedClaims: 0,
    groundingCoverage: 1,
    distinctEvidenceIdsReferenced: 1,
    contradictingReferenceCount: 1,
    invalidReferenceCount: 0,
  });
});
