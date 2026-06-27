import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDiscoveryPersistencePlan,
  isPlannedDiscoveredProblem,
  validateDiscoveryPersistencePlanRows,
  engineScoreToPersistedOneToTen,
  engineScoreToPersistedOpportunityScore,
  safeAverageScore,
  clampPersistedOneToTen,
  clampPersistedOpportunityScore,
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
            score: { totalScore: 8.2, frequencyScore: 8, evidenceScore: 9 },
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
            score: { totalScore: 7.6 },
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
              totalScore: 8.4,
              problemUrgencyScore: 8,
              marketPullScore: 7.8,
              buildSimplicityScore: 8,
              evidenceScore: 8.6,
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
            score: { totalScore: 7.9, willingnessToPayScore: 8.1 },
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
            score: { evidenceQualityScore: 8.8 },
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
  assert.equal(plan.rows[0].pain_score, 8.2);
  assert.equal(plan.rows[0].revenue_score, 7.9);
  assert.equal(plan.rows[0].urgency_score, 8);
  assert.equal(plan.rows[0].trend_score, 7.6);
  assert.equal(plan.rows[0].buying_signal_score, 8.1);
  assert.ok(Math.abs(plan.rows[0].source_quality_score - 8.8) < 0.0001);
  assert.equal(plan.rows[0].opportunity_score, 84);
  assert.equal(plan.rows[0].build_difficulty, "Easy");
  assert.equal(isPlannedDiscoveredProblem(plan.rows[0]), true);
  assert.equal(plan.diagnostics.source_candidate_counts.opportunity, 1);
  assert.equal(plan.diagnostics.field_sources_by_row[0].sources.opportunity_score, "orchestrator:engine.0-10:opportunity.score.totalScore");
  assert.deepEqual(plan.diagnostics.score_mappings_by_row[0].mappings.opportunity_score, {
    source: "engine",
    inputScale: "0-10",
    persistedScale: "1-100",
    rawValue: 8.4,
    persistedValue: 84,
  });
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

test("score conversion helpers preserve 0-10 engine scores and scale opportunity scores", () => {
  assert.equal(engineScoreToPersistedOneToTen(8.5), 8.5);
  assert.equal(engineScoreToPersistedOpportunityScore(7.2), 72);
  assert.equal(safeAverageScore([6, 8, undefined]), 7);
});

test("score conversion helpers use safe defaults and clamp invalid values", () => {
  assert.equal(engineScoreToPersistedOneToTen(undefined), 7);
  assert.equal(engineScoreToPersistedOpportunityScore(undefined), 70);
  assert.equal(clampPersistedOneToTen(-4), 1);
  assert.equal(clampPersistedOneToTen(14), 10);
  assert.equal(clampPersistedOpportunityScore(-40), 1);
  assert.equal(clampPersistedOpportunityScore(140), 100);
});

test("buildDiscoveryPersistencePlan does not collapse valid 0-10 engine scores to minimum persisted scores", () => {
  const plan = buildDiscoveryPersistencePlan(createResult(), {
    discoveryId: "discovery-1",
    userId: "user-1",
  });

  assert.ok(plan.rows[0].pain_score > 1);
  assert.ok(plan.rows[0].revenue_score > 1);
  assert.ok(plan.rows[0].urgency_score > 1);
  assert.ok(plan.rows[0].opportunity_score > 10);
});

test("buildDiscoveryPersistencePlan records score mapping fallbacks for missing score inputs", () => {
  const plan = buildDiscoveryPersistencePlan(createResult({
    outputs: {
      painDetection: { candidates: [] },
      opportunityDetection: {
        candidates: [
          {
            id: "opp-missing-scores",
            title: "Scheduling gaps for field teams",
            normalizedTitle: "scheduling gaps for field teams",
            context: {},
            marketContext: {},
            evidence: [],
            score: {},
          },
        ],
      },
    },
  } as unknown as Partial<DiscoveryModularPipelineResult>));

  assert.equal(plan.rows[0].pain_score, 7);
  assert.equal(plan.rows[0].opportunity_score, 70);
  assert.equal(plan.diagnostics.score_mappings_by_row[0].mappings.pain_score?.source, "fallback");
  assert.equal(plan.diagnostics.score_mappings_by_row[0].mappings.opportunity_score?.source, "fallback");
});
