import test from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, type SnapshotBuilderInput } from "../lib/intelligence/snapshots/index.ts";

const builderInput: SnapshotBuilderInput = {
  metadata: {
    snapshotId: "snapshot-discovery-1",
    discoveryId: "discovery-1",
    createdAt: "2026-07-08T00:00:00.000Z",
  },
  discoveryContext: {
    searchTopic: "agency client onboarding bottlenecks",
    searchIntent: "discover recurring operational pain",
    discoveryMode: "market_discovery",
    requestedLanguage: "en",
    requestedMarket: "Agencies",
    requestedAudience: "Agency owners",
    sourceProviders: ["data_moat", "external_search"],
    execution: {
      requestedAt: "2026-07-08T00:00:00.000Z",
      completedAt: "2026-07-08T00:01:00.000Z",
      configuration: {
        requestedMaxResults: 10,
        selectedSourceProviders: ["external_search", "data_moat"],
        discoveryMode: "market_discovery",
        language: "en",
        marketHint: "Agencies",
        audienceHint: "Agency owners",
      },
    },
  },
  problemIntelligence: {
    title: "Agency onboarding work is scattered across tools",
    summary: "Agency owners lose time coordinating onboarding work across spreadsheets, Slack, and email.",
    painDescription: "Repeated manual coordination creates delays and missed approvals.",
    affectedMarket: "Agencies",
    affectedAudience: "Agency owners",
    painSeverity: { value: 0.82, rationale: ["Multiple independent signals describe costly coordination pain."] },
    frequency: { value: 0.76 },
    urgency: { value: 0.7 },
    existingWorkarounds: ["Shared spreadsheets", "Manual Slack reminders"],
    relatedNiches: ["Client onboarding", "Agency operations"],
    evidenceIds: ["evidence-1", "evidence-2"],
  },
  opportunityIntelligence: {
    summary: "The repeated coordination pain suggests a focused workflow opportunity for client onboarding.",
    opportunityScore: { value: 0.79 },
    marketSizeSignals: ["Many agencies manage recurring client kickoffs."],
    competitiveSignals: ["Teams combine multiple generic tools instead of one focused workflow."],
    buildSimplicity: { value: 0.68 },
    willingnessToPay: { value: 0.73 },
    revenuePotential: { value: 0.71 },
    riskIndicators: ["Crowded project management alternatives"],
    validationIndicators: ["Manual workaround intensity"],
    evidenceIds: ["evidence-1", "evidence-2"],
  },
  evidence: [
    {
      evidenceId: "evidence-2",
      kind: "supporting_observation",
      relationship: "supports_opportunity",
      claim: "Agencies use several generic tools because onboarding work lacks a dedicated workflow.",
      supports: [{ section: "opportunity_intelligence", field: "competitive_signals" }],
      confidence: { value: 0.72 },
      provenanceIds: ["source-2"],
    },
    {
      evidenceId: "evidence-1",
      kind: "external_source",
      relationship: "supports_problem",
      sourceReference: {
        sourceId: "source-1",
        sourceType: "forum",
        sourceName: "Founder Forum",
        sourceUrl: "https://example.com/onboarding",
        capturedAt: "2026-07-07T00:00:00.000Z",
      },
      claim: "Agency owners repeatedly coordinate onboarding tasks across spreadsheets and Slack.",
      supports: [{ section: "problem_intelligence", field: "pain_description" }],
      confidence: { value: 0.81 },
      provenanceIds: ["source-1"],
    },
  ],
  confidence: {
    overall: { value: 0.78, rationale: ["Consistent problem and workaround evidence."] },
    evidence: { value: 0.77 },
    opportunity: { value: 0.74 },
    market: { value: 0.76 },
    calibration: {
      method: "heuristic",
      methodVersion: "1.0",
      scoreScale: { min: 0, max: 1, interpretation: "Higher means stronger confidence." },
    },
  },
  provenance: {
    discoveryOrigin: {
      discoveryId: "discovery-1",
      runId: "run-1",
    },
    engineAttribution: [
      { engineName: "problem-intelligence", engineVersion: "1.0", section: "problemIntelligence" },
      { engineName: "opportunity-intelligence", engineVersion: "1.0", section: "opportunityIntelligence" },
      { engineName: "confidence", engineVersion: "1.0", section: "confidence" },
    ],
    sourceReferences: [
      { sourceId: "source-1", sourceType: "forum", sourceName: "Founder Forum", sourceUrl: "https://example.com/onboarding" },
      { sourceId: "source-2", sourceType: "data_moat", sourceName: "Historical Observation", sourceUrl: null },
    ],
    evidenceLineage: [
      { evidenceId: "evidence-1", derivedFrom: ["source-1"] },
      { evidenceId: "evidence-2", derivedFrom: ["source-2"] },
    ],
    processingHistory: [
      { step: "discovery_completed", completedAt: "2026-07-08T00:01:00.000Z", version: "1.0" },
    ],
  },
};

test("buildSnapshot constructs one canonical immutable Snapshot from a Discovery-like input", () => {
  const snapshot = buildSnapshot(builderInput);

  assert.equal(snapshot.metadata.lifecycleState, "created");
  assert.equal(snapshot.metadata.contractVersion, "1.0");
  assert.equal(snapshot.problemIntelligence.title, builderInput.problemIntelligence.title);
  assert.equal(snapshot.opportunityIntelligence.summary, builderInput.opportunityIntelligence.summary);
  assert.deepEqual(snapshot.evidence.map((evidence) => evidence.evidenceId), ["evidence-1", "evidence-2"]);
  assert.equal(snapshot.diagnostics.processing[0].step, "snapshot_builder_scaffold");
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.metadata), true);
});

test("buildSnapshot is deterministic for equivalent inputs", () => {
  assert.deepEqual(buildSnapshot(builderInput), buildSnapshot(builderInput));
});

test("buildSnapshot normalizes provider names without preserving provider payloads", () => {
  const snapshot = buildSnapshot({
    ...builderInput,
    discoveryContext: {
      ...builderInput.discoveryContext,
      sourceProviders: ["external_search", "data_moat"],
      execution: {
        ...builderInput.discoveryContext.execution,
        configuration: {
          ...builderInput.discoveryContext.execution.configuration,
          selectedSourceProviders: ["external_search", "data_moat"],
        },
      },
    },
  });

  assert.deepEqual(snapshot.discoveryContext.sourceProviders, ["data_moat", "external_search"]);
  assert.deepEqual(snapshot.discoveryContext.execution.configuration?.selectedSourceProviders, [
    "data_moat",
    "external_search",
  ]);
  assert.doesNotMatch(JSON.stringify(snapshot), /raw|prompt|token|providerRequestId/i);
});
