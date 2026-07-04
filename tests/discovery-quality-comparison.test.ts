import assert from "node:assert/strict";
import test from "node:test";

import { buildDiscoveryQualityComparison } from "../lib/intelligence/quality-comparison/index.ts";
import type { DiscoveredProblem } from "../lib/intelligence/discovery-response-normalization.ts";
import type { DiscoveryModularPipelineResult } from "../lib/intelligence/types.ts";

const legacyProblems = [
  {
    problem_title: "Manual client reporting bottlenecks",
    problem_summary: "Small agencies repeatedly spend non-billable time assembling weekly client reports from scattered dashboards and spreadsheets.",
    affected_niches: "Agencies | Client services | B2B consultants",
    suggested_solutions: "Automated report assembly | Client dashboard connector | Weekly insight digest",
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
    source_evidence: "Reddit and review sources mention recurring manual client reporting work with spreadsheet copy-paste.",
  },
] as DiscoveredProblem[];

function createResult(overrides: Partial<DiscoveryModularPipelineResult> = {}) {
  return {
    runId: "quality-run",
    dryRun: true,
    diagnostics: [],
    outputs: {
      problemIntelligenceSynthesis: {
        candidates: [
          {
            id: "synthesis-1",
            synthesizedProblemTitle: "Automated client reporting for agencies",
            synthesizedSummary: "Small agencies need automated report assembly because teams waste recurring time consolidating client updates from scattered tools.",
            affectedMarkets: ["Agency services"],
            affectedAudiences: ["Small agencies"],
            suggestedSolutions: ["Automated report assembly", "Client dashboard connector"],
            conciseEvidenceSummary: "Reddit source: Agencies still copy weekly updates into spreadsheets.",
            canonicalProblemCluster: "Client Operations",
            scoreBreakdown: { painScore: 8.2, urgencyScore: 8, frequencyScore: 8, trendScore: 7.6, opportunityScore: 8.4, revenueScore: 8.1, buyingSignalScore: 8.1, sourceQualityScore: 8.8, confidenceScore: 8.6, totalScore: 8.4 },
            supportingEvidenceReferences: ["https://example.com/reporting"],
            confidence: 8.6,
            narrative: { title: "Automated client reporting for agencies", summary: "Small agencies need automated report assembly because teams waste recurring time consolidating client updates from scattered tools.", primaryTheme: "Client Operations", rationale: [] },
            evidenceSummary: { evidenceCount: 1, sourceCount: 1, sourceNames: ["Reddit"], markets: ["Agency services"], audiences: ["Small agencies"], claims: ["Agencies still copy weekly updates into spreadsheets."], references: ["https://example.com/reporting"], summary: "Agencies still copy weekly updates into spreadsheets." },
            diagnostics: { synthesizedTitle: "Automated client reporting for agencies", synthesizedSummary: "Small agencies need automated report assembly because teams waste recurring time consolidating client updates from scattered tools.", evidenceCount: 1, evidenceReferences: ["https://example.com/reporting"], confidence: 8.6, synthesisCompleteness: 9, engineCandidateCounts: { pain: 1, pattern: 1, trend: 1, opportunity: 1, monetization: 1, confidence: 1, feedback: 0 }, warnings: [] },
          },
        ],
      },
      painDetection: {
        candidates: [
          {
            id: "pain-1",
            title: "Manual client reporting",
            normalizedTitle: "manual client reporting",
            context: { market: "Agency services", audience: "Small agencies", nicheCategory: "Client Operations" },
            evidence: [{ claim: "Agencies still copy weekly updates into spreadsheets.", sourceName: "Reddit" }],
            score: { totalScore: 8.2, frequencyScore: 8, evidenceScore: 9 },
          },
        ],
      },
      opportunityDetection: {
        candidates: [
          {
            id: "opp-1",
            title: "Automated client reporting for agencies",
            normalizedTitle: "automated client reporting for agencies",
            context: { market: "Agency services", audience: "Small agencies", nicheCategory: "Client Operations", primaryTheme: "Client Operations", painCandidateIds: ["pain-1"], patternCandidateIds: ["pattern-1"], trendCandidateIds: ["trend-1"] },
            marketContext: { primaryProblem: "Small agencies waste time assembling client reports from scattered tools.", underservedSignals: ["Automated report assembly"], existingSolutionSignals: ["Dashboard connectors"] },
            evidence: [{ claim: "Repeated reporting friction appears in live sources.", sourceName: "Reddit", sourceUrl: "https://example.com/reporting" }],
            score: { totalScore: 8.4, problemUrgencyScore: 8, marketPullScore: 7.8, buildSimplicityScore: 8, evidenceScore: 8.6 },
          },
        ],
      },
      monetizationEvaluation: { candidates: [{ normalizedTitle: "automated client reporting for agencies", score: { willingnessToPayScore: 8.1 } }] },
      confidenceEvaluation: { candidates: [{ normalizedTitle: "automated client reporting for agencies", score: { evidenceQualityScore: 8.8 } }] },
      semanticProblemDeduplication: { groups: [], summary: { groupCount: 1 } },
    },
    warnings: [],
    completedAt: "2026-06-27T00:00:00.000Z",
    ...overrides,
  } as unknown as DiscoveryModularPipelineResult;
}


const titleSpecificityBaseProblem = {
  problem_summary: "Teams lose time because recurring operational work breaks down across manual tools and unclear handoffs.",
  affected_niches: "Operations | Sales | Finance",
  suggested_solutions: "Diagnostic-only fixture",
  pain_score: 8,
  revenue_score: 8,
  urgency_score: 8,
  trend_score: 8,
  buying_signal_score: 8,
  frequency_score: 8,
  source_quality_score: 8,
  opportunity_score: 80,
  problem_cluster: "Operations",
  build_difficulty: "Medium",
  source_evidence: "Fixture evidence mentions recurring manual workflow issues in business operations.",
} satisfies Omit<DiscoveredProblem, "problem_title">;

function legacyTitleSpecificity(title: string) {
  const comparison = buildDiscoveryQualityComparison({
    legacyProblems: [{ ...titleSpecificityBaseProblem, problem_title: title }],
    orchestratorResult: createResult({ outputs: { opportunityDetection: { candidates: [] }, painDetection: { candidates: [] } } } as unknown as Partial<DiscoveryModularPipelineResult>),
  });

  return comparison.legacyMetrics.averageTitleSpecificity;
}

test("quality comparison scoring is deterministic for identical inputs", () => {
  assert.deepEqual(
    buildDiscoveryQualityComparison({ legacyProblems, orchestratorResult: createResult() }),
    buildDiscoveryQualityComparison({ legacyProblems, orchestratorResult: createResult() })
  );
});

test("quality comparison aggregates categories and selects winners", () => {
  const comparison = buildDiscoveryQualityComparison({ legacyProblems, orchestratorResult: createResult() });

  assert.equal(comparison.categories.length, 10);
  assert.equal(comparison.diagnostics.categoryCount, 10);
  assert.ok(["legacy", "modular", "tie", "insufficient_data"].includes(comparison.overallWinner));
  assert.ok(comparison.overallLegacyScore > 0);
  assert.ok(comparison.overallModularScore > 0);
});

test("fallback penalties reduce modular fallback score", () => {
  const comparison = buildDiscoveryQualityComparison({
    legacyProblems,
    orchestratorResult: createResult({ outputs: { opportunityDetection: { candidates: [] }, painDetection: { candidates: [] } } } as unknown as Partial<DiscoveryModularPipelineResult>),
  });

  assert.equal(comparison.modularMetrics.plannedRowCount, 0);
  assert.equal(comparison.modularMetrics.fallbackUsageScore, 0);
  assert.equal(comparison.categories.find((category) => category.category === "fallback_usage")?.winner, "legacy");
});

test("quality gate issues influence modular quality gate score", () => {
  const comparison = buildDiscoveryQualityComparison({
    legacyProblems,
    orchestratorResult: createResult({
      outputs: {
        opportunityDetection: {
          candidates: [
            {
              id: "bad-opp",
              title: "Bad",
              normalizedTitle: "bad",
              context: { market: "", audience: "", nicheCategory: "", painCandidateIds: [], patternCandidateIds: [], trendCandidateIds: [] },
              marketContext: { primaryProblem: "Bad", underservedSignals: [], existingSolutionSignals: [] },
              evidence: [],
              score: { totalScore: 1, problemUrgencyScore: 1, marketPullScore: 1, buildSimplicityScore: 1, evidenceScore: 1 },
            },
          ],
        },
      },
    } as unknown as Partial<DiscoveryModularPipelineResult>),
  });

  assert.ok(comparison.diagnostics.qualityGateIssueCount > 0);
  assert.ok(comparison.modularMetrics.qualityGateScore < 100);
});

test("title specificity rewards concise business-domain problem titles", () => {
  const strongTitles = [
    "Manual Sales Follow-up Automation",
    "Spreadsheet-Based Workflow Management",
    "Automated client reporting for agencies",
    "Disconnected CRM Workflow Operations",
    "Fragmented CRM Operations",
    "Manual Lead Qualification",
    "Client Onboarding Workflow Friction",
    "Invoice Approval Bottlenecks",
    "Operational Workflow Fragmentation",
    "Manual Workflow Fragmentation",
  ];

  for (const title of strongTitles) {
    assert.ok(legacyTitleSpecificity(title) >= 75, `${title} should score as semantically specific`);
  }
});

test("title specificity keeps generic titles lower than semantic problem titles", () => {
  const genericTitles = [
    "Workflow Automation",
    "Operations Bottlenecks",
    "Manual",
    "Business Problems",
    "Automation Tools",
    "Operations",
  ];

  for (const title of genericTitles) {
    assert.ok(legacyTitleSpecificity(title) <= 55, `${title} should remain a low-specificity diagnostic title`);
  }

  assert.ok(legacyTitleSpecificity("Invoice Approval Bottlenecks") > legacyTitleSpecificity("Operations Bottlenecks"));
  assert.ok(legacyTitleSpecificity("Fragmented CRM Operations") > legacyTitleSpecificity("Operations Bottlenecks"));
  assert.ok(legacyTitleSpecificity("Manual Lead Qualification") > legacyTitleSpecificity("Manual"));
  assert.ok(legacyTitleSpecificity("Manual Workflow Fragmentation") > legacyTitleSpecificity("Manual"));
});

test("quality comparison diagnostics explain market coverage fallback fields and synthesis compression", () => {
  const comparison = buildDiscoveryQualityComparison({ legacyProblems, orchestratorResult: createResult() });

  assert.deepEqual(comparison.diagnostics.marketCoverage.legacyUniqueAffectedNicheTokens, ["agencies", "b2b consultants", "client services"]);
  assert.deepEqual(comparison.diagnostics.marketCoverage.modularUniqueAffectedNicheTokens, ["agency services", "client operations", "small agencies"]);
  assert.equal(comparison.diagnostics.marketCoverage.calculation, "min(1, unique affected_niches token count / 5) * 100");
  assert.deepEqual(comparison.diagnostics.fallbackFieldsCounted, []);
  assert.deepEqual(comparison.diagnostics.fallbackFieldsByRow, [{ rowIndex: 0, fields: [] }]);
  assert.equal(comparison.diagnostics.buildDifficultyFallbackOnlyRowCount, 0);
  assert.deepEqual(comparison.diagnostics.buildDifficultyFallbackOnlyRows, []);
  assert.equal(comparison.diagnostics.buildDifficultyMappingByRow[0].diagnostic.source, "mapped_opportunity_signal");
  assert.equal(comparison.diagnostics.buildDifficultyMappingByRow[0].diagnostic.rawBuildSimplicityScore, 8);
  assert.equal(comparison.diagnostics.affectedNicheEnrichmentByRow[0].diagnostic.enrichedValueCount, 3);
  assert.deepEqual(comparison.diagnostics.affectedNicheEnrichmentByRow[0].diagnostic.addedValues, ["Client Operations"]);
  assert.equal(comparison.diagnostics.synthesisCompleteness.modularCandidateCount, 1);
  assert.equal(comparison.diagnostics.synthesisCompleteness.modularSynthesisCandidateCount, 1);
  assert.equal(comparison.diagnostics.synthesisCompleteness.representsCandidateCompressionRatio, true);
  assert.equal(comparison.diagnostics.synthesisCompleteness.representsTrueRowQuality, false);
  assert.match(comparison.diagnostics.synthesisCompleteness.explanation, /compression ratio/);
  assert.equal(comparison.diagnostics.synthesisCompressionRatio.score, comparison.modularMetrics.synthesisCompletenessScore);
  assert.equal(comparison.diagnostics.rowLevelSynthesisReadiness.plannedRowCount, 1);
});

test("quality comparison fallback usage still counts build difficulty when synthesis attribution is unclear", () => {
  const comparison = buildDiscoveryQualityComparison({
    legacyProblems,
    orchestratorResult: createResult({
      outputs: {
        ...createResult().outputs,
        opportunityDetection: {
          candidates: [
            {
              id: "opp-other",
              title: "Different opportunity title",
              normalizedTitle: "different opportunity title",
              context: { market: "Agency services", audience: "Small agencies", nicheCategory: "Client Operations", primaryTheme: "Client Operations", painCandidateIds: ["pain-1"], patternCandidateIds: [], trendCandidateIds: [] },
              marketContext: { primaryProblem: "Different opportunity signal.", underservedSignals: [], existingSolutionSignals: [] },
              evidence: [],
              score: { totalScore: 8.4, problemUrgencyScore: 8, marketPullScore: 7.8, buildSimplicityScore: 8, evidenceScore: 8.6 },
            },
          ],
        },
      },
    } as unknown as Partial<DiscoveryModularPipelineResult>),
  });

  assert.deepEqual(comparison.diagnostics.fallbackFieldsCounted, ["build_difficulty"]);
  assert.deepEqual(comparison.diagnostics.fallbackFieldsByRow, [{ rowIndex: 0, fields: ["build_difficulty"] }]);
  assert.equal(comparison.diagnostics.buildDifficultyMappingByRow[0].diagnostic.source, "fallback");
});
