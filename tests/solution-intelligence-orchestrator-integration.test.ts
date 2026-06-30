import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildDiscoveryOrchestratorDiagnosticMetrics } from "../lib/intelligence/discovery-orchestrator-diagnostics.ts";
import type { DiscoveryModularPipelineResult } from "../lib/intelligence/types.ts";

test("orchestrator keeps solution intelligence behind a diagnostics flag", () => {
  const orchestrator = readFileSync("lib/intelligence/orchestrator.ts", "utf8");

  assert.match(orchestrator, /SOLUTION_INTELLIGENCE_DIAGNOSTICS/);
  assert.match(orchestrator, /solution_intelligence_evaluation/);
  assert.match(orchestrator, /options\.dryRun !== false/);
});

test("orchestrator builds solution intelligence input from problem synthesis and engine aggregates", () => {
  const orchestrator = readFileSync("lib/intelligence/orchestrator.ts", "utf8");

  assert.match(orchestrator, /problemIntelligenceSynthesis\?\.candidates\[0\]/);
  assert.match(orchestrator, /problemTitle: candidate\.synthesizedProblemTitle/);
  assert.match(orchestrator, /opportunityCandidateCount/);
  assert.match(orchestrator, /monetizationCandidateCount/);
  assert.match(orchestrator, /confidenceCandidateCount/);
});

test("solution intelligence result is represented only in modular diagnostics outputs", () => {
  const types = readFileSync("lib/intelligence/types.ts", "utf8");
  const workflow = readFileSync("lib/intelligence/discover-opportunities-workflow.ts", "utf8");

  assert.match(types, /solutionIntelligenceEvaluation\?: SolutionIntelligenceResult/);
  assert.doesNotMatch(types, /DiscoveryDecisionContext[\s\S]*solutionIntelligenceEvaluation/);
  assert.doesNotMatch(workflow, /solutionIntelligenceEvaluation|SolutionIntelligenceEngine/);
});

test("diagnostic metrics expose safe solution intelligence aggregates", () => {
  const result = {
    runId: "diagnostic-run",
    dryRun: true,
    diagnostics: [],
    outputs: {
      solutionIntelligenceEvaluation: {
        diagnostics: {
          evaluatedCategoryCount: 13,
          recommendedCategory: "automation",
          rejectedCategoryCount: 4,
          lowConfidenceReasonCount: 2,
          missingEvidenceCount: 3,
          fallbackUsed: false,
          warnings: ["safe aggregate warning"],
        },
        recommendation: { recommendedCategory: "automation" },
      },
    },
    warnings: [],
    completedAt: "2026-06-30T00:00:00.000Z",
  } as unknown as DiscoveryModularPipelineResult;

  assert.deepEqual(buildDiscoveryOrchestratorDiagnosticMetrics(result).solution_intelligence, {
    evaluated_category_count: 13,
    recommended_category: "automation",
    rejected_category_count: 4,
    low_confidence_reason_count: 2,
    missing_evidence_count: 3,
    warning_count: 1,
    recommendation_produced: true,
  });
});
