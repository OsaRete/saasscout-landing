import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateValidationPromotionEligibility, resolveValidationCanonicalProblem, selectValidationRepresentatives, surveyProjectionRequired, VALIDATION_CANONICAL_RESOLVER_VERSION, VALIDATION_PROMOTION_POLICY_VERSION, type EligibilityInput, type RepresentativeCandidate } from "../lib/validation/promotion/index.ts";

const base = (polarity: EligibilityInput["classifications"][number]["polarity"] = "supporting"): EligibilityInput => ({ observationId: "o1", origin: "human_interview", modality: "interview_observation", sourceType: "customer_interview", content: { content: "We manually reconcile invoices every Friday." }, participantId: "participant-private-1", participantIndependenceKey: null, participantStatus: "active", interviewSessionId: "session-1", interviewSessionStatus: "completed", participantRelevance: "target_segment_match", experimentFamily: "customer_interview", experimentLifecycle: "completed", lineageValid: true, classifications: [{ id: "c1", observationId: "o1", polarity, source: "user_supplied", authorityStatus: "authoritative", supersedesClassificationId: null }] });

test("eligible interview evidence treats supporting, contradicting, and mixed equally", () => {
  for (const polarity of ["supporting", "contradicting", "mixed"] as const) assert.deepEqual(evaluateValidationPromotionEligibility(base(polarity)).reasons, ["eligible"]);
});
test("non-promotable and missing classifications defer", () => {
  for (const polarity of ["neutral", "inconclusive"] as const) assert.ok(evaluateValidationPromotionEligibility(base(polarity)).reasons.includes("classification_not_promotable"));
  assert.ok(evaluateValidationPromotionEligibility({ ...base(), classifications: [] }).reasons.includes("missing_authoritative_classification"));
});
test("AI suggestions, notes, blank content, broken lineage and missing identity cannot qualify", () => {
  const ai = base(); ai.classifications[0] = { ...ai.classifications[0], source: "ai_model_suggested", authorityStatus: "suggested" };
  assert.ok(evaluateValidationPromotionEligibility(ai).reasons.includes("missing_authoritative_classification"));
  for (const changed of [{ sourceType: "private_interview_notes" }, { content: { content: "  " } }, { lineageValid: false }, { participantId: null }]) assert.equal(evaluateValidationPromotionEligibility({ ...base(), ...changed }).eligible, false);
});
test("supersession chain, not timestamps, identifies one terminal authoritative classification", () => {
  const input = base(); input.classifications.push({ ...input.classifications[0], id: "c2", polarity: "contradicting", supersedesClassificationId: "c1" });
  assert.equal(evaluateValidationPromotionEligibility(input).classification, "contradicting");
  input.classifications.push({ ...input.classifications[0], id: "branch", polarity: "mixed", supersedesClassificationId: null });
  assert.ok(evaluateValidationPromotionEligibility(input).reasons.includes("ambiguous_authoritative_classification"));
});
test("participant identity is private and stable while survey answers share submission identity", () => {
  const a = evaluateValidationPromotionEligibility(base()); const b = evaluateValidationPromotionEligibility({ ...base(), observationId: "o2" });
  assert.deepEqual(a.independenceUnit, b.independenceUnit);
  assert.notDeepEqual(a.independenceUnit, evaluateValidationPromotionEligibility({ ...base(), participantId: "participant-private-2" }).independenceUnit);
  const s1 = surveyProjectionRequired("answer-1", "submission-1"); const s2 = surveyProjectionRequired("answer-2", "submission-1");
  assert.deepEqual(s1.independenceUnit, s2.independenceUnit); assert.deepEqual(s1.reasons, ["survey_projection_required"]);
  assert.equal("sharedIdentityToken" in a, false);
});

const candidate = (id: string, polarity: RepresentativeCandidate["polarity"] = "supporting", specificity: RepresentativeCandidate["specificity"] = "structured_opinion"): RepresentativeCandidate => ({ observationId: id, independenceUnit: { kind: "participant", privateId: "p1" }, canonicalProblemId: "canonical-1", polarity, specificity, targetRelevance: "established", statementKind: "summary", contentLength: 20, observedAt: "2026-01-01T00:00:00Z" });
test("representative selection is grouped, polarity-safe, deterministic, and stable-ID tied", () => {
  const values = [candidate("b"), candidate("a"), candidate("commercial", "supporting", "commercial_behavior"), candidate("against", "contradicting")];
  const forward = selectValidationRepresentatives(values); const reverse = selectValidationRepresentatives([...values].reverse());
  assert.deepEqual(forward, reverse); assert.equal(forward.length, 2); assert.equal(forward.find((x) => x.groupKey.endsWith("supporting"))?.representativeObservationId, "commercial");
  assert.equal(selectValidationRepresentatives([candidate("b"), candidate("a")])[0].representativeObservationId, "a");
  assert.equal("score" in forward[0], false); assert.equal("confidence" in forward[0], false);
});
test("canonical resolution only uses provenance or explicit problem identity", () => {
  const registry = [{ id: "cp1", canonicalTitle: "Invoice Approval Bottlenecks", normalizedTitle: "invoice approval bottlenecks", status: "active", aliases: [{ normalizedAlias: "slow invoice approvals" }] }];
  assert.equal(resolveValidationCanonicalProblem({ subjectLabel: " INVOICE approval—bottlenecks " }, registry).canonicalProblemId, "cp1");
  assert.equal(resolveValidationCanonicalProblem({ subjectLabel: "Slow invoice approvals" }, registry).reason, "exact_normalized_alias");
  assert.equal(resolveValidationCanonicalProblem({ subjectLabel: "Different problem" }, registry).status, "unmatched");
  assert.equal(resolveValidationCanonicalProblem({ respondentProse: "invoice approval bottlenecks" }, registry).status, "insufficient_identity");
  assert.equal(resolveValidationCanonicalProblem({ provenanceCanonicalProblemId: "cp1", subjectLabel: "other" }, registry).identitySource, "provenance");
  assert.equal(resolveValidationCanonicalProblem({ subjectLabel: "Same" }, [...registry, { ...registry[0], id: "cp2", canonicalTitle: "Same", normalizedTitle: "same" }, { ...registry[0], id: "cp3", canonicalTitle: "Same", normalizedTitle: "same" }]).status, "ambiguous");
});
test("versions are explicit and outputs structurally deterministic", () => { assert.equal(VALIDATION_PROMOTION_POLICY_VERSION, "v8-b1.1"); assert.equal(VALIDATION_CANONICAL_RESOLVER_VERSION, "v8-b1-exact.1"); assert.deepEqual(evaluateValidationPromotionEligibility(base()), evaluateValidationPromotionEligibility(base())); });
test("ledger is private, append-only, constrained, and contains no Data Moat mutation", () => {
  const sql = readFileSync("supabase/migrations/20260913000000_validation_evidence_promotion_foundation.sql", "utf8");
  assert.match(sql, /enable row level security/i); assert.match(sql, /revoke all[^;]+authenticated/i); assert.doesNotMatch(sql, /grant select[^;]+authenticated/i); assert.match(sql, /append_only/i);
  assert.match(sql, /\(owner_id, observation_id, classification_id, policy_version\) nulls not distinct/i); assert.match(sql, /supersedes_promotion_id/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.(problem_observations|canonical_problems|problem_aliases|problem_intelligence)/i);
  assert.doesNotMatch(sql, /update\s+public\.(problem_observations|canonical_problems|problem_aliases|problem_intelligence)/i);
});
test("supersession is a linear same-observation and same-policy chain", () => {
  const sql = readFileSync("supabase/migrations/20260913000000_validation_evidence_promotion_foundation.sql", "utf8");
  assert.match(sql, /unique \(id, owner_id, observation_id, policy_version\)/i);
  assert.match(sql, /foreign key \(supersedes_promotion_id, owner_id, observation_id, policy_version\)\s+references public\.validation_evidence_promotions\(id, owner_id, observation_id, policy_version\)/i);
  assert.match(sql, /unique index validation_promotions_one_successor_uidx[^;]+\(owner_id, supersedes_promotion_id\)[^;]+is not null/i);
  assert.match(sql, /unique index validation_promotions_one_chain_root_uidx[^;]+\(owner_id, observation_id, policy_version\)[^;]+supersedes_promotion_id is null/i);
  assert.match(sql, /supersedes_promotion_id is null or supersedes_promotion_id <> id/i);
});
test("persisted ledger is interview-only and rejects impossible promotion states", () => {
  const sql = readFileSync("supabase/migrations/20260913000000_validation_evidence_promotion_foundation.sql", "utf8");
  assert.match(sql, /independence_kind text not null check \(independence_kind = 'participant'\)/i);
  assert.doesNotMatch(sql, /independence_kind[^\n]+survey_submission/i);
  assert.match(sql, /not eligible or \(classification_id is not null and polarity in \('supporting','contradicting','mixed'\)\)/i);
  assert.match(sql, /not representative_selected or \(\s*eligible and representative_group_key is not null and\s*resolution_status = 'resolved' and canonical_problem_id is not null/i);
  assert.match(sql, /problem_observation_id is null or \(\s*eligible and representative_selected and\s*resolution_status = 'resolved' and canonical_problem_id is not null/i);
  assert.match(sql, /\(resolution_status = 'resolved'\) = \(canonical_problem_id is not null\)/i);
});
test("promotion implementation has no model, embedding, API, or Data Moat persistence dependency", () => {
  const files = ["eligibility.ts", "canonical-resolution.ts", "representative-selection.ts"].map((name) => readFileSync(`lib/validation/promotion/${name}`, "utf8")).join("\n");
  assert.doesNotMatch(files, /openrouter|embedding|fetch\(|openai|\.from\(|\.insert\(|\.update\(/i);
});
