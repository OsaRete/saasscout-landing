import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  runSnapshotPipeline,
  type DiscoverySnapshotAdapterInput,
} from "../lib/intelligence/snapshots/index.ts";

const input: DiscoverySnapshotAdapterInput = {
  metadata: {
    snapshotId: "snapshot-pipeline-1",
    discoveryId: "discovery-pipeline-1",
    createdAt: "2026-07-08T00:00:00.000Z",
  },
  discoveryContext: {
    searchTopic: " agency onboarding bottlenecks ",
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
      selectedSourceProviders: ["external_search", "data_moat"],
      discoveryMode: "market_discovery",
      language: "en",
      marketHint: "Agencies",
      audienceHint: "Agency owners",
    },
  },
  problemIntelligence: {
    title: "Agency onboarding work is scattered across tools",
    summary: "Agency owners lose time coordinating onboarding work across spreadsheets, Slack, and email.",
    painDescription: "Repeated manual coordination creates delays and missed approvals.",
    affectedMarket: "Agencies",
    affectedAudience: "Agency owners",
    painSeverity: { value: 0.82 },
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
    overall: { value: 0.78 },
    evidence: { value: 0.77 },
    opportunity: { value: 0.74 },
    market: { value: 0.76 },
  },
  diagnostics: {
    items: [],
    processing: [{ step: "discovery_completed", status: "completed", warnings: [] }],
    metrics: { mappedEvidenceCount: 2 },
  },
  versions: {
    intelligence: "snapshot-pipeline-test@1.0",
    normalization: "snapshot-pipeline-test@1.0",
  },
  provenance: {
    runId: "run-pipeline-1",
    engineAttribution: [
      { engineName: "problem-intelligence", engineVersion: "1.0", section: "problemIntelligence" },
      { engineName: "opportunity-intelligence", engineVersion: "1.0", section: "opportunityIntelligence" },
      { engineName: "confidence", engineVersion: "1.0", section: "confidence" },
    ],
    processingHistory: [{ step: "discovery_completed", completedAt: "2026-07-08T00:01:00.000Z", version: "1.0" }],
  },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test("runSnapshotPipeline returns a successful Snapshot pipeline result", () => {
  const result = runSnapshotPipeline(input);

  assert.equal(result.valid, true);
  assert.equal(result.validation?.valid, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.snapshot?.metadata.snapshotId, "snapshot-pipeline-1");
  assert.deepEqual(result.summary.completedStages, ["mapping", "building", "validation"]);
  assert.equal(result.summary.snapshotCreated, true);
  assert.equal(result.summary.validationIncluded, true);
});

test("runSnapshotPipeline includes invalid Snapshot validation from bad input", () => {
  const invalidInput = clone(input);
  invalidInput.confidence = { ...invalidInput.confidence, overall: { value: 1.2 } };

  const result = runSnapshotPipeline(invalidInput);

  assert.equal(result.valid, false);
  assert.equal(result.validation?.valid, false);
  assert.equal(result.snapshot?.confidence.overall.value, 1.2);
  assert.equal(result.errors.some((error) => error.code === "SCORE_OUT_OF_RANGE"), true);
});


test("runSnapshotPipeline returns deterministic failure result when mapping fails", () => {
  const invalidInput = clone(input);
  invalidInput.metadata = { ...invalidInput.metadata, snapshotId: " " };

  const result = runSnapshotPipeline(invalidInput);

  assert.equal(result.valid, false);
  assert.equal(result.snapshot, undefined);
  assert.equal(result.validation, undefined);
  assert.equal(result.summary.failedStage, "mapping");
  assert.equal(result.errors[0].code, "SNAPSHOT_PIPELINE_MAPPING_FAILED");
});

test("runSnapshotPipeline is deterministic for repeated execution", () => {
  assert.deepEqual(runSnapshotPipeline(input), runSnapshotPipeline(input));
});

test("runSnapshotPipeline does not mutate Discovery-like input", () => {
  const mutableInput = clone(input);
  const before = clone(mutableInput);

  runSnapshotPipeline(mutableInput);

  assert.deepEqual(mutableInput, before);
});

test("runSnapshotPipeline has no persistence or production side-effect dependencies", () => {
  const pipelineSource = readFileSync("lib/intelligence/snapshots/pipeline.ts", "utf8");

  assert.doesNotMatch(pipelineSource, /supabase|from\s+["']node:fs|insert\(|upsert\(|update\(|delete\(|fetch\(/i);
  assert.doesNotMatch(pipelineSource, /knowledge evolution|recommendation|memory|feature flag/i);
});

test("runSnapshotPipeline includes the validation result", () => {
  const result = runSnapshotPipeline(input);

  assert.ok(result.validation);
  assert.equal(result.validation.summary.evidenceCount, 2);
  assert.deepEqual(result.errors, result.validation.errors);
  assert.deepEqual(result.warnings, result.validation.warnings);
});
