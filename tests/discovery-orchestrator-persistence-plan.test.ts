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
import { evaluateDiscoveryPersistenceQuality } from "../lib/intelligence/discovery-persistence-quality-gates.ts";
import type { DiscoveryModularPipelineResult } from "../lib/intelligence/types.ts";
import type { ProblemSynthesisCandidate } from "../lib/intelligence/problem-synthesis/types.ts";

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

test("buildDiscoveryPersistencePlan prefers problem synthesis candidates when available", () => {
  const plan = buildDiscoveryPersistencePlan(createResult({
    outputs: {
      ...createResult().outputs,
      problemIntelligenceSynthesis: {
        runId: "planner-run",
        synthesizedAt: "2026-06-27T00:00:00.000Z",
        candidates: [
          {
            id: "synthesis-1",
            synthesizedProblemTitle: "Synthesized reporting operations bottleneck",
            synthesizedSummary: "Small agencies repeatedly lose delivery time because client reporting evidence is scattered across disconnected systems.",
            affectedMarkets: ["Agency services"],
            affectedAudiences: ["Small agencies"],
            suggestedSolutions: ["Automated evidence-backed report assembly"],
            conciseEvidenceSummary: "Agencies still copy weekly updates into spreadsheets. Repeated reporting friction appears in live sources.",
            canonicalProblemCluster: "Client reporting automation",
            scoreBreakdown: {
              painScore: 8.3,
              urgencyScore: 7.4,
              frequencyScore: 6.9,
              trendScore: 7.1,
              opportunityScore: 8.6,
              revenueScore: 7.7,
              buyingSignalScore: 7.8,
              sourceQualityScore: 8.9,
              confidenceScore: 8.2,
              totalScore: 7.99,
            },
            supportingEvidenceReferences: ["evidence-1 — Google Search — https://example.com/reporting"],
            confidence: 8.2,
            narrative: { title: "Synthesized reporting operations bottleneck", summary: "summary", primaryTheme: "Client reporting automation", rationale: [] },
            evidenceSummary: { evidenceCount: 2, sourceCount: 1, sourceNames: ["Google Search"], markets: ["Agency services"], audiences: ["Small agencies"], claims: [], references: [], summary: "summary" },
            diagnostics: { synthesizedTitle: "Synthesized reporting operations bottleneck", synthesizedSummary: "summary", evidenceCount: 2, evidenceReferences: [], confidence: 8.2, synthesisCompleteness: 1, engineCandidateCounts: { pain: 1, pattern: 1, trend: 1, opportunity: 1, monetization: 1, confidence: 1, feedback: 0 }, warnings: [] },
          },
        ],
        diagnostics: [],
        warnings: [],
        summary: { evidenceCount: 2, candidateCount: 1, averageConfidence: 8.2, averageCompleteness: 1 },
      },
    },
  } as unknown as Partial<DiscoveryModularPipelineResult>), { discoveryId: "discovery-1", userId: "user-1" });

  assert.equal(plan.rows[0].problem_title, "Synthesized reporting operations bottleneck");
  assert.equal(plan.rows[0].problem_summary, "Small agencies repeatedly lose delivery time because client reporting evidence is scattered across disconnected systems.");
  assert.equal(plan.rows[0].source_evidence, "Agencies still copy weekly updates into spreadsheets. Repeated reporting friction appears in live sources.");
  assert.equal(plan.rows[0].pain_score, 8.3);
  assert.equal(plan.rows[0].revenue_score, 7.7);
  assert.equal(plan.rows[0].urgency_score, 7.4);
  assert.equal(plan.rows[0].trend_score, 7.1);
  assert.equal(plan.rows[0].buying_signal_score, 7.8);
  assert.equal(plan.rows[0].frequency_score, 6.9);
  assert.equal(plan.rows[0].source_quality_score, 8.9);
  assert.equal(plan.rows[0].opportunity_score, 86);
  assert.equal(plan.diagnostics.source_candidate_counts.problem_synthesis, 1);
  assert.equal(plan.diagnostics.row_sources[0].source, "mixed_fallback");
  assert.equal(plan.diagnostics.field_sources_by_row[0].sources.problem_title, "orchestrator:problem_synthesis.synthesizedProblemTitle");
  assert.deepEqual(plan.diagnostics.score_mappings_by_row[0].mappings.opportunity_score, {
    source: "engine",
    inputScale: "0-10",
    persistedScale: "1-100",
    rawValue: 8.6,
    persistedValue: 86,
  });
});

test("buildDiscoveryPersistencePlan falls back to seed candidates when synthesis is missing", () => {
  const plan = buildDiscoveryPersistencePlan(createResult(), { discoveryId: "discovery-1", userId: "user-1" });

  assert.equal(plan.rows[0].problem_title, "Automated client reporting for agencies");
  assert.equal(plan.diagnostics.row_sources[0].source, "seed_fallback");
});


test("quality gates still reject weak synthesis-planned rows", () => {
  const plan = buildDiscoveryPersistencePlan(createResult({
    outputs: {
      problemIntelligenceSynthesis: {
        runId: "planner-run",
        synthesizedAt: "2026-06-27T00:00:00.000Z",
        candidates: [
          {
            id: "weak-synthesis",
            synthesizedProblemTitle: "Billing",
            synthesizedSummary: "Billing.",
            affectedMarkets: [],
            affectedAudiences: [],
            suggestedSolutions: [],
            conciseEvidenceSummary: "",
            canonicalProblemCluster: "",
            scoreBreakdown: { painScore: 1, urgencyScore: 1, frequencyScore: 1, trendScore: 1, opportunityScore: 1, revenueScore: 1, buyingSignalScore: 1, sourceQualityScore: 1, confidenceScore: 1, totalScore: 1 },
            supportingEvidenceReferences: [],
            confidence: 1,
            narrative: { title: "Billing", summary: "Billing.", primaryTheme: "", rationale: [] },
            evidenceSummary: { evidenceCount: 0, sourceCount: 0, sourceNames: [], markets: [], audiences: [], claims: [], references: [], summary: "" },
            diagnostics: { synthesizedTitle: "Billing", synthesizedSummary: "Billing.", evidenceCount: 0, evidenceReferences: [], confidence: 1, synthesisCompleteness: 0, engineCandidateCounts: { pain: 0, pattern: 0, trend: 0, opportunity: 0, monetization: 0, confidence: 0, feedback: 0 }, warnings: [] },
          },
        ],
        diagnostics: [],
        warnings: [],
        summary: { evidenceCount: 0, candidateCount: 1, averageConfidence: 1, averageCompleteness: 0 },
      },
    },
  } as unknown as Partial<DiscoveryModularPipelineResult>));
  const quality = evaluateDiscoveryPersistenceQuality(plan.rows, {
    fallbackFieldsByRow: plan.diagnostics.fallback_fields_by_row,
  });

  assert.equal(quality.allRowsPass, false);
  assert.equal(quality.rejectedRows.length, 1);
  assert.equal(quality.issues.some((issue) => issue.code === "title_too_short"), true);
  assert.equal(quality.issues.some((issue) => issue.code === "opportunity_score_too_low"), true);
});

test("buildDiscoveryPersistencePlan maps synthesis build difficulty from related opportunity token and audience signals", () => {
  const base = createResult();
  const plan = buildDiscoveryPersistencePlan(createResult({
    outputs: {
      ...base.outputs,
      problemIntelligenceSynthesis: {
        runId: "planner-run",
        synthesizedAt: "2026-06-27T00:00:00.000Z",
        candidates: [
          {
            id: "synthesis-token-match",
            synthesizedProblemTitle: "Automated client reporting bottleneck",
            synthesizedSummary: "Small agencies repeatedly lose delivery time assembling client reports from scattered systems.",
            affectedMarkets: ["Agency services"],
            affectedAudiences: ["Small agencies"],
            suggestedSolutions: ["Automated report assembly"],
            conciseEvidenceSummary: "Agencies still copy weekly updates into spreadsheets.",
            canonicalProblemCluster: "Client reporting automation",
            scoreBreakdown: { painScore: 8, urgencyScore: 8, frequencyScore: 8, trendScore: 7, opportunityScore: 8, revenueScore: 8, buyingSignalScore: 8, sourceQualityScore: 8, confidenceScore: 8, totalScore: 8 },
            supportingEvidenceReferences: [],
            confidence: 8,
            narrative: { title: "Automated client reporting bottleneck", summary: "summary", primaryTheme: "Client reporting automation", rationale: [] },
            evidenceSummary: { evidenceCount: 1, sourceCount: 1, sourceNames: ["Google Search"], markets: ["Agency services"], audiences: ["Small agencies"], claims: [], references: [], summary: "summary" },
            diagnostics: { synthesizedTitle: "Automated client reporting bottleneck", synthesizedSummary: "summary", evidenceCount: 1, evidenceReferences: [], confidence: 8, synthesisCompleteness: 1, engineCandidateCounts: { pain: 1, pattern: 1, trend: 1, opportunity: 1, monetization: 1, confidence: 1, feedback: 0 }, warnings: [] },
          },
        ],
        diagnostics: [],
        warnings: [],
        summary: { evidenceCount: 1, candidateCount: 1, averageConfidence: 8, averageCompleteness: 1 },
      },
      opportunityDetection: {
        candidates: [
          {
            ...base.outputs.opportunityDetection!.candidates[0],
            title: "Automated client reporting for agencies",
            normalizedTitle: "automated client reporting for agencies",
            score: { ...base.outputs.opportunityDetection!.candidates[0].score, buildSimplicityScore: 3 },
          },
          {
            ...base.outputs.opportunityDetection!.candidates[0],
            id: "opp-weaker-support",
            title: "Client reporting training for agencies",
            normalizedTitle: "client reporting training for agencies",
            score: { ...base.outputs.opportunityDetection!.candidates[0].score, buildSimplicityScore: 9, totalScore: 2, evidenceScore: 2, confidenceScore: 2 },
          },
        ],
      },
    },
  } as unknown as Partial<DiscoveryModularPipelineResult>));

  assert.equal(plan.rows[0].build_difficulty, "Hard");
  assert.deepEqual(plan.diagnostics.fallback_fields_by_row[0].fields, []);
  assert.equal(plan.diagnostics.build_difficulty_by_row[0].diagnostic.source, "mapped_opportunity_signal");
  assert.equal(plan.diagnostics.build_difficulty_by_row[0].diagnostic.opportunityCandidateId, "opp-1");
  assert.equal(plan.diagnostics.build_difficulty_by_row[0].diagnostic.rawBuildSimplicityScore, 3);
  assert.equal(plan.diagnostics.build_difficulty_by_row[0].diagnostic.fallbackAvoided, true);
  assert.match(plan.diagnostics.build_difficulty_by_row[0].diagnostic.matchReason, /token overlap/);
});

test("buildDiscoveryPersistencePlan maps synthesis build difficulty through selected synthesis cluster seed", () => {
  const base = createResult();
  const plan = buildDiscoveryPersistencePlan(createResult({
    outputs: {
      ...base.outputs,
      problemIntelligenceSynthesis: {
        runId: "planner-run",
        synthesizedAt: "2026-06-27T00:00:00.000Z",
        candidates: [
          {
            id: "synthesis-seed-match",
            synthesizedProblemTitle: "Invoice Approval Bottlenecks",
            synthesizedSummary: "Construction subcontractors lose payment visibility when invoice approvals move through scattered manual handoffs.",
            affectedMarkets: ["Construction"],
            affectedAudiences: ["Subcontractors"],
            suggestedSolutions: ["Approval tracking workflow"],
            conciseEvidenceSummary: "Construction teams need payment approval tracking.",
            canonicalProblemCluster: "Billing approval workflow",
            scoreBreakdown: { painScore: 8, urgencyScore: 8, frequencyScore: 8, trendScore: 7, opportunityScore: 8, revenueScore: 8, buyingSignalScore: 8, sourceQualityScore: 8, confidenceScore: 8, totalScore: 8 },
            supportingEvidenceReferences: [],
            confidence: 8,
            narrative: { title: "Invoice Approval Bottlenecks", summary: "summary", primaryTheme: "Billing approval workflow", rationale: [] },
            evidenceSummary: { evidenceCount: 2, sourceCount: 1, sourceNames: ["Review"], markets: ["Construction"], audiences: ["Subcontractors"], claims: [], references: [], summary: "summary" },
            diagnostics: {
              synthesizedTitle: "Invoice Approval Bottlenecks",
              synthesizedSummary: "summary",
              evidenceCount: 2,
              evidenceReferences: [],
              confidence: 8,
              synthesisCompleteness: 1,
              candidateCollapseReport: {
                rankedSeeds: [
                  {
                    title: "Construction subcontractor payment tracking",
                    normalizedTitle: "construction subcontractor payment tracking",
                    market: "construction",
                    audience: "subcontractors",
                    problemCluster: "billing approval workflow",
                    score: 8,
                    rejectionReasons: [],
                    engineSupport: ["opportunity", "pain"],
                    evidenceCount: 2,
                    genericTitle: false,
                    downrankedGeneric: false,
                    semanticTitle: "Invoice Approval Bottlenecks",
                    semanticTitleScore: 9,
                    rawTitleRejected: false,
                    rawTitleRejectionReasons: [],
                  },
                ],
              },
              engineCandidateCounts: { pain: 1, pattern: 0, trend: 0, opportunity: 1, monetization: 0, confidence: 0, feedback: 0 },
              warnings: [],
            } as unknown as ProblemSynthesisCandidate["diagnostics"],
          },
        ],
        diagnostics: [],
        warnings: [],
        summary: { evidenceCount: 2, candidateCount: 1, averageConfidence: 8, averageCompleteness: 1 },
      },
      opportunityDetection: {
        candidates: [
          {
            ...base.outputs.opportunityDetection!.candidates[0],
            id: "opp-invoice",
            title: "Construction subcontractor payment tracking",
            normalizedTitle: "construction subcontractor payment tracking",
            context: {
              ...base.outputs.opportunityDetection!.candidates[0].context,
              market: "Construction",
              audience: "Subcontractors",
              nicheCategory: "Invoice approvals",
              primaryTheme: "Billing approval workflow",
            },
            marketContext: {
              ...base.outputs.opportunityDetection!.candidates[0].marketContext,
              primaryProblem: "Construction subcontractors cannot track invoice approvals.",
            },
            score: { ...base.outputs.opportunityDetection!.candidates[0].score, buildSimplicityScore: 3 },
          },
        ],
      },
    },
  } as unknown as Partial<DiscoveryModularPipelineResult>));

  assert.equal(plan.rows[0].build_difficulty, "Hard");
  assert.deepEqual(plan.diagnostics.fallback_fields_by_row[0].fields, []);
  assert.equal(plan.diagnostics.build_difficulty_by_row[0].diagnostic.source, "mapped_opportunity_signal");
  assert.equal(plan.diagnostics.build_difficulty_by_row[0].diagnostic.opportunityCandidateId, "opp-invoice");
  assert.equal(plan.diagnostics.build_difficulty_by_row[0].diagnostic.rawBuildSimplicityScore, 3);
  assert.equal(plan.diagnostics.build_difficulty_by_row[0].diagnostic.fallbackAvoided, true);
  assert.equal(plan.diagnostics.build_difficulty_by_row[0].diagnostic.attribution, "synthesis_cluster_seed_match");
});
