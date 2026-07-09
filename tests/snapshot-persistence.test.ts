import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createSnapshotPersistenceInputFromPipeline,
  InMemorySnapshotPersistencePort,
  runSnapshotPipeline,
  type DiscoverySnapshotAdapterInput,
} from "../lib/intelligence/snapshots/index.ts";

const input: DiscoverySnapshotAdapterInput = {
  metadata: {
    snapshotId: "snapshot-persistence-1",
    discoveryId: "discovery-persistence-1",
    createdAt: "2026-07-08T00:00:00.000Z",
  },
  discoveryContext: {
    searchTopic: "agency onboarding bottlenecks",
    discoveryMode: "market_discovery",
    sourceProviders: ["external_search"],
  },
  problemIntelligence: {
    title: "Agency onboarding work is scattered across tools",
    summary: "Agency owners lose time coordinating onboarding work across spreadsheets, Slack, and email.",
    existingWorkarounds: ["Shared spreadsheets"],
    relatedNiches: ["Client onboarding"],
    evidenceIds: ["evidence-1"],
  },
  opportunityIntelligence: {
    summary: "The repeated coordination pain suggests a focused workflow opportunity for client onboarding.",
    marketSizeSignals: ["Many agencies manage recurring client kickoffs."],
    competitiveSignals: ["Teams combine multiple generic tools instead of one focused workflow."],
    riskIndicators: ["Crowded project management alternatives"],
    validationIndicators: ["Manual workaround intensity"],
    evidenceIds: ["evidence-1"],
  },
  evidence: [
    {
      evidenceId: "evidence-1",
      kind: "external_source",
      relationship: "supports_problem",
      claim: "Agency owners repeatedly coordinate onboarding tasks across spreadsheets and Slack.",
      supports: [{ section: "problem_intelligence", field: "summary" }],
      provenanceIds: ["source-1"],
    },
  ],
  confidence: { overall: { value: 0.78 } },
  provenance: {
    engineAttribution: [
      { engineName: "problem", engineVersion: "1.0", section: "problemIntelligence" },
      { engineName: "opportunity", engineVersion: "1.0", section: "opportunityIntelligence" },
      { engineName: "confidence", engineVersion: "1.0", section: "confidence" },
    ],
  },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test("createSnapshotPersistenceInputFromPipeline accepts only valid pipeline results", () => {
  const pipelineResult = runSnapshotPipeline(input);
  const persistenceInput = createSnapshotPersistenceInputFromPipeline(pipelineResult);

  assert.equal(persistenceInput.status, "accepted");
  if (persistenceInput.status !== "accepted") assert.fail("expected accepted persistence input");
  assert.equal(persistenceInput.input.snapshot.metadata.snapshotId, "snapshot-persistence-1");
  assert.equal(persistenceInput.input.validation.valid, true);
  assert.equal(
    persistenceInput.input.idempotencyKey,
    "discovery-persistence-1:snapshot-persistence-1:1.0",
  );
});

test("createSnapshotPersistenceInputFromPipeline rejects invalid Snapshots", () => {
  const invalidInput = clone(input);
  invalidInput.confidence = { overall: { value: 1.5 } };

  const pipelineResult = runSnapshotPipeline(invalidInput);
  const persistenceInput = createSnapshotPersistenceInputFromPipeline(pipelineResult);

  assert.equal(persistenceInput.status, "failure");
  if (persistenceInput.status !== "failure") assert.fail("expected failed persistence input");
  assert.equal(persistenceInput.persisted, false);
  assert.equal(persistenceInput.reason, "invalid_snapshot");
  assert.equal(persistenceInput.errors.some((error) => error.code === "SCORE_OUT_OF_RANGE"), true);
});

test("InMemorySnapshotPersistencePort is an explicit test double with no production side effects", () => {
  const persistenceInput = createSnapshotPersistenceInputFromPipeline(runSnapshotPipeline(input));
  assert.equal(persistenceInput.status, "accepted");
  if (persistenceInput.status !== "accepted") assert.fail("expected accepted persistence input");

  const port = new InMemorySnapshotPersistencePort();
  const result = port.persistSnapshot(persistenceInput.input);

  assert.equal(result.status, "success");
  assert.equal(result.persisted, true);
  assert.equal(port.persistedSnapshots.length, 1);
  assert.equal(port.persistedSnapshots[0].idempotencyKey, persistenceInput.input.idempotencyKey);
});

test("Snapshot persistence boundary has no database or workflow integration", () => {
  const source = readFileSync("lib/intelligence/snapshots/persistence.ts", "utf8");

  assert.doesNotMatch(source, /supabase|insert\(|upsert\(|update\(|delete\(|createClient|from\(["']/i);
  assert.doesNotMatch(source, /knowledge evolution|recommendation|feature flag|fetch\(/i);
});
