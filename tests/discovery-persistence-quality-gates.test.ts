import assert from "node:assert/strict";
import test from "node:test";

import { evaluateDiscoveryPersistenceQuality } from "../lib/intelligence/discovery-persistence-quality-gates.ts";
import type { PlannedDiscoveredProblem } from "../lib/intelligence/discovery-orchestrator-persistence-plan.ts";

function row(overrides: Partial<PlannedDiscoveredProblem> = {}): PlannedDiscoveredProblem {
  return {
    discovery_id: "discovery-1",
    user_id: "user-1",
    problem_title: "Automated client reporting delays",
    problem_summary: "Small agencies waste billable hours manually gathering client updates from disconnected tools before every recurring report.",
    affected_niches: "Small agencies | Client services",
    suggested_solutions: "Automated report assembly | Client update portal",
    pain_score: 8,
    revenue_score: 7,
    urgency_score: 7,
    trend_score: 7,
    buying_signal_score: 7,
    frequency_score: 8,
    source_quality_score: 8,
    opportunity_score: 82,
    problem_cluster: "Client Operations",
    build_difficulty: "Medium",
    source_evidence: "Agency operators describe repeated reporting work across client tools and spreadsheets.",
    ...overrides,
  };
}

test("evaluateDiscoveryPersistenceQuality rejects one-word generic titles", () => {
  const result = evaluateDiscoveryPersistenceQuality([row({ problem_title: "manual" })]);

  assert.equal(result.allRowsPass, false);
  assert.equal(result.rejectedRows.length, 1);
  assert.equal(result.issues.some((issue) => issue.code === "title_generic_keyword"), true);
});

test("evaluateDiscoveryPersistenceQuality rejects summaries that equal the title", () => {
  const result = evaluateDiscoveryPersistenceQuality([
    row({ problem_title: "Billing approval automation", problem_summary: "Billing approval automation" }),
  ]);

  assert.equal(result.allRowsPass, false);
  assert.equal(result.issues.some((issue) => issue.code === "summary_matches_title"), true);
});

test("evaluateDiscoveryPersistenceQuality rejects excessively long source evidence", () => {
  const result = evaluateDiscoveryPersistenceQuality([row({ source_evidence: "Evidence. ".repeat(140) })]);

  assert.equal(result.allRowsPass, false);
  assert.equal(result.issues.some((issue) => issue.code === "source_evidence_too_long"), true);
});

test("evaluateDiscoveryPersistenceQuality rejects rows with all minimum primary scores", () => {
  const result = evaluateDiscoveryPersistenceQuality([
    row({ pain_score: 1, revenue_score: 1, urgency_score: 1 }),
  ]);

  assert.equal(result.allRowsPass, false);
  assert.equal(result.issues.some((issue) => issue.code === "all_primary_scores_minimum"), true);
});

test("evaluateDiscoveryPersistenceQuality accepts a well-formed problem row", () => {
  const result = evaluateDiscoveryPersistenceQuality([row()]);

  assert.equal(result.allRowsPass, true);
  assert.equal(result.acceptedRows.length, 1);
  assert.equal(result.rejectedRows.length, 0);
});

test("evaluateDiscoveryPersistenceQuality leaves fallback behavior available by rejecting unsafe assisted rows", () => {
  const result = evaluateDiscoveryPersistenceQuality([
    row({ problem_title: "Approval" }),
  ], {
    fallbackFieldsByRow: [
      {
        rowIndex: 0,
        fields: ["problem_summary", "affected_niches", "suggested_solutions", "pain_score", "revenue_score", "source_evidence"],
      },
    ],
  });

  assert.equal(result.allRowsPass, false);
  assert.equal(result.acceptedRows.length, 0);
  assert.equal(result.safeDiagnostics.selected, false);
  assert.equal(result.issues.some((issue) => issue.code === "too_many_fallback_fields"), true);
});
