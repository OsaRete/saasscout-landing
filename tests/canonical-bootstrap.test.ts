import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { analyzeCanonicalBootstrap, classifyBootstrapContext } from "../lib/knowledge/canonical-bootstrap/analyzer.ts";
import { auditCrossCandidateIdentities } from "../lib/knowledge/canonical-bootstrap/cross-candidate-identity-audit.ts";
import { auditCauseConsequenceIdentities } from "../lib/knowledge/canonical-bootstrap/cause-consequence-identity-audit.ts";
import { readUnresolvedProblemObservations } from "../lib/knowledge/canonical-bootstrap/repository.ts";
import type { BootstrapCandidateCluster, UnresolvedProblemObservation } from "../lib/knowledge/canonical-bootstrap/types.ts";

function observation(id: string, title: string, overrides: Partial<UnresolvedProblemObservation> = {}): UnresolvedProblemObservation {
  return {
    id,
    canonical_problem_id: null,
    observation_fingerprint: `fingerprint-${id}`,
    problem_title: title,
    normalized_problem_title: title.toLowerCase(),
    problem_summary: null,
    source_table: "discovered_problems",
    source_row_id: `source-${id}`,
    affected_niches: [],
    problem_cluster: null,
    observed_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function candidate(id: string, title: string, overrides: Partial<BootstrapCandidateCluster> = {}): BootstrapCandidateCluster {
  const normalizedTitle = title.toLowerCase();
  return {
    candidateId: id,
    disposition: "high_confidence_cluster",
    candidateCanonicalTitle: title,
    observations: [{ id: `${id}-observation`, title, normalizedTitle, sourceTable: "discovered_problems", sourceRowId: `${id}-source`, affectedNiches: [], problemCluster: "shared problem", observedAt: null }],
    aliasesPreview: [{ text: title, normalizedAlias: normalizedTitle, kind: "original_title" }],
    reasons: ["fixture"],
    baseActivationDisposition: "auto_activatable",
    activationDisposition: "auto_activatable",
    activationBlockReasons: [],
    crossCandidateAuditDisposition: "not_applicable",
    finalActivationDisposition: "auto_activatable",
    causeConsequenceAuditDisposition: "not_applicable",
    postCauseConsequenceActivationDisposition: "auto_activatable",
    causeConsequenceAuditDisposition: "not_applicable",
    postCauseConsequenceActivationDisposition: "auto_activatable",
    trustedAffectedNiches: [],
    ignoredAffectedNiches: [],
    ...overrides,
  };
}

test("clusters exact normalized duplicates and keeps auditable aliases", () => {
  const report = analyzeCanonicalBootstrap([
    observation("b", "Slow Client Onboarding", { normalized_problem_title: "slow client onboarding" }),
    observation("a", "Client onboarding is slow", { normalized_problem_title: "slow client onboarding" }),
  ]);
  assert.equal(report.summary.highConfidenceCandidateClusters, 1);
  assert.equal(report.summary.exactTitleDuplicateGroups, 1);
  assert.deepEqual(report.clusters[0].observations.map((item) => item.id), ["a", "b"]);
  assert.deepEqual(report.clusters[0].aliasesPreview.map((item) => `${item.kind}:${item.normalizedAlias}`), [
    "original_title:client onboarding is slow",
    "normalized_title:slow client onboarding",
    "original_title:slow client onboarding",
  ]);
  assert.equal(report.clusters[0].activationDisposition, "auto_activatable");
  assert.deepEqual(report.clusters[0].activationBlockReasons, []);
  assert.equal(report.summary.autoActivatableClusters, 1);
  assert.equal(report.activationEligibilityRuleVersion, "canonical_activation_eligibility_v1");
});

test("clusters strongly overlapping wording only with corroborating context, including across niches", () => {
  const report = analyzeCanonicalBootstrap([
    observation("a", "Manual invoice approval delays", { problem_summary: "Teams wait for invoice approvals", affected_niches: ["construction"], problem_cluster: "invoice approval" }),
    observation("b", "Invoice approval manual delays", { problem_summary: "Agencies wait for approvals", affected_niches: ["agencies"], problem_cluster: "Invoice Approval" }),
  ]);
  assert.equal(report.clusters[0].disposition, "high_confidence_cluster");
  assert.ok(report.clusters[0].reasons.includes("matching_problem_cluster"));
});

test("preserves same-language conflicting contexts for review", () => {
  const report = analyzeCanonicalBootstrap([
    observation("inventory", "Manual reconciliation delays", { problem_cluster: "inventory reconciliation", affected_niches: ["retail"] }),
    observation("accounting", "Manual reconciliation delays", { problem_cluster: "accounting reconciliation", affected_niches: ["accounting"] }),
  ]);
  assert.equal(report.summary.reviewRequiredClusters, 1);
  assert.equal(report.clusters[0].disposition, "review_required");
  assert.ok(report.clusters[0].reasons.includes("conflicting_problem_cluster"));
});

test("keeps superficial similarity separate and reports a singleton", () => {
  const report = analyzeCanonicalBootstrap([
    observation("inventory", "Inventory forecasting errors", { problem_cluster: "inventory" }),
    observation("accounting", "Accounting reconciliation delays", { problem_cluster: "accounting" }),
  ]);
  assert.equal(report.summary.singletonObservations, 2);
  assert.ok(report.clusters.every((cluster) => cluster.disposition === "singleton"));
});

test("routes partial identity evidence without corroboration to review", () => {
  const report = analyzeCanonicalBootstrap([
    observation("a", "Manual inventory reconciliation delays"),
    observation("b", "Manual inventory reconciliation errors"),
  ]);
  assert.equal(report.summary.reviewRequiredClusters, 1);
  assert.equal(report.summary.observationsInReviewRequiredClusters, 2);
});

test("candidate IDs, title selection and output ordering are independent of input order and scores", () => {
  const fixtures = [
    observation("z", "Invoice approval delays for teams", { normalized_problem_title: "invoice approval delays teams", problem_cluster: "invoice approval" }),
    observation("a", "Teams face invoice approval delays", { normalized_problem_title: "teams face invoice approval delays", problem_cluster: "invoice approval" }),
    observation("singleton", "Warehouse temperature alerts"),
  ];
  const forwards = analyzeCanonicalBootstrap(fixtures);
  const backwards = analyzeCanonicalBootstrap([...fixtures].reverse());
  assert.deepEqual(forwards, backwards);
  assert.equal(JSON.stringify(forwards), JSON.stringify(backwards));
  const high = forwards.clusters.find((cluster) => cluster.disposition === "high_confidence_cluster");
  assert.match(high?.candidateId || "", /^cb1_[a-f0-9]{24}$/);
  assert.ok(fixtures.some((row) => row.problem_title === high?.candidateCanonicalTitle));

  const alteredScores = fixtures.map((row) => ({ ...row, source_quality_score: row.id === "z" ? 10 : 0, opportunity_score: row.id === "a" ? 10 : 0 }));
  assert.deepEqual(analyzeCanonicalBootstrap(alteredScores), forwards);
});

test("uses complete-link high-confidence grouping to prevent transitive false merges", () => {
  const report = analyzeCanonicalBootstrap([
    observation("a", "invoice approval workflow delay", { problem_cluster: "approval" }),
    observation("b", "invoice approval workflow tracking delay", { problem_cluster: "approval" }),
    observation("c", "approval workflow tracking errors", { problem_cluster: "approval" }),
  ]);
  const high = report.clusters.find((cluster) => cluster.disposition === "high_confidence_cluster");
  assert.equal(high?.observations.length, 2);
  assert.equal(report.summary.singletonObservations, 1);
});

test("flags a normalized alias owned by different candidate clusters", () => {
  const report = analyzeCanonicalBootstrap([
    observation("a1", "Shared reconciliation", { problem_cluster: "inventory", normalized_problem_title: "inventory shared reconciliation" }),
    observation("a2", "Inventory shared reconciliation", { problem_cluster: "inventory", normalized_problem_title: "inventory shared reconciliation" }),
    observation("b1", "Shared reconciliation", { problem_cluster: "accounting", normalized_problem_title: "accounting shared reconciliation" }),
    observation("b2", "Accounting shared reconciliation", { problem_cluster: "accounting", normalized_problem_title: "accounting shared reconciliation" }),
  ]);
  assert.equal(report.summary.ambiguousAliasCollisions, 1);
  assert.equal(report.ambiguousAliasCollisions[0].normalizedAlias, "shared reconciliation");
  assert.equal(report.ambiguousAliasCollisions[0].candidateIds.length, 2);
  const affected = report.clusters.filter((cluster) => cluster.activationBlockReasons.includes("ambiguous_alias_collision"));
  assert.equal(affected.length, 2);
  assert.ok(affected.every((cluster) => cluster.activationDisposition === "blocked_for_review"));
  assert.equal(report.summary.blockedByAliasCollision, 2);
});

test("blocks both candidates when a normalized observation identity crosses clusters", () => {
  const report = analyzeCanonicalBootstrap([
    observation("a", "Shared identity", { normalized_problem_title: "shared identity", problem_cluster: "alpha" }),
    observation("b", "The shared identity", { normalized_problem_title: "shared identity", problem_cluster: "alpha" }),
    observation("c", "Shared identity", { normalized_problem_title: "shared identity", problem_cluster: "beta" }),
  ]);
  const affected = report.clusters.filter((cluster) => cluster.activationBlockReasons.includes("duplicate_normalized_identity_across_candidates"));
  assert.equal(affected.length, 2);
  assert.equal(report.normalizedIdentityCollisions[0].normalizedIdentity, "shared identity");
  assert.deepEqual(report.normalizedIdentityCollisions[0].candidateIds, [...report.normalizedIdentityCollisions[0].candidateIds].sort());
});

test("classifies trusted niches and ignores internal or sentence-like context deterministically", () => {
  for (const value of ["agencies", "freelancers", "small businesses", "professional services", "sales teams", "operations teams", "retail", "saas companies", "b2b companies", "independent consultants"]) {
    assert.equal(classifyBootstrapContext(value), "trusted_context", value);
  }
  for (const value of ["data moat", "weekly intelligence", "evidence multiple signals sources 1 5 7 8", "manual workflows lead to errors delays poor visibility", "small businesses and freelancers struggle with manual workflows"]) {
    assert.equal(classifyBootstrapContext(value), "untrusted_internal_or_prose_context", value);
  }
});

test("requires trusted corroboration for near duplicates and reports ignored context", () => {
  const blocked = analyzeCanonicalBootstrap([
    observation("a", "Manual invoice approval delays", { affected_niches: ["weekly intelligence"] }),
    observation("b", "Invoice approval manual delays", { affected_niches: ["weekly intelligence"] }),
  ]).clusters.find((cluster) => cluster.disposition === "high_confidence_cluster");
  assert.equal(blocked?.activationDisposition, "blocked_for_review");
  assert.deepEqual(blocked?.activationBlockReasons, ["insufficient_trusted_context"]);
  assert.deepEqual(blocked?.ignoredAffectedNiches, ["weekly intelligence"]);

  const eligible = analyzeCanonicalBootstrap([
    observation("a", "Manual invoice approval delays", { affected_niches: ["Agencies"], problem_cluster: "invoice approval" }),
    observation("b", "Invoice approval manual delays", { affected_niches: ["agencies"], problem_cluster: "Invoice Approval" }),
  ]).clusters.find((cluster) => cluster.disposition === "high_confidence_cluster");
  assert.equal(eligible?.activationDisposition, "auto_activatable");
  assert.deepEqual(eligible?.trustedAffectedNiches, ["agencies"]);
});

test("review-required clusters and singletons are never auto activatable", () => {
  const review = analyzeCanonicalBootstrap([
    observation("a", "Manual inventory reconciliation delays"),
    observation("b", "Manual inventory reconciliation errors"),
  ]).clusters[0];
  assert.equal(review.disposition, "review_required");
  assert.deepEqual(review.activationBlockReasons, ["non_high_confidence_disposition"]);

  const singleton = analyzeCanonicalBootstrap([observation("only", "Warehouse temperature alerts")]).clusters[0];
  assert.equal(singleton.disposition, "singleton");
  assert.equal(singleton.activationDisposition, "blocked_for_review");
});

test("conflicting problem clusters remain blocked and expose the conflict", () => {
  const cluster = analyzeCanonicalBootstrap([
    observation("a", "Manual reconciliation delays", { problem_cluster: "inventory" }),
    observation("b", "Manual reconciliation delays", { problem_cluster: "accounting" }),
  ]).clusters[0];
  assert.equal(cluster.disposition, "review_required");
  assert.deepEqual(cluster.activationBlockReasons, ["conflicting_problem_cluster", "non_high_confidence_disposition"]);
});

test("multiple activation reasons and collision indexes are stable across input order", () => {
  const fixtures = [
    observation("a1", "Shared workflow", { normalized_problem_title: "alpha shared workflow", affected_niches: ["data moat"] }),
    observation("a2", "Alpha shared workflow", { normalized_problem_title: "alpha shared workflow", affected_niches: ["data moat"] }),
    observation("b1", "Shared workflow", { normalized_problem_title: "beta shared workflow", affected_niches: ["weekly intelligence"] }),
    observation("b2", "Beta shared workflow", { normalized_problem_title: "beta shared workflow", affected_niches: ["weekly intelligence"] }),
  ];
  const forwards = analyzeCanonicalBootstrap(fixtures);
  const backwards = analyzeCanonicalBootstrap([...fixtures].reverse());
  assert.deepEqual(forwards, backwards);
  const reasons = forwards.clusters[0].activationBlockReasons;
  assert.deepEqual(reasons, [...reasons].sort());
  assert.ok(reasons.length >= 2);
});

test("activation calibration leaves V8-B0.1 candidate IDs unchanged", () => {
  const rows = [observation("b", "Slow Client Onboarding"), observation("a", "Slow Client Onboarding")];
  // Fixed regression value produced by canonical_bootstrap_v1 over the original member contract.
  assert.equal(analyzeCanonicalBootstrap(rows).clusters[0].candidateId, "cb1_0c84941f2664359785641e8c");
});

test("cross-candidate audit flags adjective and noun near-identity wording", () => {
  const { audit } = auditCrossCandidateIdentities([
    candidate("a", "Spreadsheet-Based Workflow Management Inefficiencies"),
    candidate("b", "Inefficient Spreadsheet-Based Workflow Management"),
  ]);
  assert.equal(audit.potentialCollisionPairs.length, 1);
  assert.ok(audit.potentialCollisionPairs[0].reasons.includes("normalized_token_near_identity"));
  assert.deepEqual(audit.blockedAutoActivatableCandidateIds, ["a", "b"]);
});

test("cross-candidate audit flags a base identity plus bounded consequence", () => {
  const { audit } = auditCrossCandidateIdentities([
    candidate("a", "Manual Sales Process Automation Gaps"),
    candidate("b", "Manual Sales Process Automation Gaps Leading to Missed Leads and Revenue Loss"),
  ]);
  assert.ok(audit.potentialCollisionPairs[0].reasons.includes("title_containment_with_modifier"));
});

test("cross-candidate audit flags a segment-qualified variant only with context corroboration", () => {
  const base = candidate("a", "Fragmented Toolsets Causing Operational Inefficiencies", { trustedAffectedNiches: ["freelancers"] });
  const qualified = candidate("b", "Fragmented Toolsets Causing Operational Inefficiencies for Freelancers", { trustedAffectedNiches: ["freelancers"] });
  const { audit } = auditCrossCandidateIdentities([base, qualified]);
  assert.ok(audit.potentialCollisionPairs[0].reasons.includes("segment_qualified_variant"));
  assert.ok(audit.potentialCollisionPairs[0].reasons.includes("trusted_niche_corroboration"));
});

test("cross-candidate audit ignores unrelated operational problems and generic-token overlap", () => {
  const { audit } = auditCrossCandidateIdentities([
    candidate("a", "Invoice Approval Bottlenecks"),
    candidate("b", "Disconnected CRM Workflow Operations"),
    candidate("c", "Manual Workflow Automation Operations for Scheduling"),
    candidate("d", "Manual Workflow Automation Operations for Accounting"),
  ]);
  assert.equal(audit.potentialCollisionPairs.length, 0);
  assert.deepEqual(audit.clearlyUniqueAutoActivatableCandidateIds, ["a", "b", "c", "d"]);
});

test("an auto candidate matching a blocked candidate becomes finally blocked without losing base disposition", () => {
  const blocked = candidate("blocked", "Spreadsheet Workflow Management Inefficiency", {
    baseActivationDisposition: "blocked_for_review", activationDisposition: "blocked_for_review", activationBlockReasons: ["ambiguous_alias_collision"], finalActivationDisposition: "blocked_for_review",
  });
  const { audit, clusters } = auditCrossCandidateIdentities([candidate("auto", "Inefficient Spreadsheet Workflow Management"), blocked]);
  const auto = clusters.find((item) => item.candidateId === "auto");
  assert.equal(auto?.activationDisposition, "auto_activatable");
  assert.equal(auto?.baseActivationDisposition, "auto_activatable");
  assert.equal(auto?.crossCandidateAuditDisposition, "potential_canonical_collision");
  assert.equal(auto?.finalActivationDisposition, "blocked_for_review");
  assert.deepEqual(audit.autoCandidatesMatchingBlockedCandidateIds, ["auto"]);
  assert.ok(audit.potentialCollisionPairs[0].reasons.includes("auto_candidate_matches_blocked_candidate"));
});

test("cross-candidate collision groups are deterministic connected review components", () => {
  const fixtures = [
    candidate("a", "Manual Sales Process Automation Gaps"),
    candidate("b", "Manual Sales Process Automation Gaps Leading to Missed Leads"),
    candidate("c", "Manual Sales Process Automation Gaps Leading to Missed Leads and Revenue Loss"),
  ];
  const forwards = auditCrossCandidateIdentities(fixtures).audit;
  const backwards = auditCrossCandidateIdentities([...fixtures].reverse()).audit;
  assert.deepEqual(forwards.potentialCollisionGroups, [["a", "b", "c"]]);
  assert.equal(JSON.stringify(forwards), JSON.stringify(backwards));
  assert.equal(JSON.stringify(forwards), JSON.stringify(auditCrossCandidateIdentities(fixtures).audit));
});

test("cross-candidate audit does not alter pre-audit clustering membership or base activation", () => {
  const report = analyzeCanonicalBootstrap([
    observation("a1", "Spreadsheet workflow management inefficiencies", { problem_cluster: "alpha" }),
    observation("a2", "Spreadsheet workflow management inefficiencies", { problem_cluster: "alpha" }),
    observation("b1", "Inefficient spreadsheet workflow management", { problem_cluster: "beta" }),
    observation("b2", "Inefficient spreadsheet workflow management", { problem_cluster: "beta" }),
  ]);
  assert.equal(report.summary.highConfidenceCandidateClusters, 2);
  assert.ok(report.clusters.every((cluster) => cluster.disposition === "high_confidence_cluster"));
  assert.ok(report.clusters.every((cluster) => cluster.activationDisposition === "auto_activatable"));
  assert.ok(report.clusters.every((cluster) => cluster.finalActivationDisposition === "blocked_for_review"));
  assert.equal(report.crossCandidateIdentityAudit.potentialCollisionPairs.length, 1);
});

test("cause-consequence audit blocks reversed causal identity while preserving B0.1.2 fields", () => {
  const auto = candidate("auto", "Missed Leads and Revenue Loss Due to Manual Sales Processes", { crossCandidateAuditDisposition: "clearly_unique" });
  const blocked = candidate("blocked", "Manual Sales Process Automation Gaps Leading to Missed Leads and Revenue Loss", {
    baseActivationDisposition: "blocked_for_review", activationDisposition: "blocked_for_review", finalActivationDisposition: "blocked_for_review", activationBlockReasons: ["ambiguous_alias_collision"],
  });
  const { audit, clusters } = auditCauseConsequenceIdentities([auto, blocked]);
  assert.equal(audit.ruleVersion, "cause_consequence_identity_audit_v1");
  assert.deepEqual(audit.blockedInitiallyAutoCandidateIds, ["auto"]);
  assert.deepEqual(audit.potentialCollisionPairs[0].causeSideOverlap, ["manual", "process", "sales"]);
  assert.deepEqual(audit.potentialCollisionPairs[0].consequenceSideOverlap, ["lead", "loss", "missed", "revenue"]);
  assert.ok(audit.potentialCollisionPairs[0].reasons.includes("cause_consequence_reversal"));
  const result = clusters.find((item) => item.candidateId === "auto");
  assert.equal(result?.finalActivationDisposition, "auto_activatable");
  assert.equal(result?.causeConsequenceAuditDisposition, "potential_cause_consequence_collision");
  assert.equal(result?.postCauseConsequenceActivationDisposition, "blocked_for_review");
  assert.equal(clusters.find((item) => item.candidateId === "blocked")?.postCauseConsequenceActivationDisposition, "blocked_for_review");
});

test("cause-consequence audit ignores containment, generic overlap, and unrelated examples", () => {
  const fixtures = [candidate("containment-a", "Manual Sales Process Automation Gaps"), candidate("containment-b", "Manual Sales Process Automation Gaps Leading to Missed Leads"),
    candidate("invoice", "Invoice Approval Bottlenecks"), candidate("crm", "Disconnected CRM Workflow Operations"), candidate("operations", "Operational Workflow Fragmentation"),
    candidate("tasks", "Excessive Manual Repetitive Tasks Consuming Business Hours")];
  const audit = auditCauseConsequenceIdentities(fixtures).audit;
  assert.equal(audit.potentialCollisionPairs.length, 0);
  assert.deepEqual(audit.clearlyUniqueAutoCandidateIds, fixtures.map((item) => item.candidateId).sort());
});

test("cause-consequence audit detects reordered sides and is input-order deterministic", () => {
  const fixtures = [candidate("a", "Lost Revenue and Missed Leads Due to Manual Sales Workflows"), candidate("b", "Sales Workflow Automation Gaps Causing Leads Missed and Revenue Lost")];
  const forwards = auditCauseConsequenceIdentities(fixtures);
  assert.equal(forwards.audit.potentialCollisionPairs.length, 1);
  assert.deepEqual(forwards, auditCauseConsequenceIdentities([...fixtures].reverse()));
  assert.deepEqual(forwards, auditCauseConsequenceIdentities(fixtures));
});

test("rejects canonicalized input rather than silently expanding scope", () => {
  assert.throws(() => analyzeCanonicalBootstrap([observation("a", "A problem", { canonical_problem_id: "existing" as never })]), /already canonicalized/);
});

test("repository paginates a SELECT-only fixture adapter", async () => {
  const pages: number[] = [];
  const rows = await readUnresolvedProblemObservations(async (start) => {
    pages.push(start);
    return start === 0 ? Array.from({ length: 1000 }, (_, index) => observation(String(index), `Problem ${index}`)) : [observation("last", "Last problem")];
  });
  assert.equal(rows.length, 1001);
  assert.deepEqual(pages, [0, 1000]);
});

test("bootstrap implementation exposes neither mutation nor model invocation paths", async () => {
  const files = await Promise.all([
    "lib/knowledge/canonical-bootstrap/analyzer.ts",
    "lib/knowledge/canonical-bootstrap/cross-candidate-identity-audit.ts",
    "lib/knowledge/canonical-bootstrap/cause-consequence-identity-audit.ts",
    "lib/knowledge/canonical-bootstrap/repository.ts",
    "scripts/canonical-bootstrap-dry-run.ts",
  ].map((path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")));
  const implementation = files.join("\n");
  const databasePath = files.slice(1).join("\n");
  assert.doesNotMatch(databasePath, /\.(?:insert|upsert|update|delete|rpc)\s*\(/);
  assert.doesNotMatch(implementation, /openai|openrouter|embedding|language model/i);
  assert.doesNotMatch(implementation, /--(?:apply|write|commit)/);
});
