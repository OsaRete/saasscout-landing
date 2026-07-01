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
    problem_synthesis: null,
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


test("problem synthesis collapse diagnostics are exposed through orchestrator metrics", () => {
  const result = {
    runId: "diagnostic-run",
    dryRun: true,
    diagnostics: [],
    outputs: {
      problemIntelligenceSynthesis: {
        candidates: [{}],
        diagnostics: [{
          candidateCollapseReport: {
            upstreamCandidateCounts: { pain: 2, pattern: 1, trend: 1, opportunity: 2, monetization: 1, confidence: 1 },
            totalPossibleSynthesisSeedCount: 8,
            uniqueNormalizedTitleCount: 6,
            uniqueTitleMarketAudienceClusterCount: 7,
            eligibleSynthesisClusterCount: 7,
            emittedSynthesisCandidateCount: 1,
            rejectedSynthesisClusterCount: 6,
            rejectionReasons: [{ reason: "single_candidate_mode_retains_only_top_ranked_cluster", count: 6 }],
            topPotentialNextCandidateTitles: ["Second safe title"],
            extractedSeedCount: 8,
            rankedSeedCount: 7,
            genericTitleSeedCount: 1,
            downrankedGenericSeedCount: 1,
            topRankedSeedTitles: ["Specific workflow problem"],
            topRankedSeedScores: [8.7],
            topRejectedSeedTitles: ["Second safe title"],
            topRejectionReasons: ["not_enough_evidence"],
            seedsWithCrossEngineSupport: 2,
            seedsWithoutEnoughEvidence: 3,
            rankedSeeds: [{ title: "Specific workflow problem", normalizedTitle: "specific workflow problem", market: "agencies", audience: "operators", problemCluster: "workflow", score: 8.7, rejectionReasons: [], engineSupport: ["pain", "opportunity"], evidenceCount: 3, genericTitle: false, downrankedGeneric: false, semanticTitle: "Specific Workflow Problem", semanticTitleScore: 8.2, rawTitleRejected: false, rawTitleRejectionReasons: [] }],
            singleCandidateMode: true,
            semanticTitlesGenerated: 7,
            semanticTitlesSelected: 1,
            rawTitlesRejected: 2,
            semanticTitleScoreDistribution: { min: 3.4, max: 8.2, average: 6.1 },
            topSemanticTitles: [{ title: "Specific Workflow Problem", score: 8.2, sourceTitle: "Specific workflow problem" }],
            rawTitleRejectionReasons: [{ reason: "raw_evidence_prefix", count: 2 }],
            collapseExplanation: "Problem synthesis is intentionally operating in legacy-compatible single-candidate mode.",
          },
        }],
      },
    },
    warnings: [],
    completedAt: "2026-06-27T00:00:00.000Z",
  } as unknown as DiscoveryModularPipelineResult;

  const metrics = buildDiscoveryOrchestratorDiagnosticMetrics(result);

  assert.deepEqual(metrics.problem_synthesis, {
    upstream_pain_candidate_count: 2,
    upstream_pattern_candidate_count: 1,
    upstream_trend_candidate_count: 1,
    upstream_opportunity_candidate_count: 2,
    upstream_monetization_candidate_count: 1,
    upstream_confidence_candidate_count: 1,
    total_possible_synthesis_seed_count: 8,
    unique_normalized_title_count: 6,
    unique_title_market_audience_cluster_count: 7,
    eligible_synthesis_cluster_count: 7,
    emitted_synthesis_candidate_count: 1,
    rejected_synthesis_cluster_count: 6,
    rejection_reasons: [{ reason: "single_candidate_mode_retains_only_top_ranked_cluster", count: 6 }],
    top_5_potential_next_candidate_titles: ["Second safe title"],
    extracted_seed_count: 8,
    ranked_seed_count: 7,
    generic_title_seed_count: 1,
    downranked_generic_seed_count: 1,
    top_ranked_seed_titles: ["Specific workflow problem"],
    top_ranked_seed_scores: [8.7],
    top_rejected_seed_titles: ["Second safe title"],
    top_rejection_reasons: ["not_enough_evidence"],
    seeds_with_cross_engine_support: 2,
    seeds_without_enough_evidence: 3,
    ranked_seeds: [{ title: "Specific workflow problem", normalizedTitle: "specific workflow problem", market: "agencies", audience: "operators", problemCluster: "workflow", score: 8.7, rejectionReasons: [], engineSupport: ["pain", "opportunity"], evidenceCount: 3, genericTitle: false, downrankedGeneric: false, semanticTitle: "Specific Workflow Problem", semanticTitleScore: 8.2, rawTitleRejected: false, rawTitleRejectionReasons: [] }],
    single_candidate_mode: true,
    semantic_titles_generated: 7,
    semantic_titles_selected: 1,
    raw_titles_rejected: 2,
    semantic_title_score_distribution: { min: 3.4, max: 8.2, average: 6.1 },
    top_semantic_titles: [{ title: "Specific Workflow Problem", score: 8.2, sourceTitle: "Specific workflow problem" }],
    raw_title_rejection_reasons: [{ reason: "raw_evidence_prefix", count: 2 }],
    collapse_explanation: "Problem synthesis is intentionally operating in legacy-compatible single-candidate mode.",
  });
});
