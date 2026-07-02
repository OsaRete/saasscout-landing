import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ProblemIntelligenceSynthesisEngine } from "../lib/intelligence/problem-synthesis/synthesis.ts";

const evidence = [
  {
    sourceType: "external_source" as const,
    sourceName: "Founder Forum",
    sourceUrl: "https://example.com/one",
    capturedText: "Agency owners repeatedly complain that client onboarding tasks, assets, approvals, and status updates are scattered across spreadsheets and Slack.",
    extractedClaim: "Agency owners lose time because client onboarding is scattered across tools.",
    detectedProblemTitle: "Scattered client onboarding workflow",
    painIntensity: 8,
    frequencySignal: 9,
    buyingIntentSignal: 7,
    confidenceScore: 8,
    sourceQualityScore: 8,
    market: "Agencies",
    audience: "Agency owners",
    nicheCategory: "Client onboarding",
    capturedAt: "2026-01-01T00:00:00.000Z",
    provenance: {},
    deduplicationFingerprint: "evidence-a",
  },
  {
    sourceType: "data_moat" as const,
    sourceName: "Historical Scan",
    sourceUrl: "https://example.com/two",
    capturedText: "Several consultants mention recurring handoff mistakes when collecting forms, files, and approvals before kickoff.",
    extractedClaim: "Consultants experience recurring onboarding handoff mistakes before kickoff.",
    detectedProblemTitle: "Client onboarding handoff mistakes",
    painIntensity: 7,
    frequencySignal: 8,
    buyingIntentSignal: 6,
    confidenceScore: 7,
    sourceQualityScore: 7,
    market: "Consulting",
    audience: "Consultants",
    nicheCategory: "Client onboarding",
    capturedAt: "2026-01-02T00:00:00.000Z",
    provenance: {},
    deduplicationFingerprint: "evidence-b",
  },
];

function synthesize() {
  return new ProblemIntelligenceSynthesisEngine().run({
    evidence,
    runId: "synthesis-test",
    synthesizedAt: "2026-01-03T00:00:00.000Z",
    painDetection: { runId: "synthesis-test", detectedAt: "2026-01-03T00:00:00.000Z", candidates: [{ id: "pain-1", title: "Scattered client onboarding workflow", normalizedTitle: "scattered client onboarding workflow", context: { market: "Agencies", audience: "Agency owners", nicheCategory: "Client onboarding", knowledgeProblemId: null, relatedRelationshipIds: [] }, evidence: [], severity: "high", frequency: "persistent", score: { severityScore: 8, frequencyScore: 9, evidenceScore: 8, confidenceScore: 8, totalScore: 8.25, rationale: [] }, rank: 1 }], signals: [], warnings: [], summary: { evidenceCount: 2, signalCount: 1, candidateCount: 1, highestScore: 8.25, averageConfidence: 8 } },
    patternDetection: { runId: "synthesis-test", detectedAt: "2026-01-03T00:00:00.000Z", candidates: [{ id: "pattern-1", title: "Client onboarding workflow breakdown", normalizedTitle: "client onboarding workflow breakdown", context: { primaryTheme: "Client onboarding", markets: ["Agencies", "Consulting"], audiences: ["Agency owners", "Consultants"], niches: ["Client onboarding"], workflowTerms: ["handoff"], painCandidateIds: ["pain-1"], knowledgeProblemIds: [], relatedRelationshipIds: [] }, evidence: [], relationships: [], strength: "strong", frequency: "recurring", score: { themeScore: 8, relationshipScore: 8, frequencyScore: 8, evidenceScore: 8, confidenceScore: 8, totalScore: 8, rationale: [] }, rank: 1 }], signals: [], relationships: [], warnings: [], summary: { evidenceCount: 2, painCandidateCount: 1, signalCount: 1, relationshipCount: 0, candidateCount: 1, highestScore: 8, averageConfidence: 8 } },
    opportunityDetection: { runId: "synthesis-test", detectedAt: "2026-01-03T00:00:00.000Z", candidates: [{ id: "opp-1", title: "Automated client onboarding operating system", normalizedTitle: "automated client onboarding operating system", context: { market: "Agencies", audience: "Agency owners", nicheCategory: "Client onboarding", primaryTheme: "Client onboarding", painCandidateIds: ["pain-1"], patternCandidateIds: ["pattern-1"], trendCandidateIds: [], knowledgeProblemIds: [], relatedRelationshipIds: [] }, marketContext: { market: "Agencies", audience: "Agency owners", nicheCategory: "Client onboarding", primaryProblem: "Scattered client onboarding workflow", existingSolutionSignals: [], underservedSignals: ["handoff automation"] }, evidence: [], score: { marketPullScore: 8, problemUrgencyScore: 8, solutionPotentialScore: 9, buildSimplicityScore: 7, differentiationPotentialScore: 8, evidenceScore: 8, confidenceScore: 8, riskPenalty: 1, totalScore: 8.1, rationale: [] }, readiness: "ready", risk: "moderate", rank: 1 }], signals: [], warnings: [], summary: { evidenceCount: 2, painCandidateCount: 1, patternCandidateCount: 1, trendCandidateCount: 0, signalCount: 1, candidateCount: 1, highestScore: 8.1, averageConfidence: 8 } },
  });
}

test("problem synthesis turns multiple evidence items into one canonical problem candidate", () => {
  const synthesis = synthesize();
  assert.equal(synthesis.candidates.length, 1);
  assert.equal(synthesis.candidates[0].evidenceSummary.evidenceCount, 2);
  assert.deepEqual(synthesis.candidates[0].affectedAudiences.sort(), ["Agency owners", "Consultants"]);
});

test("problem synthesis combines engine outputs into a canonical title and concise evidence summary", () => {
  const candidate = synthesize().candidates[0];
  assert.match(candidate.synthesizedProblemTitle, /onboarding/i);
  assert.match(candidate.conciseEvidenceSummary, /Agency owners lose time/);
  assert.match(candidate.conciseEvidenceSummary, /Consultants experience recurring/);
});

test("problem synthesis preserves supporting evidence references and diagnostics", () => {
  const candidate = synthesize().candidates[0];
  assert.equal(candidate.supportingEvidenceReferences.length, 2);
  assert.ok(candidate.supportingEvidenceReferences.every((reference) => reference.includes("example.com")));
  assert.equal(candidate.diagnostics.evidenceCount, 2);
  assert.deepEqual(candidate.diagnostics.evidenceReferences, candidate.supportingEvidenceReferences);
  assert.equal(candidate.diagnostics.synthesizedTitle, candidate.synthesizedProblemTitle);
  assert.equal(candidate.diagnostics.synthesizedSummary, candidate.synthesizedSummary);
});

test("problem synthesis is deterministic for equivalent inputs", () => {
  assert.deepEqual(synthesize().candidates[0], synthesize().candidates[0]);
});

test("production discovery response shape remains unchanged because synthesis is only in modular outputs", () => {
  const typesSource = readFileSync("lib/intelligence/types.ts", "utf8");
  assert.match(typesSource, /problemIntelligenceSynthesis\?: ProblemSynthesisResult/);
  assert.doesNotMatch(typesSource, /export type DiscoveryResult = \{[\s\S]*problemIntelligenceSynthesis/);
});

test("problem synthesis diagnostics report candidate collapse counts without increasing emitted candidates", () => {
  const synthesis = synthesize();
  const report = synthesis.diagnostics[0].candidateCollapseReport;

  assert.equal(synthesis.candidates.length, 1);
  assert.deepEqual(report.upstreamCandidateCounts, {
    pain: 1,
    pattern: 1,
    trend: 0,
    opportunity: 1,
    monetization: 0,
    confidence: 0,
  });
  assert.equal(report.totalPossibleSynthesisSeedCount, 3);
  assert.equal(report.uniqueNormalizedTitleCount, 3);
  assert.equal(report.uniqueTitleMarketAudienceClusterCount, 3);
  assert.equal(report.eligibleSynthesisClusterCount, 3);
  assert.equal(report.emittedSynthesisCandidateCount, 1);
  assert.equal(report.rejectedSynthesisClusterCount, 2);
  assert.deepEqual(report.rejectionReasons, [{ reason: "single_candidate_mode_retains_only_top_ranked_cluster", count: 2 }]);
  assert.equal(report.singleCandidateMode, true);
  assert.match(report.collapseExplanation, /single-candidate mode/);
  assert.ok(report.topPotentialNextCandidateTitles.length <= 5);
});

test("problem synthesis seed diagnostics detect and down-rank generic titles while preserving one emitted candidate", () => {
  const synthesis = new ProblemIntelligenceSynthesisEngine().run({
    evidence,
    runId: "generic-seed-test",
    synthesizedAt: "2026-01-03T00:00:00.000Z",
    painDetection: {
      runId: "generic-seed-test",
      detectedAt: "2026-01-03T00:00:00.000Z",
      candidates: [
        { id: "pain-generic", title: "manual", normalizedTitle: "manual", context: { market: null, audience: null, nicheCategory: null, knowledgeProblemId: null, relatedRelationshipIds: [] }, evidence: [], severity: "high", frequency: "persistent", score: { severityScore: 9, frequencyScore: 9, evidenceScore: 1, confidenceScore: 5, totalScore: 9, rationale: [] }, rank: 1 },
        { id: "pain-specific", title: "Invoice approval delays for construction subcontractors", normalizedTitle: "invoice approval delays for construction subcontractors", context: { market: "Construction", audience: "Subcontractors", nicheCategory: "Invoice approvals", knowledgeProblemId: null, relatedRelationshipIds: [] }, evidence: [{ fingerprint: "seed-a", sourceType: "external_source", sourceName: "Forum", sourceUrl: null, capturedAt: "2026-01-01T00:00:00.000Z", claim: "Subcontractors wait weeks for invoice approvals after site changes.", painIntensity: 8, frequencySignal: 8, confidenceScore: 8, sourceQualityScore: 8 }], severity: "high", frequency: "persistent", score: { severityScore: 8, frequencyScore: 8, evidenceScore: 8, confidenceScore: 8, totalScore: 7, rationale: [] }, rank: 2 },
      ],
      signals: [],
      warnings: [],
      summary: { evidenceCount: 2, signalCount: 2, candidateCount: 2, highestScore: 9, averageConfidence: 8 },
    },
    opportunityDetection: {
      runId: "generic-seed-test",
      detectedAt: "2026-01-03T00:00:00.000Z",
      candidates: [{ id: "opp-specific", title: "Invoice approval delays for construction subcontractors", normalizedTitle: "invoice approval delays for construction subcontractors", context: { market: "Construction", audience: "Subcontractors", nicheCategory: "Invoice approvals", primaryTheme: "Invoice approvals", painCandidateIds: ["pain-specific"], patternCandidateIds: [], trendCandidateIds: [], knowledgeProblemIds: [], relatedRelationshipIds: [] }, marketContext: { market: "Construction", audience: "Subcontractors", nicheCategory: "Invoice approvals", primaryProblem: "Invoice approval delays for construction subcontractors", existingSolutionSignals: [], underservedSignals: ["approval tracking"] }, evidence: [{ fingerprint: "seed-b", sourceType: "external_source", sourceName: "Review", sourceUrl: null, capturedAt: "2026-01-02T00:00:00.000Z", claim: "Construction subcontractors need faster invoice approval tracking.", market: "Construction", audience: "Subcontractors", nicheCategory: "Invoice approvals", painIntensity: 8, frequencySignal: 8, buyingIntentSignal: 7, confidenceScore: 8, sourceQualityScore: 8 }], score: { marketPullScore: 8, problemUrgencyScore: 8, solutionPotentialScore: 8, buildSimplicityScore: 6, differentiationPotentialScore: 7, evidenceScore: 8, confidenceScore: 8, riskPenalty: 1, totalScore: 8, rationale: [] }, readiness: "ready", risk: "moderate", rank: 1 }],
      signals: [],
      warnings: [],
      summary: { evidenceCount: 2, painCandidateCount: 2, patternCandidateCount: 0, trendCandidateCount: 0, signalCount: 1, candidateCount: 1, highestScore: 8, averageConfidence: 8 },
    },
  });

  const report = synthesis.diagnostics[0].candidateCollapseReport;
  assert.equal(synthesis.candidates.length, 1);
  assert.equal(report.extractedSeedCount, 3);
  assert.equal(report.rankedSeedCount, 2);
  assert.equal(report.genericTitleSeedCount, 1);
  assert.equal(report.downrankedGenericSeedCount, 1);
  assert.equal(report.seedsWithCrossEngineSupport, 1);
  assert.ok(report.seedsWithoutEnoughEvidence >= 1);
  assert.equal(report.rankedSeeds.find((seed) => seed.normalizedTitle === "manual")?.genericTitle, true);
  assert.equal(report.rankedSeeds.find((seed) => seed.normalizedTitle === "manual")?.downrankedGeneric, true);
  assert.equal(report.topRankedSeedTitles[0], "Invoice approval delays for construction subcontractors");
  assert.ok(report.topRankedSeedScores[0] > (report.rankedSeeds.find((seed) => seed.normalizedTitle === "manual")?.score || 0));
});

test("semantic naming rejects raw evidence titles and preserves single candidate mode", () => {
  const synthesis = new ProblemIntelligenceSynthesisEngine().run({
    evidence,
    runId: "semantic-title-test",
    synthesizedAt: "2026-01-03T00:00:00.000Z",
    painDetection: { runId: "semantic-title-test", detectedAt: "2026-01-03T00:00:00.000Z", candidates: [{ id: "pain-raw", title: "evidence multiple signals sources manual workflows lead to errors", normalizedTitle: "evidence multiple signals sources manual workflows lead to errors", context: { market: "Agencies", audience: "Agency owners", nicheCategory: "Workflow automation", knowledgeProblemId: null, relatedRelationshipIds: [] }, evidence: [{ fingerprint: "raw-a", sourceType: "external_source", sourceName: "Reddit", sourceUrl: null, capturedAt: "2026-01-01T00:00:00.000Z", claim: "Agency owners describe manual workflow errors.", painIntensity: 8, frequencySignal: 8, confidenceScore: 8, sourceQualityScore: 8 }], severity: "high", frequency: "persistent", score: { severityScore: 9, frequencyScore: 9, evidenceScore: 8, confidenceScore: 8, totalScore: 9, rationale: [] }, rank: 1 }], signals: [], warnings: [], summary: { evidenceCount: 2, signalCount: 1, candidateCount: 1, highestScore: 9, averageConfidence: 8 } },
    opportunityDetection: { runId: "semantic-title-test", detectedAt: "2026-01-03T00:00:00.000Z", candidates: [{ id: "opp-semantic", title: "Workflow automation for agency operations", normalizedTitle: "workflow automation for agency operations", context: { market: "Agencies", audience: "Agency owners", nicheCategory: "Workflow automation", primaryTheme: "Agency workflow automation", painCandidateIds: ["pain-raw"], patternCandidateIds: [], trendCandidateIds: [], knowledgeProblemIds: [], relatedRelationshipIds: [] }, marketContext: { market: "Agencies", audience: "Agency owners", nicheCategory: "Workflow automation", primaryProblem: "manual workflows lead to errors", existingSolutionSignals: [], underservedSignals: ["workflow error prevention"] }, evidence: [{ fingerprint: "raw-b", sourceType: "external_source", sourceName: "Forum", sourceUrl: null, capturedAt: "2026-01-02T00:00:00.000Z", claim: "Agency workflow operations need error prevention.", market: "Agencies", audience: "Agency owners", nicheCategory: "Workflow automation", painIntensity: 8, frequencySignal: 8, buyingIntentSignal: 7, confidenceScore: 8, sourceQualityScore: 8 }], score: { marketPullScore: 8, problemUrgencyScore: 8, solutionPotentialScore: 8, buildSimplicityScore: 7, differentiationPotentialScore: 8, evidenceScore: 8, confidenceScore: 8, riskPenalty: 1, totalScore: 8.5, rationale: [] }, readiness: "ready", risk: "moderate", rank: 1 }], signals: [], warnings: [], summary: { evidenceCount: 2, painCandidateCount: 1, patternCandidateCount: 0, trendCandidateCount: 0, signalCount: 1, candidateCount: 1, highestScore: 8.5, averageConfidence: 8 } },
  });

  const report = synthesis.diagnostics[0].candidateCollapseReport;
  assert.equal(synthesis.candidates.length, 1);
  assert.equal(report.emittedSynthesisCandidateCount, 1);
  assert.doesNotMatch(synthesis.candidates[0].synthesizedProblemTitle, /evidence|multiple signals|lead to/i);
  assert.match(synthesis.candidates[0].synthesizedProblemTitle, /Workflow|Agency|Automation/i);
  assert.ok(report.rawTitlesRejected >= 1);
  assert.ok(report.semanticTitlesGenerated >= 1);
  assert.equal(report.semanticTitlesSelected, 1);
  assert.ok(report.semanticTitlesRejected >= 0);
  assert.ok(Array.isArray(report.semanticTitleRejectionReasons));
  assert.ok(report.semanticTitleCanonicalization.generatedCount >= 1);
  assert.ok(report.semanticTitleCanonicalization.uniqueCanonicalTitleCount >= 1);
  assert.ok(report.topSemanticTitles[0].score >= report.topSemanticTitles.at(-1)!.score);
  assert.deepEqual(synthesis.candidates[0], new ProblemIntelligenceSynthesisEngine().run({
    evidence,
    runId: "semantic-title-test",
    synthesizedAt: "2026-01-03T00:00:00.000Z",
    painDetection: synthesis.diagnostics[0].engineCandidateCounts.pain ? { runId: "semantic-title-test", detectedAt: "2026-01-03T00:00:00.000Z", candidates: [{ id: "pain-raw", title: "evidence multiple signals sources manual workflows lead to errors", normalizedTitle: "evidence multiple signals sources manual workflows lead to errors", context: { market: "Agencies", audience: "Agency owners", nicheCategory: "Workflow automation", knowledgeProblemId: null, relatedRelationshipIds: [] }, evidence: [{ fingerprint: "raw-a", sourceType: "external_source", sourceName: "Reddit", sourceUrl: null, capturedAt: "2026-01-01T00:00:00.000Z", claim: "Agency owners describe manual workflow errors.", painIntensity: 8, frequencySignal: 8, confidenceScore: 8, sourceQualityScore: 8 }], severity: "high", frequency: "persistent", score: { severityScore: 9, frequencyScore: 9, evidenceScore: 8, confidenceScore: 8, totalScore: 9, rationale: [] }, rank: 1 }], signals: [], warnings: [], summary: { evidenceCount: 2, signalCount: 1, candidateCount: 1, highestScore: 9, averageConfidence: 8 } } : undefined,
    opportunityDetection: { runId: "semantic-title-test", detectedAt: "2026-01-03T00:00:00.000Z", candidates: [{ id: "opp-semantic", title: "Workflow automation for agency operations", normalizedTitle: "workflow automation for agency operations", context: { market: "Agencies", audience: "Agency owners", nicheCategory: "Workflow automation", primaryTheme: "Agency workflow automation", painCandidateIds: ["pain-raw"], patternCandidateIds: [], trendCandidateIds: [], knowledgeProblemIds: [], relatedRelationshipIds: [] }, marketContext: { market: "Agencies", audience: "Agency owners", nicheCategory: "Workflow automation", primaryProblem: "manual workflows lead to errors", existingSolutionSignals: [], underservedSignals: ["workflow error prevention"] }, evidence: [{ fingerprint: "raw-b", sourceType: "external_source", sourceName: "Forum", sourceUrl: null, capturedAt: "2026-01-02T00:00:00.000Z", claim: "Agency workflow operations need error prevention.", market: "Agencies", audience: "Agency owners", nicheCategory: "Workflow automation", painIntensity: 8, frequencySignal: 8, buyingIntentSignal: 7, confidenceScore: 8, sourceQualityScore: 8 }], score: { marketPullScore: 8, problemUrgencyScore: 8, solutionPotentialScore: 8, buildSimplicityScore: 7, differentiationPotentialScore: 8, evidenceScore: 8, confidenceScore: 8, riskPenalty: 1, totalScore: 8.5, rationale: [] }, readiness: "ready", risk: "moderate", rank: 1 }], signals: [], warnings: [], summary: { evidenceCount: 2, painCandidateCount: 1, patternCandidateCount: 0, trendCandidateCount: 0, signalCount: 1, candidateCount: 1, highestScore: 8.5, averageConfidence: 8 } },
  }).candidates[0]);
});


test("semantic summary generation produces analyst-style problem summaries and diagnostics", () => {
  const synthesis = synthesize();
  const candidate = synthesis.candidates[0];
  const report = candidate.diagnostics.candidateCollapseReport;

  assert.match(candidate.synthesizedSummary, /client|agency|business|team/i);
  assert.match(candidate.synthesizedSummary, /causing|creating|reducing|increasing|slowing|weakening/i);
  assert.doesNotMatch(candidate.synthesizedSummary, /Evidence|Multiple sources|Weekly Intelligence|Data Moat|supported by/i);
  assert.ok(candidate.synthesizedSummary.split(/\s+/).length <= 40);
  assert.ok(report.semantic_summaries_generated >= 1);
  assert.ok(report.semantic_summaries_selected >= 1);
  assert.ok(report.average_summary_length >= 12);
  assert.equal(report.duplicated_summary_count, 0);
  assert.ok(report.summary_quality_distribution.average > 0);
  assert.ok(Array.isArray(report.summary_generation_rejections));
  assert.ok(Array.isArray(report.summary_generation_warnings));
});

test("problem synthesis multi-candidate diagnostics flag emits up to three quality-gated semantic candidates", () => {
  const previous = process.env.PROBLEM_SYNTHESIS_MULTI_CANDIDATE_DIAGNOSTICS;
  process.env.PROBLEM_SYNTHESIS_MULTI_CANDIDATE_DIAGNOSTICS = "1";

  const seedEvidence = [
    ...evidence,
    { ...evidence[0], deduplicationFingerprint: "evidence-c", market: "Construction", audience: "Subcontractors", nicheCategory: "Invoice approvals", extractedClaim: "Subcontractors repeatedly lose time waiting for invoice approvals.", detectedProblemTitle: "Invoice approval bottleneck" },
    { ...evidence[1], deduplicationFingerprint: "evidence-d", market: "Sales", audience: "Sales managers", nicheCategory: "CRM follow up", extractedClaim: "Sales managers miss customer follow ups because CRM handoffs are disconnected.", detectedProblemTitle: "Disconnected CRM follow up" },
  ];
  const engineCandidate = (id: string, title: string, normalizedTitle: string, market: string, audience: string, theme: string, rank: number) => ({
    id,
    title,
    normalizedTitle,
    context: { market, audience, nicheCategory: theme, primaryTheme: theme, primaryProblem: title, painCandidateIds: [], patternCandidateIds: [], trendCandidateIds: [], knowledgeProblemIds: [], relatedRelationshipIds: [] },
    marketContext: { market, audience, nicheCategory: theme, primaryProblem: title, existingSolutionSignals: [], underservedSignals: [theme] },
    evidence: [
      { fingerprint: `${id}-a`, sourceType: "external_source", sourceName: "Forum", sourceUrl: null, capturedAt: "2026-01-01T00:00:00.000Z", claim: `${audience} report repeated ${theme} problems.`, market, audience, nicheCategory: theme, painIntensity: 8, frequencySignal: 8, buyingIntentSignal: 7, confidenceScore: 8, sourceQualityScore: 8 },
      { fingerprint: `${id}-b`, sourceType: "external_source", sourceName: "Review", sourceUrl: null, capturedAt: "2026-01-02T00:00:00.000Z", claim: `${market} teams need better ${theme} coordination.`, market, audience, nicheCategory: theme, painIntensity: 8, frequencySignal: 8, buyingIntentSignal: 7, confidenceScore: 8, sourceQualityScore: 8 },
    ],
    score: { marketPullScore: 8, problemUrgencyScore: 8, solutionPotentialScore: 8, buildSimplicityScore: 7, differentiationPotentialScore: 8, evidenceScore: 8, confidenceScore: 8, totalScore: 8, rationale: [] },
    readiness: "ready" as const,
    risk: "moderate" as const,
    rank,
  });

  try {
    const synthesis = new ProblemIntelligenceSynthesisEngine().run({
      evidence: seedEvidence,
      runId: "multi-candidate-test",
      synthesizedAt: "2026-01-03T00:00:00.000Z",
      opportunityDetection: {
        runId: "multi-candidate-test",
        detectedAt: "2026-01-03T00:00:00.000Z",
        candidates: [
          engineCandidate("opp-onboarding", "Client onboarding workflow breakdown", "client onboarding workflow breakdown", "Agencies", "Agency owners", "Client onboarding", 1),
          engineCandidate("opp-invoice", "Invoice approval delays for subcontractors", "invoice approval delays for subcontractors", "Construction", "Subcontractors", "Invoice approvals", 2),
          engineCandidate("opp-crm", "Disconnected CRM follow up gaps", "disconnected crm follow up gaps", "Sales", "Sales managers", "CRM follow up", 3),
          engineCandidate("opp-extra", "Spreadsheet workflow reporting gaps", "spreadsheet workflow reporting gaps", "Accounting", "Controllers", "Spreadsheet workflow reporting", 4),
        ],
        signals: [],
        warnings: [],
        summary: { evidenceCount: 4, painCandidateCount: 0, patternCandidateCount: 0, trendCandidateCount: 0, signalCount: 4, candidateCount: 4, highestScore: 8, averageConfidence: 8 },
      },
      confidenceEvaluation: {
        runId: "multi-candidate-test",
        detectedAt: "2026-01-03T00:00:00.000Z",
        candidates: [
          engineCandidate("conf-onboarding", "Client onboarding workflow breakdown", "client onboarding workflow breakdown", "Agencies", "Agency owners", "Client onboarding", 1),
          engineCandidate("conf-invoice", "Invoice approval delays for subcontractors", "invoice approval delays for subcontractors", "Construction", "Subcontractors", "Invoice approvals", 2),
          engineCandidate("conf-crm", "Disconnected CRM follow up gaps", "disconnected crm follow up gaps", "Sales", "Sales managers", "CRM follow up", 3),
          engineCandidate("conf-extra", "Spreadsheet workflow reporting gaps", "spreadsheet workflow reporting gaps", "Accounting", "Controllers", "Spreadsheet workflow reporting", 4),
        ],
        signals: [],
        warnings: [],
        summary: { evidenceCount: 4, knowledgeProblemCount: 0, painCandidateCount: 0, patternCandidateCount: 0, trendCandidateCount: 0, opportunityCandidateCount: 4, monetizationCandidateCount: 0, founderFitCandidateCount: 0, signalCount: 4, candidateCount: 4, highestScore: 8, averageConfidence: 8 },
      },
    });

    const report = synthesis.diagnostics[0].candidateCollapseReport;
    assert.equal(synthesis.candidates.length, 3);
    assert.equal(report.multiCandidateModeEnabled, true);
    assert.equal(report.maxCandidateCount, 3);
    assert.equal(report.emittedCandidateCount, 3);
    assert.equal(report.rejectedCandidateCount, 1);
    assert.deepEqual(synthesis.candidates.map((candidate) => candidate.synthesizedProblemTitle), report.emittedCandidateTitles);
    assert.ok(synthesis.candidates.every((candidate) => !/evidence|reddit|lead to/i.test(candidate.synthesizedProblemTitle)));
    assert.ok(report.semanticTitleQualityScores.length >= 4);
  } finally {
    if (previous === undefined) delete process.env.PROBLEM_SYNTHESIS_MULTI_CANDIDATE_DIAGNOSTICS;
    else process.env.PROBLEM_SYNTHESIS_MULTI_CANDIDATE_DIAGNOSTICS = previous;
  }
});

test("problem synthesis multi-candidate diagnostics rejects weak generic raw and duplicate candidates", () => {
  const previous = process.env.PROBLEM_SYNTHESIS_MULTI_CANDIDATE_DIAGNOSTICS;
  process.env.PROBLEM_SYNTHESIS_MULTI_CANDIDATE_DIAGNOSTICS = "1";

  try {
    const weak = new ProblemIntelligenceSynthesisEngine().run({
      evidence,
      runId: "multi-rejection-test",
      synthesizedAt: "2026-01-03T00:00:00.000Z",
      opportunityDetection: {
        runId: "multi-rejection-test",
        detectedAt: "2026-01-03T00:00:00.000Z",
        candidates: [
          { id: "valid-a", title: "Client onboarding workflow breakdown", normalizedTitle: "client onboarding workflow breakdown", context: { market: "Agencies", audience: "Agency owners", nicheCategory: "Client onboarding", primaryTheme: "Client onboarding", painCandidateIds: [], patternCandidateIds: [], trendCandidateIds: [], knowledgeProblemIds: [], relatedRelationshipIds: [] }, marketContext: { market: "Agencies", audience: "Agency owners", nicheCategory: "Client onboarding", primaryProblem: "Client onboarding workflow breakdown", existingSolutionSignals: [], underservedSignals: ["handoff"] }, evidence: [{ fingerprint: "valid-a1", sourceType: "external_source", sourceName: "Forum", sourceUrl: null, capturedAt: "2026-01-01T00:00:00.000Z", claim: "Agency onboarding handoffs break repeatedly.", market: "Agencies", audience: "Agency owners", nicheCategory: "Client onboarding", painIntensity: 8, frequencySignal: 8, buyingIntentSignal: 7, confidenceScore: 8, sourceQualityScore: 8 }, { fingerprint: "valid-a2", sourceType: "external_source", sourceName: "Review", sourceUrl: null, capturedAt: "2026-01-02T00:00:00.000Z", claim: "Agencies need onboarding coordination.", market: "Agencies", audience: "Agency owners", nicheCategory: "Client onboarding", painIntensity: 8, frequencySignal: 8, buyingIntentSignal: 7, confidenceScore: 8, sourceQualityScore: 8 }], score: { marketPullScore: 8, problemUrgencyScore: 8, solutionPotentialScore: 8, buildSimplicityScore: 7, differentiationPotentialScore: 8, evidenceScore: 8, confidenceScore: 8, totalScore: 8, rationale: [] }, readiness: "ready", risk: "moderate", rank: 1 },
          { id: "dup-a", title: "Client onboarding workflow breakdown", normalizedTitle: "client onboarding workflow breakdown", context: { market: "Agencies", audience: "Agency owners", nicheCategory: "Client onboarding", primaryTheme: "Client onboarding", painCandidateIds: [], patternCandidateIds: [], trendCandidateIds: [], knowledgeProblemIds: [], relatedRelationshipIds: [] }, marketContext: { market: "Agencies", audience: "Agency owners", nicheCategory: "Client onboarding", primaryProblem: "Client onboarding workflow breakdown", existingSolutionSignals: [], underservedSignals: ["handoff"] }, evidence: [{ fingerprint: "dup-a1", sourceType: "external_source", sourceName: "Forum", sourceUrl: null, capturedAt: "2026-01-01T00:00:00.000Z", claim: "Duplicate onboarding problem.", market: "Agencies", audience: "Agency owners", nicheCategory: "Client onboarding", painIntensity: 8, frequencySignal: 8, buyingIntentSignal: 7, confidenceScore: 8, sourceQualityScore: 8 }], score: { marketPullScore: 8, problemUrgencyScore: 8, solutionPotentialScore: 8, buildSimplicityScore: 7, differentiationPotentialScore: 8, evidenceScore: 8, confidenceScore: 8, totalScore: 7.9, rationale: [] }, readiness: "ready", risk: "moderate", rank: 2 },
          { id: "generic-a", title: "manual", normalizedTitle: "manual", context: { market: null, audience: null, nicheCategory: null, primaryTheme: "manual", painCandidateIds: [], patternCandidateIds: [], trendCandidateIds: [], knowledgeProblemIds: [], relatedRelationshipIds: [] }, marketContext: { market: null, audience: null, nicheCategory: null, primaryProblem: "manual", existingSolutionSignals: [], underservedSignals: [] }, evidence: [], score: { marketPullScore: 8, problemUrgencyScore: 8, solutionPotentialScore: 8, buildSimplicityScore: 7, differentiationPotentialScore: 8, evidenceScore: 1, confidenceScore: 8, totalScore: 8, rationale: [] }, readiness: "ready", risk: "moderate", rank: 3 },
          { id: "raw-a", title: "evidence reddit sources manual workflows lead to errors", normalizedTitle: "evidence reddit sources manual workflows lead to errors", context: { market: "Operations", audience: "Operators", nicheCategory: "Workflow", primaryTheme: "Workflow", painCandidateIds: [], patternCandidateIds: [], trendCandidateIds: [], knowledgeProblemIds: [], relatedRelationshipIds: [] }, marketContext: { market: "Operations", audience: "Operators", nicheCategory: "Workflow", primaryProblem: "evidence reddit sources manual workflows lead to errors", existingSolutionSignals: [], underservedSignals: [] }, evidence: [{ fingerprint: "raw-a1", sourceType: "external_source", sourceName: "Reddit", sourceUrl: null, capturedAt: "2026-01-01T00:00:00.000Z", claim: "Operators mention workflow errors.", market: "Operations", audience: "Operators", nicheCategory: "Workflow", painIntensity: 8, frequencySignal: 8, buyingIntentSignal: 7, confidenceScore: 8, sourceQualityScore: 8 }], score: { marketPullScore: 8, problemUrgencyScore: 8, solutionPotentialScore: 8, buildSimplicityScore: 7, differentiationPotentialScore: 8, evidenceScore: 1, confidenceScore: 8, totalScore: 8, rationale: [] }, readiness: "ready", risk: "moderate", rank: 4 },
        ],
        signals: [],
        warnings: [],
        summary: { evidenceCount: 2, painCandidateCount: 0, patternCandidateCount: 0, trendCandidateCount: 0, signalCount: 4, candidateCount: 4, highestScore: 8, averageConfidence: 8 },
      },
    });

    const report = weak.diagnostics[0].candidateCollapseReport;
    assert.equal(weak.candidates.length, 0);
    assert.equal(report.multiCandidateModeEnabled, true);
    assert.ok(report.weakEvidenceRejectionCount >= 1);
    assert.ok(report.genericTitleRejectionCount >= 1);
    assert.ok(report.rejectionReasons.some((item) => item.reason === "weak_evidence_support"));
    assert.ok(report.rejectedCandidateTitles.every((title) => !/evidence reddit/i.test(title)));
  } finally {
    if (previous === undefined) delete process.env.PROBLEM_SYNTHESIS_MULTI_CANDIDATE_DIAGNOSTICS;
    else process.env.PROBLEM_SYNTHESIS_MULTI_CANDIDATE_DIAGNOSTICS = previous;
  }
});
