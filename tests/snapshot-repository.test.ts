import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createSnapshotPersistenceInputFromPipeline,
  InMemorySnapshotRepositoryPort,
  mapSnapshotPersistenceInputToStorageRecords,
  runSnapshotPipeline,
  validateSnapshotRepositoryWriteInput,
  type DiscoverySnapshotAdapterInput,
  type SnapshotStorageMapping,
} from "../lib/intelligence/snapshots/index.ts";

const input: DiscoverySnapshotAdapterInput = {
  metadata: {
    snapshotId: "snapshot-repository-1",
    discoveryId: "discovery-repository-1",
    createdAt: "2026-07-09T00:00:00.000Z",
  },
  discoveryContext: {
    searchTopic: "founder research notes are hard to reuse",
    discoveryMode: "problem_discovery",
    sourceProviders: ["external_search"],
  },
  problemIntelligence: {
    title: "Founder research notes are not reusable intelligence",
    summary: "Founders repeatedly lose evidence context after researching markets in scattered documents.",
    existingWorkarounds: ["Manual spreadsheets"],
    relatedNiches: ["Market research"],
    evidenceIds: ["evidence-1"],
  },
  opportunityIntelligence: {
    summary: "Preserving research evidence as structured history creates reusable market intelligence.",
    marketSizeSignals: ["Founders frequently repeat similar market research tasks."],
    competitiveSignals: ["Generic notes tools do not preserve evidence lineage."],
    riskIndicators: ["Workflow adoption risk"],
    validationIndicators: ["Repeated manual evidence consolidation"],
    evidenceIds: ["evidence-1"],
  },
  evidence: [
    {
      evidenceId: "evidence-1",
      kind: "supporting_observation",
      relationship: "supports_problem",
      claim: "Research notes lose value when evidence lineage is not preserved.",
      supports: [{ section: "problem_intelligence", field: "summary" }],
      provenanceIds: ["source-1"],
    },
  ],
  confidence: { overall: { value: 0.76 } },
  provenance: {
    engineAttribution: [
      { engineName: "problem", engineVersion: "1.0", section: "problemIntelligence" },
      { engineName: "opportunity", engineVersion: "1.0", section: "opportunityIntelligence" },
      { engineName: "confidence", engineVersion: "1.0", section: "confidence" },
    ],
  },
};

function storageMapping(): SnapshotStorageMapping {
  const persistenceInput = createSnapshotPersistenceInputFromPipeline(runSnapshotPipeline(input));
  assert.equal(persistenceInput.status, "accepted");
  if (persistenceInput.status !== "accepted") assert.fail("expected accepted persistence input");
  return mapSnapshotPersistenceInputToStorageRecords(persistenceInput.input);
}

test("Snapshot repository boundary writes and reads only mapped storage records", () => {
  const mapping = storageMapping();
  const repository = new InMemorySnapshotRepositoryPort();
  const write = repository.writeSnapshotMapping({ mapping });

  assert.equal(write.status, "success");
  if (write.status !== "success") assert.fail("expected repository write success");
  assert.equal(write.written, true);
  assert.equal(write.snapshotId, "snapshot-repository-1");
  assert.equal(write.discoveryId, "discovery-repository-1");
  assert.equal(write.contractVersion, "1.0");
  assert.equal(write.idempotencyKey, mapping.idempotencyKey);
  assert.equal(write.recordCount, mapping.records.length);

  const read = repository.readSnapshotMapping({
    snapshotId: mapping.snapshotId,
    discoveryId: mapping.discoveryId,
    contractVersion: mapping.contractVersion,
    idempotencyKey: mapping.idempotencyKey,
  });

  assert.equal(read.status, "success");
  if (read.status !== "success") assert.fail("expected repository read success");
  assert.deepEqual(read.mapping, mapping);
});

test("Snapshot repository boundary rejects storage mappings with mismatched record identity", () => {
  const mapping = storageMapping();
  const invalid: SnapshotStorageMapping = {
    ...mapping,
    records: Object.freeze([
      { ...mapping.records[0], snapshotId: "different-snapshot" },
      ...mapping.records.slice(1),
    ]),
  };

  const issues = validateSnapshotRepositoryWriteInput({ mapping: invalid });
  assert.equal(issues.some((issue) => issue.reason === "record_identity_mismatch"), true);

  const repository = new InMemorySnapshotRepositoryPort();
  const write = repository.writeSnapshotMapping({ mapping: invalid });
  assert.equal(write.status, "failure");
  if (write.status !== "failure") assert.fail("expected repository write failure");
  assert.equal(write.reason, "record_identity_mismatch");
  assert.equal(write.issues.some((issue) => issue.reason === "record_identity_mismatch"), true);
});

test("Snapshot repository boundary rejects raw or empty inputs instead of Discovery pipeline input", () => {
  const rawDiscoveryLikeInput = input as unknown as SnapshotStorageMapping;
  const issues = validateSnapshotRepositoryWriteInput({ mapping: rawDiscoveryLikeInput });

  assert.equal(issues.some((issue) => issue.reason === "invalid_storage_mapping"), true);
  assert.equal(issues.some((issue) => issue.reason === "record_set_empty"), true);
});

test("Snapshot repository read has deterministic not-found failure shape", () => {
  const repository = new InMemorySnapshotRepositoryPort();
  const read = repository.readSnapshotMapping({
    snapshotId: "missing-snapshot",
    discoveryId: "missing-discovery",
    contractVersion: "1.0",
    idempotencyKey: "missing-discovery:missing-snapshot:1.0",
  });

  assert.equal(read.status, "failure");
  if (read.status !== "failure") assert.fail("expected repository read failure");
  assert.equal(read.reason, "not_found");
  assert.equal(read.issues[0].reason, "not_found");
});

test("Snapshot repository boundary has no database, SQL, API, UI, or production integration", () => {
  const source = readFileSync("lib/intelligence/snapshots/repository.ts", "utf8");

  assert.doesNotMatch(source, /createClient|from\(["']|select\s+.*\s+from|insert\s+into|update\s+.*\s+set|delete\s+from|migration/i);
  assert.doesNotMatch(source, /fetch\(|route\.ts|api\/|use client|feature flag|knowledge evolution|recommendation/i);
});
