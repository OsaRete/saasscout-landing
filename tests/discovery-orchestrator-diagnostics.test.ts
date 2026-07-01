import assert from "node:assert/strict";
import test from "node:test";

import { buildDiscoveryOrchestratorDiagnosticMetrics } from "../lib/intelligence/discovery-orchestrator-diagnostics.ts";
import type { DiscoveryModularPipelineResult } from "../lib/intelligence/types.ts";

test("buildDiscoveryOrchestratorDiagnosticMetrics returns aggregate counts and all stage statuses", () => {
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
    environment_flags: {
      DISCOVERY_ORCHESTRATOR_DIAGNOSTICS: false,
      SOLUTION_INTELLIGENCE_DIAGNOSTICS: false,
    },
    modular_stage_statuses: [
      {
        stage: "evidence_normalization",
        status: "completed",
        missingInputs: [],
        warnings: [],
      },
      {
        stage: "founder_intelligence",
        status: "skipped",
        missingInputs: ["founderProfile"],
        warnings: ["No founder profile was provided."],
      },
    ],
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
    solution_intelligence_stage: {
      included: false,
      completed: false,
      skipped: false,
      missing_inputs_caused_skip: false,
      missingInputs: [],
      warnings: [],
    },
    solution_intelligence: null,
    deduplication_group_count: 4,
  });
});

test("solution intelligence skipped stage exposes missing inputs and safe flag booleans", () => {
  process.env.SOLUTION_INTELLIGENCE_DIAGNOSTICS = "1";
  process.env.DISCOVERY_ORCHESTRATOR_DIAGNOSTICS = "1";

  const result = {
    runId: "diagnostic-run",
    dryRun: true,
    diagnostics: [
      {
        stage: "solution_intelligence_evaluation",
        status: "skipped",
        requiredInputs: ["problemIntelligenceSynthesis"],
        availableInputs: [],
        missingInputs: ["problemIntelligenceSynthesis"],
        warnings: ["Problem synthesis candidates were unavailable."],
      },
    ],
    outputs: {},
    warnings: [],
    completedAt: "2026-06-27T00:00:00.000Z",
  } as unknown as DiscoveryModularPipelineResult;

  const metrics = buildDiscoveryOrchestratorDiagnosticMetrics(result);

  assert.deepEqual(metrics.environment_flags, {
    DISCOVERY_ORCHESTRATOR_DIAGNOSTICS: true,
    SOLUTION_INTELLIGENCE_DIAGNOSTICS: true,
  });
  assert.deepEqual(metrics.solution_intelligence_stage, {
    included: true,
    completed: false,
    skipped: true,
    missing_inputs_caused_skip: true,
    missingInputs: ["problemIntelligenceSynthesis"],
    warnings: ["Problem synthesis candidates were unavailable."],
  });

  delete process.env.SOLUTION_INTELLIGENCE_DIAGNOSTICS;
  delete process.env.DISCOVERY_ORCHESTRATOR_DIAGNOSTICS;
});
