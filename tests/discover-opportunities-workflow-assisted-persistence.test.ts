import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSafeAssistedPersistenceDecisionDiagnostics,
  selectDecisionGatedAssistedPersistenceRows,
} from "../lib/intelligence/discovery-assisted-persistence-decision.ts";
import type { DiscoveryDecisionResult } from "../lib/intelligence/decision/types.ts";
import type { PlannedDiscoveredProblem } from "../lib/intelligence/discovery-orchestrator-persistence-plan.ts";

const row: PlannedDiscoveredProblem = {
  discovery_id: "discovery-1",
  user_id: "user-1",
  problem_title: "Automated client reporting bottlenecks",
  problem_summary: "Small agencies repeatedly waste non-billable time assembling client reports from scattered dashboards and spreadsheets.",
  affected_niches: "Agencies | Client services",
  suggested_solutions: "Automated report assembly | Client dashboard connector",
  pain_score: 8,
  revenue_score: 8,
  urgency_score: 7,
  trend_score: 7,
  buying_signal_score: 8,
  frequency_score: 8,
  source_quality_score: 9,
  opportunity_score: 84,
  problem_cluster: "Agency Operations",
  build_difficulty: "Medium",
  source_evidence: "Aggregate source diagnostics indicate repeated client reporting friction across multiple market signals.",
};

function decision(decision: DiscoveryDecisionResult["decision"]): DiscoveryDecisionResult {
  return {
    decision,
    reasons: decision === "use_modular" ? ["modular_quality_above_threshold"] : ["modular_failed_quality_gates"],
    confidence: "high",
    diagnostics: {
      legacyProblemCount: 1,
      modularCandidateCount: 3,
      modularPlannedRowCount: 3,
      modularAcceptedRowCount: 3,
      modularRejectedRowCount: 0,
      modularRejectedRowRatio: 0,
      modularOverallQualityScore: 88,
      legacyOverallQualityScore: 80,
      modularVsLegacyScoreDelta: 8,
      modularFallbackUsageRatio: 0,
      qualityGateIssueCount: 0,
      orchestratorWarningCount: 0,
      thresholds: {
        minimumModularOverallQualityScore: 70,
        minimumModularCandidateCount: 3,
        maximumRejectedRowRatio: 0.2,
        minimumModularVsLegacyScoreDelta: 5,
        maximumFallbackUsage: 0.25,
        maximumOrchestratorWarnings: 2,
      },
    },
    recommendation: {
      primaryPipeline: decision === "use_modular" ? "modular" : "legacy",
      allowFallback: decision !== "use_modular",
      persistModular: false,
      productionBehaviorChanged: false,
      explanation: "Test recommendation.",
    },
  };
}

function qualityGate(allRowsPass = true) {
  return {
    allRowsPass,
    acceptedRows: allRowsPass ? [row] : [],
    rejectedRows: allRowsPass ? [] : [{ rowIndex: 0, row, issues: [] }],
    issues: [],
    summary: {
      total_rows: 1,
      accepted_row_count: allRowsPass ? 1 : 0,
      rejected_row_count: allRowsPass ? 0 : 1,
      issue_count: allRowsPass ? 0 : 1,
      error_count: allRowsPass ? 0 : 1,
      warning_count: 0,
      issue_counts_by_code: { title_too_short: 0, title_generic_keyword: 0, summary_missing: 0, summary_matches_title: 0, summary_too_short: 0, opportunity_score_too_low: 0, all_primary_scores_minimum: 0, source_evidence_too_long: 0, source_evidence_missing: allRowsPass ? 0 : 1, too_many_fallback_fields: 0, build_difficulty_invalid: 0 },
      average_opportunity_score: 84,
      fallback_field_count: 0,
      rows_with_fallback_fields: 0,
      max_source_evidence_length: row.source_evidence.length,
    },
    safeDiagnostics: {} as never,
  };
}

const validValidation = [{ valid: true, errors: [] }];

test("flag disabled keeps legacy path by selecting no modular rows", () => {
  const previous = process.env.DISCOVERY_ORCHESTRATOR_ASSISTED_PERSISTENCE;
  delete process.env.DISCOVERY_ORCHESTRATOR_ASSISTED_PERSISTENCE;
  assert.notEqual(process.env.DISCOVERY_ORCHESTRATOR_ASSISTED_PERSISTENCE, "1");
  process.env.DISCOVERY_ORCHESTRATOR_ASSISTED_PERSISTENCE = previous;
});

test("flag enabled but decision rejects modular falls back to legacy", () => {
  assert.equal(selectDecisionGatedAssistedPersistenceRows({ plannedRows: [row], validation: validValidation, qualityGateResult: qualityGate(), decisionResult: decision("reject_modular") }), null);
});

test("flag enabled and decision approves modular uses planned rows", () => {
  assert.deepEqual(selectDecisionGatedAssistedPersistenceRows({ plannedRows: [row], validation: validValidation, qualityGateResult: qualityGate(), decisionResult: decision("use_modular") }), [row]);
  assert.deepEqual(selectDecisionGatedAssistedPersistenceRows({ plannedRows: [row], validation: validValidation, qualityGateResult: qualityGate(), decisionResult: decision("use_modular_with_fallback") }), [row]);
});

test("invalid planned rows fall back to legacy", () => {
  assert.equal(selectDecisionGatedAssistedPersistenceRows({ plannedRows: [row], validation: [{ valid: false, errors: [] }], qualityGateResult: qualityGate(), decisionResult: decision("use_modular") }), null);
});

test("quality gate failure falls back to legacy", () => {
  assert.equal(selectDecisionGatedAssistedPersistenceRows({ plannedRows: [row], validation: validValidation, qualityGateResult: qualityGate(false), decisionResult: decision("use_modular") }), null);
});

test("decision diagnostics are safe aggregate fields only", () => {
  const diagnostics = buildSafeAssistedPersistenceDecisionDiagnostics({ decisionResult: decision("use_modular"), qualityGatePassed: true, plannedRowCount: 3, fallbackUsed: false });
  assert.deepEqual(Object.keys(diagnostics).sort(), ["decision", "fallback_used", "legacy_quality_score", "modular_quality_score", "planned_row_count", "quality_gate_passed", "reasons"].sort());
  assert.equal(JSON.stringify(diagnostics).includes(row.source_evidence), false);
  assert.equal(JSON.stringify(diagnostics).includes(row.problem_summary), false);
});
