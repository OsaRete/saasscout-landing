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
