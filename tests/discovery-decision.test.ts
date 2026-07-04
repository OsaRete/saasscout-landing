import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_DISCOVERY_DECISION_THRESHOLDS,
  decideDiscoveryPipeline,
} from "../lib/intelligence/decision/index.ts";
import type { DiscoveryDecisionInput } from "../lib/intelligence/decision/types.ts";

const legacyProblem = {
  problem_title: "Manual client reporting bottlenecks",
  problem_summary: "Small agencies repeatedly spend non-billable time assembling weekly client reports from scattered dashboards and spreadsheets.",
  affected_niches: "Agencies | Client services",
  suggested_solutions: "Automated report assembly",
  pain_score: 8,
  revenue_score: 8,
  urgency_score: 7,
  trend_score: 7,
  buying_signal_score: 8,
  frequency_score: 8,
  source_quality_score: 9,
  opportunity_score: 78,
  problem_cluster: "Agency Operations",
  build_difficulty: "Medium",
  source_evidence: "Reddit and review sources mention recurring reporting work.",
};

function createInput(overrides: Partial<DiscoveryDecisionInput> = {}): DiscoveryDecisionInput {
  const rows = Array.from({ length: 3 }, (_, index) => ({ ...legacyProblem, problem_title: `Specific reporting bottleneck ${index + 1}` }));
  const input = {
    legacyProblems: [legacyProblem],
    persistencePlan: {
      dryRun: true,
      rows,
      diagnostics: {
        dry_run: true,
        planned_row_count: 3,
        valid_row_count: 3,
        invalid_row_count: 0,
        source_candidate_counts: { pain: 3, pattern: 3, trend: 3, opportunity: 3, monetization: 3, confidence: 3, deduplication_groups: 3, problem_synthesis: 3 },
        row_sources: [],
        fallback_fields_by_row: [],
        field_sources_by_row: [],
        score_mappings_by_row: [],
        warnings: [],
      },
    },
    qualityGateResult: {
      allRowsPass: true,
      acceptedRows: rows,
      rejectedRows: [],
      issues: [],
      summary: {
        total_rows: 3,
        accepted_row_count: 3,
        rejected_row_count: 0,
        issue_count: 0,
        error_count: 0,
        warning_count: 0,
        issue_counts_by_code: { title_too_short: 0, title_generic_keyword: 0, summary_missing: 0, summary_matches_title: 0, summary_too_short: 0, opportunity_score_too_low: 0, all_primary_scores_minimum: 0, source_evidence_too_long: 0, source_evidence_missing: 0, too_many_fallback_fields: 0, build_difficulty_invalid: 0 },
        average_opportunity_score: 86,
        fallback_field_count: 0,
        rows_with_fallback_fields: 0,
        max_source_evidence_length: 120,
      },
      safeDiagnostics: {} as never,
    },
    qualityComparison: {
      categories: [],
      legacyMetrics: { problemCount: 1, averageTitleSpecificity: 80, averageSummaryQuality: 80, averageEvidenceQuality: 80, averageEvidenceCompactness: 100, averageScoreConsistency: 80, averageOpportunityCompleteness: 80, marketCoverageScore: 80, fallbackUsageScore: 100, synthesisCompletenessScore: 100, rowLevelSynthesisReadinessScore: 100, qualityGateScore: 100 },
      modularMetrics: { problemCount: 3, averageTitleSpecificity: 85, averageSummaryQuality: 86, averageEvidenceQuality: 84, averageEvidenceCompactness: 100, averageScoreConsistency: 82, averageOpportunityCompleteness: 88, marketCoverageScore: 90, fallbackUsageScore: 100, synthesisCompletenessScore: 100, rowLevelSynthesisReadinessScore: 100, qualityGateScore: 100, plannedRowCount: 3, synthesisCandidateCount: 3, qualityGateAcceptedRows: 3, qualityGateRejectedRows: 0, fallbackFieldCount: 0, orchestratorWarningCount: 0 },
      overallLegacyScore: 80,
      overallModularScore: 88,
      overallWinner: "modular",
      diagnostics: { categoryCount: 10, legacyProblemCount: 1, modularCandidateCount: 3, modularPlannedRowCount: 3, modularSynthesisCandidateCount: 3, fallbackFieldCount: 0, qualityGateIssueCount: 0, notes: [] },
    },
    orchestratorDiagnostics: { warnings_count: 0 },
  } as DiscoveryDecisionInput;

  return { ...input, ...overrides };
}

test("legacy wins when modular quality is lower", () => {
  const result = decideDiscoveryPipeline(createInput({ qualityComparison: { ...createInput().qualityComparison, overallModularScore: 72, overallLegacyScore: 80 } }));
  assert.equal(result.decision, "use_legacy");
  assert.ok(result.reasons.includes("modular_quality_below_legacy"));
});

test("modular is rejected when quality gates fail", () => {
  const input = createInput();
  input.qualityGateResult.allRowsPass = false;
  input.qualityGateResult.summary.issue_count = 1;
  input.qualityGateResult.summary.rejected_row_count = 1;
  const result = decideDiscoveryPipeline(input);
  assert.equal(result.decision, "reject_modular");
  assert.ok(result.reasons.includes("modular_failed_quality_gates"));
});

test("modular wins when its quality score exceeds legacy and passes gates", () => {
  const result = decideDiscoveryPipeline(createInput());
  assert.equal(result.decision, "use_modular");
  assert.ok(result.reasons.includes("modular_quality_above_threshold"));
  assert.ok(result.reasons.includes("modular_score_delta_above_legacy"));
});

test("insufficient_data when there are too few candidates", () => {
  const input = createInput();
  input.persistencePlan.diagnostics.planned_row_count = 1;
  input.qualityComparison.diagnostics.modularCandidateCount = 1;
  const result = decideDiscoveryPipeline(input);
  assert.equal(result.decision, "insufficient_data");
  assert.ok(result.reasons.includes("insufficient_modular_candidates"));
});

test("decision reasons are deterministic", () => {
  const first = decideDiscoveryPipeline(createInput()).reasons;
  const second = decideDiscoveryPipeline(createInput()).reasons;
  assert.deepEqual(first, second);
});

test("safe defaults keep modular persistence disabled", () => {
  assert.deepEqual(DEFAULT_DISCOVERY_DECISION_THRESHOLDS, {
    minimumModularOverallQualityScore: 70,
    minimumModularCandidateCount: 3,
    maximumRejectedRowRatio: 0.2,
    minimumModularVsLegacyScoreDelta: 5,
    maximumFallbackUsage: 0.25,
    maximumOrchestratorWarnings: 2,
  });
  const result = decideDiscoveryPipeline(createInput());
  assert.equal(result.recommendation.persistModular, false);
  assert.equal(result.recommendation.productionBehaviorChanged, false);
});
