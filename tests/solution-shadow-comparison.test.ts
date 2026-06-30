import assert from "node:assert/strict";
import test from "node:test";

import { buildSolutionShadowComparisonMetrics } from "../lib/intelligence/solution-shadow-comparison.ts";
import type { DiscoveredProblem } from "../lib/intelligence/discovery-response-normalization.ts";
import type { ProblemSynthesisResult } from "../lib/intelligence/problem-synthesis/index.ts";
import type { SolutionCategory, SolutionIntelligenceResult } from "../lib/engines/solution/index.ts";

function legacyProblem(suggested_solutions: string): DiscoveredProblem {
  return {
    problem_title: "Manual reporting is slow",
    problem_summary: "Teams lose time creating weekly reports.",
    affected_niches: "Agencies",
    suggested_solutions,
    pain_score: 8,
    revenue_score: 7,
    urgency_score: 7,
    trend_score: 6,
    buying_signal_score: 7,
    frequency_score: 8,
    source_quality_score: 8,
    opportunity_score: 80,
    problem_cluster: "Reporting",
    build_difficulty: "Medium",
    source_evidence: "Aggregate evidence summary.",
  };
}

function synthesis(): ProblemSynthesisResult {
  return {
    runId: "run-1",
    synthesizedAt: "2026-06-30T00:00:00.000Z",
    candidates: [{ synthesizedProblemTitle: "Manual reporting", synthesizedSummary: "Reporting takes too long.", suggestedSolutions: ["Reporting SaaS"], supportingEvidenceReferences: ["source:1"] } as ProblemSynthesisResult["candidates"][number]],
    diagnostics: [],
    warnings: [],
    summary: { evidenceCount: 1, candidateCount: 1, averageConfidence: 7, averageCompleteness: 0.8 },
  };
}

function solutionResult(category: SolutionCategory | null, confidence = 7): SolutionIntelligenceResult {
  return {
    runId: "run-1",
    evaluatedAt: "2026-06-30T00:00:00.000Z",
    evaluations: category ? [{ candidate: { category }, scoreBreakdown: { confidenceScore: confidence }, missingEvidence: ["pricing"], rationale: [], assumptions: [], risks: [], supportingEvidenceReferences: [] } as SolutionIntelligenceResult["evaluations"][number]] : [],
    rejectedCategories: [
      { category: "consulting", rejectedReasons: ["Lower scalability."], rationale: [], assumptions: [], risks: [], supportingEvidenceReferences: [], missingEvidence: [] },
      { category: "hardware", rejectedReasons: [], rationale: ["No physical workflow signal."], assumptions: [], risks: [], supportingEvidenceReferences: [], missingEvidence: [] },
    ],
    recommendation: category ? { recommendedCategory: category, recommendedCandidate: { category } as never, evaluation: { scoreBreakdown: { confidenceScore: confidence } } as never, rationale: [], assumptions: [], risks: [], supportingEvidenceReferences: [], missingEvidence: [], rejectedCategories: [] } : null,
    diagnostics: { evaluatedCategoryCount: category ? 13 : 0, rejectedCategoryCount: 2, recommendedCategory: category, lowConfidenceReasonCount: 1, missingEvidenceCount: 1, fallbackUsed: false, warnings: [] },
    warnings: [],
  };
}

test("compares legacy SaaS suggested solutions against a SaaS recommendation", () => {
  const metrics = buildSolutionShadowComparisonMetrics({ legacyProblems: [legacyProblem("SaaS dashboard | Workflow software")], problemSynthesis: synthesis(), solutionIntelligence: solutionResult("saas_software", 8) });

  assert.equal(metrics.legacySolutionCount, 2);
  assert.equal(metrics.saasSelected, true);
  assert.equal(metrics.nonSaasSelected, false);
  assert.equal(metrics.saasBiasDetected, false);
  assert.equal(metrics.disagreementCount, 0);
});

test("detects SaaS bias when legacy only suggests SaaS but Solution Intelligence recommends a non-SaaS category with confidence", () => {
  const metrics = buildSolutionShadowComparisonMetrics({ legacyProblems: [legacyProblem("SaaS platform | Analytics software")], problemSynthesis: synthesis(), solutionIntelligence: solutionResult("consulting", 7.4) });

  assert.equal(metrics.nonSaasSelected, true);
  assert.equal(metrics.saasBiasDetected, true);
  assert.equal(metrics.disagreementCount, 2);
});

test("missing recommendation produces safe diagnostics", () => {
  const metrics = buildSolutionShadowComparisonMetrics({ legacyProblems: [legacyProblem("SaaS platform")], problemSynthesis: synthesis(), solutionIntelligence: solutionResult(null) });

  assert.equal(metrics.recommendedCategory, null);
  assert.equal(metrics.recommendedCategoryConfidence, 0);
  assert.equal(metrics.saasBiasDetected, false);
  assert.match(metrics.warnings.join(" "), /did not produce a recommended category/);
});

test("counts rejected category reason coverage", () => {
  const metrics = buildSolutionShadowComparisonMetrics({ legacyProblems: [legacyProblem("SaaS platform")], problemSynthesis: synthesis(), solutionIntelligence: solutionResult("automation", 7) });

  assert.equal(metrics.rejectedCategoryReasonCoverage, 1);
  assert.equal(metrics.missingEvidenceCount, 1);
  assert.equal(metrics.lowConfidenceReasonCount, 1);
});

test("comparison is deterministic", () => {
  const input = { legacyProblems: [legacyProblem("SaaS platform | Analytics software")], problemSynthesis: synthesis(), solutionIntelligence: solutionResult("service", 7.2) };

  assert.deepEqual(buildSolutionShadowComparisonMetrics(input), buildSolutionShadowComparisonMetrics(input));
});
