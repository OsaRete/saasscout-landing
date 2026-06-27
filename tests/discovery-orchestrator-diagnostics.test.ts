import assert from "node:assert/strict";
import test from "node:test";

import { buildDiscoveryOrchestratorDiagnosticMetrics } from "../lib/intelligence/discovery-orchestrator-diagnostics.ts";
import type { DiscoveryModularPipelineResult } from "../lib/intelligence/types.ts";

test("buildDiscoveryOrchestratorDiagnosticMetrics returns compact aggregate counts only", () => {
  const result = {
    runId: "diagnostic-run",
    dryRun: true,
    diagnostics: [
      {
        stage: "evidence_normalization",
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
        warnings: ["No founder profile was provided."],
      },
    ],
    outputs: {
      evidenceNormalization: { evidence: [{}, {}], validation: [] },
      knowledgeUpdatePreparation: { knowledgeUpdates: [{}] },
      painDetection: { candidates: [{}, {}] },
      patternDetection: { candidates: [{}] },
      trendDetection: { candidates: [{}, {}, {}] },
      opportunityDetection: { candidates: [{}] },
      monetizationEvaluation: { candidates: [{}, {}] },
      confidenceEvaluation: { candidates: [{}] },
      feedbackLearning: { signals: [{}, {}] },
      semanticProblemDeduplication: { summary: { groupCount: 4 } },
    },
    warnings: ["safe aggregate warning"],
    completedAt: "2026-06-27T00:00:00.000Z",
  } as unknown as DiscoveryModularPipelineResult;

  assert.deepEqual(buildDiscoveryOrchestratorDiagnosticMetrics(result), {
    stages_executed: ["evidence_normalization"],
    warnings_count: 1,
    evidence_count: 2,
    knowledge_update_count: 1,
    pain_candidate_count: 2,
    pattern_candidate_count: 1,
    trend_candidate_count: 3,
    opportunity_candidate_count: 1,
    monetization_candidate_count: 2,
    confidence_candidate_count: 1,
    feedback_signal_count: 2,
    deduplication_group_count: 4,
  });
});
