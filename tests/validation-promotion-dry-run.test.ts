import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { adaptPersistedPromotionRows } from "../lib/validation/promotion/preparation.ts";
import { assertPromotionReportReconciles, buildValidationPromotionDryRunReport } from "../lib/validation/promotion/report.ts";
import type { PersistedPromotionRows } from "../lib/validation/promotion/read-repository.ts";

function fixture(): PersistedPromotionRows {
  return {
    observations: [{ id: "o1", owner_id: "owner", subject_id: "subject", hypothesis_id: "hypothesis", hypothesis_version_id: "hv", experiment_id: "experiment", experiment_version_id: "ev", participant_id: "p1", interview_session_id: "session", origin: "human_interview", modality: "interview_observation", source_type: "customer_interview", observed_at: "2026-01-02T00:00:00Z", observation_content: { statement: "Past behavior", statement_kind: "direct_quote", specificity: "reported_past_behavior" }, participant_independence_key: "private-key" }],
    classifications: [{ id: "c1", owner_id: "owner", observation_id: "o1", polarity: "supporting", classification_source: "user_supplied", authority_status: "authoritative", supersedes_classification_id: null }],
    subjects: [{ id: "subject", owner_id: "owner", label: "Invoice bottleneck", context_snapshot: {} }],
    hypotheses: [{ id: "hv", owner_id: "owner", subject_id: "subject", hypothesis_id: "hypothesis", problem_claim: "Unused fallback" }],
    experiments: [{ id: "ev", owner_id: "owner", subject_id: "subject", experiment_id: "experiment", hypothesis_id: "hypothesis", hypothesis_version_id: "hv", family: "customer_interview", lifecycle: "completed" }],
    participants: [{ id: "p1", owner_id: "owner", status: "active" }],
    sessions: [{ id: "session", owner_id: "owner", subject_id: "subject", experiment_id: "experiment", experiment_version_id: "ev", hypothesis_id: "hypothesis", hypothesis_version_id: "hv", participant_id: "p1", status: "completed", participant_relevance: "target_segment_match" }],
    canonicalProblems: [{ id: "cp1", canonical_title: "Invoice Approval Bottlenecks", normalized_title: "invoice approval bottlenecks", status: "active" }],
    aliases: [{ canonical_problem_id: "cp1", normalized_alias: "invoice bottleneck" }],
  };
}
const copyObservation = (rows: PersistedPromotionRows, id: string, participant = "p1") => ({ ...rows.observations[0], id, participant_id: participant });
const copyClassification = (id: string, observationId: string, polarity = "supporting") => ({ id, owner_id: "owner", observation_id: observationId, polarity, classification_source: "user_supplied", authority_status: "authoritative", supersedes_classification_id: null });

test("real-row adapter preserves exact lineage and ignores independence key as participant identity", () => {
  const item = adaptPersistedPromotionRows(fixture())[0];
  assert.equal(item.input.lineageValid, true); assert.equal(item.input.participantId, "p1"); assert.equal(item.input.experimentFamily, "customer_interview"); assert.equal(item.identity.subjectLabel, "Invoice bottleneck");
});

test("subject context canonical-looking IDs remain readable but cannot establish authority", () => {
  for (const key of ["canonical_problem_id", "canonicalProblemId"] as const) {
    const rows = fixture(); const context = { benign: { retained: true }, [key]: "cp1" }; rows.subjects[0].context_snapshot = context; rows.subjects[0].label = "No exact canonical identity"; rows.hypotheses[0].problem_claim = "Also unmatched"; const before = structuredClone(context);
    const prepared = adaptPersistedPromotionRows(rows); const report = buildValidationPromotionDryRunReport(rows);
    assert.equal("provenanceCanonicalProblemId" in prepared[0].identity, false); assert.equal(report.summary.canonicalUnmatched, 1); assert.equal(report.representativeCandidates.length, 0); assert.deepEqual(rows.subjects[0].context_snapshot, before);
  }
});

test("active, inactive, and random UUID-shaped context values never affect B2 resolution", () => {
  for (const value of ["cp1", "inactive-id", "550e8400-e29b-41d4-a716-446655440000"]) {
    const rows = fixture(); rows.canonicalProblems.push({ id: "inactive-id", canonical_title: "Inactive", normalized_title: "inactive", status: "inactive" }); rows.subjects[0] = { ...rows.subjects[0], label: "Unmatched identity", context_snapshot: { canonical_problem_id: value } }; rows.hypotheses[0].problem_claim = "Unmatched hypothesis";
    const report = buildValidationPromotionDryRunReport(rows); assert.equal(report.summary.canonicalUnmatched, 1); assert.equal(report.representativeCandidates.length, 0);
  }
});

test("B2 exposes the repaired shared resolver contract", () => {
  const report = buildValidationPromotionDryRunReport(fixture()); assert.equal(report.resolverVersion, "v8-b3.0.2-exact.1"); assert.equal(report.policyVersion, "v8-b1.2"); assert.equal(report.representativeCandidates[0].canonicalResolutionReason, "exact_normalized_alias");
});

test("classification policy defers missing, ambiguous, AI-only, neutral, and inconclusive", () => {
  for (const variant of ["missing", "ambiguous", "ai", "neutral", "inconclusive"] as const) {
    const rows = fixture();
    if (variant === "missing") rows.classifications = [];
    if (variant === "ambiguous") rows.classifications.push(copyClassification("c2", "o1", "mixed"));
    if (variant === "ai") rows.classifications = [{ ...rows.classifications[0], classification_source: "ai_model_suggested", authority_status: "suggested" }];
    if (variant === "neutral" || variant === "inconclusive") rows.classifications[0].polarity = variant;
    assert.equal(buildValidationPromotionDryRunReport(rows).summary.eligibleObservations, 0, variant);
  }
});

test("supporting, contradicting, and mixed are equally eligible and polarity-separated", () => {
  const rows = fixture();
  rows.observations.push(copyObservation(rows, "o2"), copyObservation(rows, "o3"));
  rows.classifications.push(copyClassification("c2", "o2", "contradicting"), copyClassification("c3", "o3", "mixed"));
  const report = buildValidationPromotionDryRunReport(rows);
  assert.equal(report.summary.eligibleObservations, 3); assert.equal(report.summary.independenceGroups, 3); assert.equal(report.summary.supportingEligible, 1); assert.equal(report.summary.contradictingEligible, 1); assert.equal(report.summary.mixedEligible, 1);
});

test("same participant/canonical/polarity selects one; different participants remain independent", () => {
  const rows = fixture(); rows.observations.push(copyObservation(rows, "o2")); rows.classifications.push(copyClassification("c2", "o2"));
  let report = buildValidationPromotionDryRunReport(rows); assert.equal(report.summary.representativesSelected, 1); assert.equal(report.summary.nonRepresentativeEligibleObservations, 1);
  rows.observations.push(copyObservation(rows, "o3", "p2")); rows.classifications.push(copyClassification("c3", "o3")); rows.participants.push({ id: "p2", owner_id: "owner", status: "active" }); rows.sessions.push({ ...rows.sessions[0], id: "session2", participant_id: "p2" }); rows.observations[2].interview_session_id = "session2";
  report = buildValidationPromotionDryRunReport(rows); assert.equal(report.summary.representativesSelected, 2);
});

test("exact title/alias resolve while unmatched, ambiguous, prose-only, and surveys defer", () => {
  const title = fixture(); title.subjects[0].label = "Invoice Approval Bottlenecks"; assert.equal(buildValidationPromotionDryRunReport(title).summary.canonicalResolved, 1);
  const alias = fixture(); assert.equal(buildValidationPromotionDryRunReport(alias).representativeCandidates[0].canonicalResolutionReason, "exact_normalized_alias");
  const unmatched = fixture(); unmatched.subjects[0].label = "Other"; unmatched.observations[0].observation_content = { statement: "Invoice Approval Bottlenecks" }; assert.equal(buildValidationPromotionDryRunReport(unmatched).summary.canonicalUnmatched, 1);
  const ambiguous = fixture(); ambiguous.canonicalProblems.push({ ...ambiguous.canonicalProblems[0], id: "cp2" }); ambiguous.aliases.push({ canonical_problem_id: "cp2", normalized_alias: "invoice bottleneck" }); assert.equal(buildValidationPromotionDryRunReport(ambiguous).summary.canonicalAmbiguous, 1);
  const prose = fixture(); prose.subjects[0].label = ""; prose.hypotheses[0].problem_claim = ""; assert.equal(buildValidationPromotionDryRunReport(prose).summary.canonicalInsufficientIdentity, 1);
  const survey = fixture(); survey.observations[0].origin = "survey_response"; survey.observations[0].modality = "survey_answer"; assert.equal(buildValidationPromotionDryRunReport(survey).eligibilityReasonCounts.survey_projection_required, 1);
});

test("report and semantic snapshot hash are deterministic across retrieval order and generatedAt", () => {
  const rows = fixture(); rows.observations.push(copyObservation(rows, "o2")); rows.classifications.push(copyClassification("c2", "o2"));
  const a = buildValidationPromotionDryRunReport(rows, "2026-01-01T00:00:00Z");
  const reversed = Object.fromEntries(Object.entries(rows).map(([key, values]) => [key, [...values].reverse()])) as PersistedPromotionRows;
  const b = buildValidationPromotionDryRunReport(reversed, "2027-01-01T00:00:00Z");
  assert.equal(a.promotionPreparationSnapshotHash, b.promotionPreparationSnapshotHash); assert.deepEqual({ ...a, generatedAt: "x" }, { ...b, generatedAt: "x" });
  rows.classifications[0].polarity = "mixed"; assert.notEqual(buildValidationPromotionDryRunReport(rows).promotionPreparationSnapshotHash, a.promotionPreparationSnapshotHash);
});

test("reconciliation violations fail closed", () => {
  assert.throws(() => assertPromotionReportReconciles({ summary: { observationsEvaluated: 2, eligibleObservations: 1, deferredObservations: 0, canonicalResolvedEligible: 1, canonicalDeferredEligible: 0, representativesSelected: 1, nonRepresentativeEligibleObservations: 0, independenceGroups: 1 }, representativeCandidates: [{ observationId: "o", canonicalProblemId: "cp", polarity: "supporting", groupReference: "g" }], deferred: [] }), /promotion_reconciliation/);
});

test("B2 path is private, SELECT-only, and has no model, embedding, external evidence, or Data Moat write path", () => {
  const paths = ["lib/validation/promotion/read-repository.ts", "lib/validation/promotion/preparation.ts", "lib/validation/promotion/report.ts", "scripts/validation-promotion-dry-run.ts"];
  const source = paths.map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(source, /\.insert\(|\.upsert\(|\.delete\(|\brpc\(|\bfetch\(|openrouter|openai|embedding|generateText|generateObject/i);
  assert.doesNotMatch(source, /\b(?:db|query|client)\s*\.\s*update\(/i);
  assert.doesNotMatch(source, /insert\s+into|update\s+(?:public\.)?(?:problem_observations|canonical_problems|problem_aliases|problem_intelligence|validation_evidence_promotions)/i);
  assert.match(source, /\.select\(/); assert.match(source, /server-only/);
  const status = readFileSync("lib/validation/promotion/read-repository.ts", "utf8"); assert.doesNotMatch(status, /participant.*(?:name|email)|notes|survey_token|raw_answer/i);
  assert.equal(paths.some((path) => path.startsWith("app/") || path.startsWith("pages/")), false);
});
