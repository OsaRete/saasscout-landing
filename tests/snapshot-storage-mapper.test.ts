import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createSnapshotPersistenceInputFromPipeline,
  mapSnapshotPersistenceInputToStorageRecords,
  runSnapshotPipeline,
  type DiscoverySnapshotAdapterInput,
  type SnapshotStorageRecordKind,
} from "../lib/intelligence/snapshots/index.ts";

const input: DiscoverySnapshotAdapterInput = {
  metadata: {
    snapshotId: "snapshot-storage-1",
    discoveryId: "discovery-storage-1",
    createdAt: "2026-07-08T00:00:00.000Z",
  },
  discoveryContext: {
    searchTopic: "agency onboarding bottlenecks",
    searchIntent: "discover recurring workflow pain",
    discoveryMode: "market_discovery",
    requestedLanguage: "en",
    requestedMarket: "Agencies",
    requestedAudience: "Agency owners",
    sourceProviders: ["external_search", "data_moat"],
    execution: {
      requestedAt: "2026-07-08T00:00:00.000Z",
      completedAt: "2026-07-08T00:01:00.000Z",
      configuration: {
        selectedSourceProviders: ["external_search", "data_moat"],
        requestedMaxResults: 10,
      },
    },
  },
  problemIntelligence: {
    title: "Agency onboarding work is scattered across tools",
    summary: "Agency owners lose time coordinating onboarding work across spreadsheets, Slack, and email.",
    painDescription: "Repeated manual coordination creates delays and missed approvals.",
    affectedMarket: "Agencies",
    affectedAudience: "Agency owners",
    painSeverity: { value: 0.82 },
    existingWorkarounds: ["Shared spreadsheets"],
    relatedNiches: ["Client onboarding"],
    evidenceIds: ["evidence-1", "evidence-2"],
  },
  opportunityIntelligence: {
    summary: "The repeated coordination pain suggests a focused workflow opportunity for client onboarding.",
    opportunityScore: { value: 0.79 },
    marketSizeSignals: ["Many agencies manage recurring client kickoffs."],
    competitiveSignals: ["Teams combine multiple generic tools instead of one focused workflow."],
    riskIndicators: ["Crowded project management alternatives"],
    validationIndicators: ["Manual workaround intensity"],
    evidenceIds: ["evidence-1", "evidence-2"],
  },
  founderIntelligence: {
    founderScore: { value: 0.67 },
    founderFit: "Founder has agency operations experience.",
    founderAdvantages: ["Domain familiarity"],
    founderRisks: ["Limited distribution proof"],
    evidenceIds: ["evidence-2"],
  },
  evidence: [
    {
      evidenceId: "evidence-2",
      kind: "supporting_observation",
      relationship: "supports_opportunity",
      claim: "Agencies combine generic tools because onboarding work lacks a dedicated workflow.",
      supports: [
        { section: "opportunity_intelligence", field: "competitive_signals" },
        { section: "founder_intelligence", field: "founder_fit" },
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
      claim: "Agency owners repeatedly coordinate onboarding tasks across spreadsheets and Slack.",
      supports: [{ section: "problem_intelligence", field: "pain_description" }],
      confidence: { value: 0.81 },
      provenanceIds: ["source-1"],
    },
  ],
  confidence: { overall: { value: 0.78 }, evidence: { value: 0.77 }, opportunity: { value: 0.74 } },
  provenance: {
    discoveryOrigin: { discoveryId: "discovery-storage-1", runId: "run-storage-1" },
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

function acceptedPersistenceInput() {
  const result = createSnapshotPersistenceInputFromPipeline(runSnapshotPipeline(input));
  assert.equal(result.status, "accepted");
  if (result.status !== "accepted") assert.fail("expected accepted persistence input");
  return result.input;
}

test("mapSnapshotPersistenceInputToStorageRecords produces deterministic conceptual records", () => {
  const persistenceInput = acceptedPersistenceInput();
  const first = mapSnapshotPersistenceInputToStorageRecords(persistenceInput);
  const second = mapSnapshotPersistenceInputToStorageRecords(persistenceInput);

  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.records), true);
  assert.equal(first.snapshotId, "snapshot-storage-1");
  assert.equal(first.discoveryId, "discovery-storage-1");
  assert.equal(first.contractVersion, "1.0");
  assert.equal(first.idempotencyKey, "discovery-storage-1:snapshot-storage-1:1.0");
});

test("storage mapping splits identity, sections, evidence, provenance, and validation metadata", () => {
  const mapping = mapSnapshotPersistenceInputToStorageRecords(acceptedPersistenceInput());
  const kinds = mapping.records.map((record) => record.kind);
  const kindCounts = kinds.reduce<Record<SnapshotStorageRecordKind, number>>((counts, kind) => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    return counts;
  }, {} as Record<SnapshotStorageRecordKind, number>);

  assert.equal(kindCounts.snapshot_identity, 1);
  assert.equal(kindCounts.snapshot_section, 6);
  assert.equal(kindCounts.snapshot_evidence, 2);
  assert.equal(kindCounts.snapshot_evidence_support, 3);
  assert.equal(kindCounts.snapshot_provenance_source, 1);
  assert.equal(kindCounts.snapshot_evidence_lineage, 2);
  assert.equal(kindCounts.snapshot_engine_attribution, 3);
  assert.equal(kindCounts.snapshot_processing_history, 1);
  assert.equal(kindCounts.snapshot_validation, 1);

  assert.equal(mapping.records[0].kind, "snapshot_identity");
  assert.equal(mapping.records.at(-1)?.kind, "snapshot_validation");
});

test("storage records preserve identity, timestamps, evidence references, provenance, and validation", () => {
  const mapping = mapSnapshotPersistenceInputToStorageRecords(acceptedPersistenceInput());
  const evidenceRecord = mapping.records.find(
    (record) => record.kind === "snapshot_evidence" && record.evidenceId === "evidence-1",
  );
  const sourceRecord = mapping.records.find(
    (record) => record.kind === "snapshot_provenance_source" && record.source.sourceId === "source-1",
  );
  const validationRecord = mapping.records.find((record) => record.kind === "snapshot_validation");

  assert.equal(evidenceRecord?.createdAt, "2026-07-08T00:00:00.000Z");
  assert.deepEqual(evidenceRecord?.provenanceIds, ["source-1"]);
  assert.equal(evidenceRecord?.sourceReference?.capturedAt, "2026-07-07T00:00:00.000Z");
  assert.equal(sourceRecord?.source.sourceUrl, "https://example.com/onboarding");
  assert.equal(validationRecord?.validation.valid, true);
  assert.equal(validationRecord?.validation.summary.errorCount, 0);
});

test("storage mapper has no database, repository, workflow, or provider-payload behavior", () => {
  const source = readFileSync("lib/intelligence/snapshots/storage-mapper.ts", "utf8");
  const mappingJson = JSON.stringify(mapSnapshotPersistenceInputToStorageRecords(acceptedPersistenceInput()));

  assert.doesNotMatch(source, /supabase|createClient|from\(|insert\(|upsert\(|update\(|delete\(|fetch\(|repository|migration/i);
  assert.doesNotMatch(source, /knowledge evolution|recommendation|feature flag/i);
  assert.doesNotMatch(mappingJson, /rawProviderPayload|promptHistory|runtimeDebug|uiState|providerRequestId|tokenUsage/i);
});
