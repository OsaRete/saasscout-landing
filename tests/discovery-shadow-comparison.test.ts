import assert from "node:assert/strict";
import test from "node:test";

import { buildDiscoveryShadowComparisonMetrics } from "../lib/intelligence/discovery-shadow-comparison.ts";
import type { DiscoveredProblem } from "../lib/intelligence/discovery-response-normalization.ts";
import type { DiscoveryModularPipelineResult } from "../lib/intelligence/types.ts";

function createResult(overrides: Partial<DiscoveryModularPipelineResult> = {}) {
  return {
    runId: "shadow-run",
    dryRun: true,
    diagnostics: [
      {
        stage: "pain_detection",
        status: "completed",
        requiredInputs: [],
        availableInputs: [],
        missingInputs: [],
        warnings: [],
      },
      {
        stage: "founder_intelligence",
        status: "skipped",
        requiredInputs: ["founderProfile"],
        availableInputs: [],
        missingInputs: ["founderProfile"],
        warnings: [],
      },
    ],
    outputs: {
      painDetection: { candidates: [{}, {}] },
      patternDetection: { candidates: [{}] },
      trendDetection: { candidates: [{}, {}, {}] },
      opportunityDetection: {
        candidates: [
          {
            title: "Manual Client Reporting Automation",
            normalizedTitle: "manual client reporting automation",
            score: { totalScore: 82 },
          },
          {
            title: "Agency CRM Cleanup",
            normalizedTitle: "agency crm cleanup",
            score: { totalScore: 74 },
          },
        ],
      },
      monetizationEvaluation: { candidates: [{}] },
      confidenceEvaluation: { candidates: [{}, {}] },
      semanticProblemDeduplication: { summary: { groupCount: 2 } },
    },
    warnings: ["safe aggregate warning"],
    completedAt: "2026-06-27T00:00:00.000Z",
    ...overrides,
  } as unknown as DiscoveryModularPipelineResult;
}

const legacyProblems = [
  {
    problem_title: "Manual client reporting",
    problem_cluster: "Agency Operations",
    opportunity_score: 80,
  },
  {
    problem_title: "CRM cleanup for agencies",
    problem_cluster: "Client Operations",
    opportunity_score: 70,
  },
] as DiscoveredProblem[];

test("buildDiscoveryShadowComparisonMetrics returns safe aggregate migration parity metrics", () => {
  assert.deepEqual(
    buildDiscoveryShadowComparisonMetrics({
      legacyProblems,
      orchestratorResult: createResult(),
    }),
    {
      legacy_problem_count: 2,
      orchestrator_pain_candidate_count: 2,
      orchestrator_pattern_candidate_count: 1,
      orchestrator_trend_candidate_count: 3,
      orchestrator_opportunity_candidate_count: 2,
      orchestrator_monetization_candidate_count: 1,
      orchestrator_confidence_candidate_count: 2,
      orchestrator_deduplication_group_count: 2,
      legacy_average_opportunity_score: 75,
      orchestrator_average_opportunity_score: 78,
      title_overlap_count: 1,
      keyword_overlap_count: 5,
      warnings_count: 1,
      stages_executed: ["pain_detection"],
      parity_status: "aligned",
    }
  );
});

test("buildDiscoveryShadowComparisonMetrics reports insufficient data without legacy or orchestrator candidates", () => {
  const metrics = buildDiscoveryShadowComparisonMetrics({
    legacyProblems: [],
    orchestratorResult: createResult({
      outputs: { opportunityDetection: { candidates: [] } },
      warnings: [],
    } as unknown as Partial<DiscoveryModularPipelineResult>),
  });

  assert.equal(metrics.parity_status, "insufficient_data");
  assert.equal(metrics.legacy_problem_count, 0);
  assert.equal(metrics.orchestrator_opportunity_candidate_count, 0);
});
