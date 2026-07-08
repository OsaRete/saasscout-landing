import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSnapshot,
  mapDiscoveryToSnapshotInput,
  type DiscoverySnapshotAdapterInput,
} from "../lib/intelligence/snapshots/index.ts";

const adapterInput: DiscoverySnapshotAdapterInput = {
  metadata: {
    snapshotId: "snapshot-agency-onboarding",
    discoveryId: "discovery-agency-onboarding",
    createdAt: "2026-07-08T00:00:00.000Z",
  },
  discoveryContext: {
    searchTopic: " agency client onboarding bottlenecks ",
    searchIntent: "discover recurring operational pain",
    discoveryMode: "market_discovery",
    requestedLanguage: "en",
    requestedMarket: "Agencies",
    requestedAudience: "Agency owners",
    sourceProviders: ["external_search", "data_moat", "data_moat"],
    requestedAt: "2026-07-08T00:00:00.000Z",
    completedAt: "2026-07-08T00:01:00.000Z",
    configuration: {
      requestedMaxResults: 10,
      selectedSourceProviders: [
        "external_search",
        "data_moat",
        "external_search",
      ],
      discoveryMode: "market_discovery",
      language: "en",
      marketHint: "Agencies",
      audienceHint: "Agency owners",
      includeFounderContext: true,
    },
  },
  problemIntelligence: {
    title: "Agency onboarding work is scattered across tools",
    summary:
      "Agency owners lose time coordinating onboarding work across spreadsheets, Slack, and email.",
    painDescription:
      "Repeated manual coordination creates delays and missed approvals.",
    affectedMarket: "Agencies",
    affectedAudience: "Agency owners",
    painSeverity: {
      value: 0.82,
      rationale: ["Costly coordination pain", "Recurring independent signals"],
    },
    frequency: { value: 0.76 },
    urgency: { value: 0.7 },
    existingWorkarounds: [
      "Manual Slack reminders",
      "Shared spreadsheets",
      "Shared spreadsheets",
    ],
    relatedNiches: ["Agency operations", "Client onboarding"],
    evidenceIds: ["evidence-2", "evidence-1", "evidence-1"],
  },
  opportunityIntelligence: {
    summary:
      "The repeated coordination pain suggests a focused workflow opportunity for client onboarding.",
    opportunityScore: { value: 0.79 },
    marketSizeSignals: ["Many agencies manage recurring client kickoffs."],
    competitiveSignals: [
      "Teams combine multiple generic tools instead of one focused workflow.",
    ],
    buildSimplicity: { value: 0.68 },
    willingnessToPay: { value: 0.73 },
    revenuePotential: { value: 0.71 },
    riskIndicators: ["Crowded project management alternatives"],
    validationIndicators: ["Manual workaround intensity"],
    evidenceIds: ["evidence-2", "evidence-1"],
  },
  founderIntelligence: {
    founderScore: { value: 0.64 },
    founderFit: "Strong agency operations experience.",
    technicalComplexity: { value: 0.52 },
    domainMatch: { value: 0.78 },
    distributionMatch: { value: 0.67 },
    executionDifficulty: { value: 0.58 },
    founderAdvantages: [
      "Agency network",
      "Onboarding experience",
      "Agency network",
    ],
    founderRisks: ["Crowded workflow market"],
    evidenceIds: ["evidence-3"],
  },
  evidence: [
    {
      evidenceId: "evidence-2",
      kind: "supporting_observation",
      relationship: "supports_opportunity",
      claim:
        "Agencies use several generic tools because onboarding work lacks a dedicated workflow.",
      supports: [
        { section: "opportunity_intelligence", field: "competitive_signals" },
        { section: "opportunity_intelligence", field: "validation_indicators" },
      ],
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
      claim:
        "Agency owners repeatedly coordinate onboarding tasks across spreadsheets and Slack.",
      supports: [
        { section: "problem_intelligence", field: "pain_description" },
      ],
      confidence: { value: 0.81 },
      provenanceIds: ["source-1"],
    },
    {
      evidenceId: "evidence-3",
      kind: "confidence_rationale",
      relationship: "supports_founder_intelligence",
      claim:
        "Founder context indicates direct experience running agency onboarding workflows.",
      supports: [{ section: "founder_intelligence", field: "founder_fit" }],
      provenanceIds: ["founder-profile-1"],
    },
  ],
  confidence: {
    overall: {
      value: 0.78,
      rationale: ["Consistent problem and workaround evidence."],
    },
    evidence: { value: 0.77 },
    opportunity: { value: 0.74 },
    founder: { value: 0.64 },
    market: { value: 0.76 },
    calibration: {
      method: "heuristic",
      methodVersion: "1.0",
      scoreScale: {
        min: 0,
        max: 1,
        interpretation: "Higher means stronger confidence.",
      },
    },
  },
  diagnostics: {
    items: [
      {
        diagnosticId: "diagnostic-2",
        category: "quality",
        severity: "info",
        code: "ENOUGH_EVIDENCE",
        message: "Discovery-like input included multiple supporting signals.",
        relatedEvidenceIds: ["evidence-1", "evidence-2"],
      },
      {
        diagnosticId: "diagnostic-1",
        category: "processing",
        severity: "info",
        code: "ADAPTER_ONLY",
        message:
          "Adapter mapped completed Discovery-like data without invoking Discovery.",
        relatedEvidenceIds: [],
      },
    ],
    processing: [
      {
        step: "discovery_to_snapshot_adapter",
        status: "completed",
        warnings: [],
      },
    ],
    metrics: { mappedEvidenceCount: 3, mappedSourceReferenceCount: 1 },
  },
  versions: {
    intelligence: "discovery-snapshot-adapter-test@1.0",
    normalization: "discovery-snapshot-adapter-test@1.0",
  },
  provenance: {
    runId: "run-agency-onboarding",
    engineAttribution: [
      {
        engineName: "opportunity-intelligence",
        engineVersion: "1.0",
        section: "opportunityIntelligence",
      },
      {
        engineName: "problem-intelligence",
        engineVersion: "1.0",
        section: "problemIntelligence",
      },
      {
        engineName: "founder-intelligence",
        engineVersion: "1.0",
        section: "founderIntelligence",
      },
      { engineName: "confidence", engineVersion: "1.0", section: "confidence" },
    ],
    processingHistory: [
      {
        step: "discovery_completed",
        completedAt: "2026-07-08T00:01:00.000Z",
        version: "1.0",
      },
    ],
  },
};

test("mapDiscoveryToSnapshotInput maps completed Discovery-like data into SnapshotBuilderInput", () => {
  const builderInput = mapDiscoveryToSnapshotInput(adapterInput);

  assert.equal(builderInput.metadata.snapshotId, "snapshot-agency-onboarding");
  assert.equal(
    builderInput.discoveryContext.searchTopic,
    "agency client onboarding bottlenecks",
  );
  assert.deepEqual(builderInput.discoveryContext.sourceProviders, [
    "data_moat",
    "external_search",
  ]);
  assert.deepEqual(builderInput.problemIntelligence.existingWorkarounds, [
    "Manual Slack reminders",
    "Shared spreadsheets",
  ]);
  assert.deepEqual(builderInput.problemIntelligence.evidenceIds, [
    "evidence-1",
    "evidence-2",
  ]);
  assert.deepEqual(
    builderInput.evidence.map((evidence) => evidence.evidenceId),
    ["evidence-1", "evidence-2", "evidence-3"],
  );
  assert.deepEqual(builderInput.evidence[1].supports, [
    { section: "opportunity_intelligence", field: "competitive_signals" },
    { section: "opportunity_intelligence", field: "validation_indicators" },
  ]);
  assert.equal(
    builderInput.founderIntelligence?.founderFit,
    "Strong agency operations experience.",
  );
  assert.equal(builderInput.confidence.overall.value, 0.78);
  assert.deepEqual(
    builderInput.diagnostics?.items.map((item) => item.diagnosticId),
    ["diagnostic-1", "diagnostic-2"],
  );
  assert.equal(
    builderInput.versions?.intelligence,
    "discovery-snapshot-adapter-test@1.0",
  );
  assert.deepEqual(builderInput.provenance.evidenceLineage[0], {
    evidenceId: "evidence-1",
    derivedFrom: ["source-1"],
  });
});

test("mapDiscoveryToSnapshotInput is deterministic for equivalent unordered inputs", () => {
  const first = mapDiscoveryToSnapshotInput(adapterInput);
  const second = mapDiscoveryToSnapshotInput({
    ...adapterInput,
    discoveryContext: {
      ...adapterInput.discoveryContext,
      sourceProviders: ["data_moat", "external_search"],
      configuration: {
        ...adapterInput.discoveryContext.configuration,
        selectedSourceProviders: ["data_moat", "external_search"],
      },
    },
    evidence: [...adapterInput.evidence].reverse(),
  });

  assert.deepEqual(first, second);
  assert.deepEqual(buildSnapshot(first), buildSnapshot(second));
});

test("mapDiscoveryToSnapshotInput excludes provider payloads, prompt history, runtime debug objects, and UI state", () => {
  const snapshot = buildSnapshot(mapDiscoveryToSnapshotInput(adapterInput));

  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /rawProviderPayload|promptHistory|runtimeDebug|uiState|providerRequestId/i,
  );
});
