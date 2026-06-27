import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDiscoveryPersistencePlan,
  isPlannedDiscoveredProblem,
  validateDiscoveryPersistencePlanRows,
} from "../lib/intelligence/discovery-orchestrator-persistence-plan.ts";
import type { DiscoveryModularPipelineResult } from "../lib/intelligence/types.ts";

function createResult(overrides: Partial<DiscoveryModularPipelineResult> = {}) {
  return {
    runId: "planner-run",
    dryRun: true,
    diagnostics: [],
    outputs: {
      painDetection: {
        candidates: [
          {
            id: "pain-1",
            title: "Manual client reporting",
            normalizedTitle: "manual client reporting",
            context: { market: "Agency services", audience: "Small agencies", nicheCategory: "Client Operations" },
            evidence: [
              {
                claim: "Agencies still copy weekly updates into spreadsheets.",
                sourceName: "Google Search",
                sourceUrl: "https://example.com/reporting",
              },
            ],
            score: { totalScore: 82, frequencyScore: 8, evidenceScore: 9 },
          },
        ],
      },
      patternDetection: {
        candidates: [
          {
            id: "pattern-1",
            title: "Agency reporting workflow",
            normalizedTitle: "agency reporting workflow",
            context: { niches: ["Agencies"], primaryTheme: "Client Operations" },
            score: { frequencyScore: 7 },
          },
        ],
      },
      trendDetection: {
        candidates: [
          {
            id: "trend-1",
            title: "Rising reporting automation demand",
            normalizedTitle: "rising reporting automation demand",
            score: { totalScore: 76 },
          },
        ],
      },
      opportunityDetection: {
        candidates: [
          {
            id: "opp-1",
            title: "Automated client reporting for agencies",
            normalizedTitle: "automated client reporting for agencies",
            context: {
              market: "Agency services",
              audience: "Small agencies",
              nicheCategory: "Client Operations",
              primaryTheme: "Client Operations",
              painCandidateIds: ["pain-1"],
              patternCandidateIds: ["pattern-1"],
              trendCandidateIds: ["trend-1"],
            },
            marketContext: {
              primaryProblem: "Small agencies waste time assembling client reports from scattered tools.",
              underservedSignals: ["Automated report assembly"],
              existingSolutionSignals: ["Dashboard connectors"],
            },
            evidence: [
              {
                claim: "Repeated reporting friction appears in live sources.",
                sourceName: "X",
                sourceUrl: "https://x.com/i/web/status/1",
              },
            ],
            score: {
              totalScore: 84,
              problemUrgencyScore: 80,
              marketPullScore: 78,
              buildSimplicityScore: 8,
              evidenceScore: 86,
            },
          },
        ],
      },
      monetizationEvaluation: {
        candidates: [
          {
            id: "money-1",
            title: "Automated client reporting for agencies",
            normalizedTitle: "automated client reporting for agencies",
            context: { opportunityCandidateIds: ["opp-1"] },
            evidence: [],
            score: { totalScore: 79, willingnessToPayScore: 81 },
          },
        ],
      },
      confidenceEvaluation: {
        candidates: [
          {
            id: "confidence-1",
            title: "Automated client reporting for agencies",
            normalizedTitle: "automated client reporting for agencies",
            context: { opportunityCandidateIds: ["opp-1"] },
            score: { evidenceQualityScore: 88 },
          },
        ],
      },
      semanticProblemDeduplication: {
        groups: [
          {
            canonical: { title: "Client reporting automation" },
            candidates: [{ opportunityCandidateIds: ["opp-1"], painCandidateIds: ["pain-1"] }],
          },
        ],
        summary: { groupCount: 1 },
      },
    },
    warnings: [],
    completedAt: "2026-06-27T00:00:00.000Z",
    ...overrides,
  } as unknown as DiscoveryModularPipelineResult;
}

test("buildDiscoveryPersistencePlan maps orchestrator dry-run candidates to discovered_problems-compatible rows", () => {
  const plan = buildDiscoveryPersistencePlan(createResult(), {
    discoveryId: "discovery-1",
    userId: "user-1",
  });

  assert.equal(plan.dryRun, true);
  assert.equal(plan.rows.length, 1);
  assert.deepEqual(Object.keys(plan.rows[0]), [
    "discovery_id",
    "user_id",
    "problem_title",
    "problem_summary",
    "affected_niches",
    "suggested_solutions",
    "pain_score",
    "revenue_score",
    "urgency_score",
    "trend_score",
    "buying_signal_score",
    "frequency_score",
    "source_quality_score",
    "opportunity_score",
    "problem_cluster",
    "build_difficulty",
    "source_evidence",
  ]);
  assert.equal(plan.rows[0].discovery_id, "discovery-1");
  assert.equal(plan.rows[0].user_id, "user-1");
  assert.equal(plan.rows[0].problem_title, "Automated client reporting for agencies");
  assert.equal(plan.rows[0].opportunity_score, 84);
  assert.equal(plan.rows[0].build_difficulty, "Easy");
  assert.equal(isPlannedDiscoveredProblem(plan.rows[0]), true);
  assert.equal(plan.diagnostics.source_candidate_counts.opportunity, 1);
  assert.equal(plan.diagnostics.field_sources_by_row[0].sources.opportunity_score, "orchestrator:opportunity.score.totalScore");
});

test("buildDiscoveryPersistencePlan keeps safe placeholders and diagnostics when outputs are incomplete", () => {
  const plan = buildDiscoveryPersistencePlan(
    createResult({ outputs: { opportunityDetection: { candidates: [] }, painDetection: { candidates: [] } } } as unknown as Partial<DiscoveryModularPipelineResult>)
  );

  assert.equal(plan.rows.length, 0);
  assert.equal(plan.diagnostics.planned_row_count, 0);
  assert.equal(
    plan.diagnostics.warnings.some((warning) => warning.code === "missing_orchestrator_candidates"),
    true
  );
});

test("validateDiscoveryPersistencePlanRows rejects rows outside the discovered_problems-compatible shape", () => {
  const [row] = buildDiscoveryPersistencePlan(createResult()).rows;
  const [validation] = validateDiscoveryPersistencePlanRows([
    { ...row, pain_score: 99, build_difficulty: "Impossible" },
  ]);

  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some((error) => error.field === "pain_score"), true);
  assert.equal(validation.errors.some((error) => error.field === "build_difficulty"), true);
});
