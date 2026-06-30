import assert from "node:assert/strict";
import test from "node:test";

import { runSolutionIntelligence, type SolutionIntelligenceInput } from "../lib/engines/solution/index.ts";
import {
  buildSolutionDiagnosticAggregateReport,
  createEmptySolutionDiagnosticAggregateReport,
  formatSolutionDiagnosticSummary,
  getSolutionConfidenceBucket,
  mergeSolutionDiagnosticAggregateReports,
} from "../lib/intelligence/solution-diagnostics/index.ts";

function input(overrides: Partial<SolutionIntelligenceInput> = {}): SolutionIntelligenceInput {
  return {
    runId: "diagnostic-test-run",
    problemTitle: "Operators struggle with repeated manual workflows",
    problemSummary: "Teams copy paste data between spreadsheets every week and need automation for a recurring business workflow with clear ROI.",
    affectedMarkets: ["B2B operations"],
    affectedAudiences: ["operations teams"],
    evidenceReferences: ["reddit: manual spreadsheet workflow", "interview: weekly copy paste process", "review: need automation"],
    evaluatedAt: "2026-06-30T00:00:00.000Z",
    ...overrides,
  };
}

test("buildSolutionDiagnosticAggregateReport is deterministic", () => {
  const runs = [runSolutionIntelligence(input()), runSolutionIntelligence(input({ runId: "human-service", problemSummary: "Customers need a trusted human expert for custom done-for-you implementation and strategy." }))];
  assert.deepEqual(buildSolutionDiagnosticAggregateReport(runs), buildSolutionDiagnosticAggregateReport(runs));
});

test("tracks category frequencies independently", () => {
  const report = buildSolutionDiagnosticAggregateReport([runSolutionIntelligence(input())]);
  assert.equal(report.categoryStatistics.saas_software.evaluatedCount, 1);
  assert.equal(report.categoryStatistics.mobile_app.evaluatedCount, 1);
  assert.equal(report.categoryStatistics.new_business_model.evaluatedCount, 1);
  assert.equal(Object.keys(report.categorySelectionFrequency).length, 13);
  assert.equal(Object.keys(report.rejectedCategoryFrequency).length, 13);
});

test("calculates SaaS and non-SaaS selection rates", () => {
  const saasRun = runSolutionIntelligence(input({
    runId: "saas-run",
    problemSummary: "B2B teams need recurring software dashboard workflow automation with data reports, integrations, ROI, and weekly usage.",
  }));
  const serviceRun = runSolutionIntelligence(input({
    runId: "service-run",
    problemSummary: "Small businesses need trusted human expert custom done-for-you managed support and implementation strategy.",
  }));
  const report = buildSolutionDiagnosticAggregateReport([saasRun, serviceRun]);
  assert.equal(report.totalEvaluations, 2);
  assert.equal(report.saasSelectionRate + report.nonSaasSelectionRate + report.insufficientEvidenceRate, 1);
  assert.equal(typeof report.saasBiasRate, "number");
});

test("calculates recommendation readiness metrics", () => {
  const strong = runSolutionIntelligence(input());
  const weak = runSolutionIntelligence(input({ runId: "weak", problemTitle: "Vague problem", problemSummary: "Something is hard.", evidenceReferences: [] }));
  const report = buildSolutionDiagnosticAggregateReport([strong, weak]);
  assert.equal(report.recommendationsWithStrongEvidence + report.recommendationsWithWeakEvidence + report.recommendationsWithoutRecommendation, 2);
  assert.equal(report.recommendationCoverage, report.recommendationRate);
});

test("calculates confidence buckets", () => {
  assert.equal(getSolutionConfidenceBucket(0), "0-2");
  assert.equal(getSolutionConfidenceBucket(2), "2-4");
  assert.equal(getSolutionConfidenceBucket(4), "4-6");
  assert.equal(getSolutionConfidenceBucket(6), "6-8");
  assert.equal(getSolutionConfidenceBucket(10), "8-10");
  const report = buildSolutionDiagnosticAggregateReport([runSolutionIntelligence(input())]);
  assert.equal(Object.values(report.confidenceBuckets).reduce((sum, count) => sum + count, 0), 1);
});

test("generates an empty report", () => {
  assert.deepEqual(buildSolutionDiagnosticAggregateReport([]), createEmptySolutionDiagnosticAggregateReport());
});

test("merges multiple aggregate reports", () => {
  const first = buildSolutionDiagnosticAggregateReport([runSolutionIntelligence(input({ runId: "first" }))]);
  const second = buildSolutionDiagnosticAggregateReport([runSolutionIntelligence(input({ runId: "second", problemSummary: "Customers need trusted human expert implementation." }))]);
  const merged = mergeSolutionDiagnosticAggregateReports([first, second]);
  assert.equal(merged.totalEvaluations, 2);
  assert.equal(merged.recommendationsWithStrongEvidence + merged.recommendationsWithWeakEvidence + merged.recommendationsWithoutRecommendation, 2);
});

test("generates a human-readable diagnostic summary", () => {
  const summary = formatSolutionDiagnosticSummary(buildSolutionDiagnosticAggregateReport([runSolutionIntelligence(input())]));
  assert.match(summary, /Solution Intelligence Diagnostic Summary/);
  assert.match(summary, /Evaluations: 1/);
  assert.match(summary, /Recommendation readiness:/);
});
