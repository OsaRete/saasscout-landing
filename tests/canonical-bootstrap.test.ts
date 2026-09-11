import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { analyzeCanonicalBootstrap } from "../lib/knowledge/canonical-bootstrap/analyzer.ts";
import { readUnresolvedProblemObservations } from "../lib/knowledge/canonical-bootstrap/repository.ts";
import type { UnresolvedProblemObservation } from "../lib/knowledge/canonical-bootstrap/types.ts";

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
    "lib/knowledge/canonical-bootstrap/repository.ts",
    "scripts/canonical-bootstrap-dry-run.ts",
  ].map((path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")));
  const implementation = files.join("\n");
  const databasePath = files.slice(1).join("\n");
  assert.doesNotMatch(databasePath, /\.(?:insert|upsert|update|delete|rpc)\s*\(/);
  assert.doesNotMatch(implementation, /openai|openrouter|embedding|language model/i);
  assert.doesNotMatch(implementation, /--(?:apply|write|commit)/);
});
