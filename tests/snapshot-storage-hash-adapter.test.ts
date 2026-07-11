import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildSupabaseSnapshotPersistencePayload,
  createSnapshotPersistenceInputFromPipeline,
  hashSnapshotStorageMapping,
  hashSnapshotStorageRecord,
  mapSnapshotPersistenceInputToStorageRecords,
  runSnapshotPipeline,
  type DiscoverySnapshotAdapterInput,
  type SnapshotStorageMapping,
} from "../lib/intelligence/snapshots/index.ts";

const input: DiscoverySnapshotAdapterInput = {
  metadata: { snapshotId: "snapshot-hash-1", discoveryId: "discovery-hash-1", createdAt: "2026-07-10T00:00:00.000Z" },
  discoveryContext: { searchTopic: "support inbox triage", discoveryMode: "problem_discovery", sourceProviders: ["external_search"] },
  problemIntelligence: { title: "Support triage is manual", summary: "Teams manually classify inbound support", existingWorkarounds: ["spreadsheets"], relatedNiches: ["support"], evidenceIds: ["evidence-1"] },
  opportunityIntelligence: { summary: "Structured evidence supports triage automation", marketSizeSignals: ["many tickets"], competitiveSignals: ["generic tools"], riskIndicators: ["adoption"], validationIndicators: ["manual work"], evidenceIds: ["evidence-1"] },
  evidence: [{ evidenceId: "evidence-1", kind: "external_source", relationship: "supports_problem", claim: "Support teams manually classify tickets.", supports: [{ section: "problem_intelligence", field: "summary" }], provenanceIds: ["source-1"] }],
  confidence: { overall: { value: 0.7 } },
  provenance: { engineAttribution: [{ engineName: "problem", engineVersion: "1.0", section: "problemIntelligence" }], sourceReferences: [{ sourceId: "source-1" }], evidenceLineage: [{ evidenceId: "evidence-1", derivedFrom: ["source-1"] }], processingHistory: [{ step: "validated", completedAt: "2026-07-10T00:01:00.000Z", version: "1.0" }] },
};

function mapping(): SnapshotStorageMapping {
  const persistence = createSnapshotPersistenceInputFromPipeline(runSnapshotPipeline(input));
  assert.equal(persistence.status, "accepted");
  if (persistence.status !== "accepted") assert.fail("expected accepted persistence input");
  return mapSnapshotPersistenceInputToStorageRecords(persistence.input);
}

test("canonical storage hashing is deterministic and order-independent by storageKey", () => {
  const base = mapping();
  const reordered = { ...base, records: Object.freeze([...base.records].reverse()) };
  assert.equal(hashSnapshotStorageMapping(base), hashSnapshotStorageMapping(base));
  assert.equal(hashSnapshotStorageMapping(base), hashSnapshotStorageMapping(reordered));
  assert.match(hashSnapshotStorageMapping(base), /^sha256:[0-9a-f]{64}$/);
});

test("one canonical child-field change changes mappingHash", () => {
  const base = mapping();
  const changed = {
    ...base,
    records: Object.freeze(base.records.map((record) => record.kind === "snapshot_evidence" ? Object.freeze({ ...record, claim: `${record.claim} Changed.` }) : record)),
  };
  assert.notEqual(hashSnapshotStorageMapping(base), hashSnapshotStorageMapping(changed));
});

test("physical database fields are excluded but unknown runtime fields are rejected", () => {
  const base = mapping();
  const withPhysical = { ...base.records[0], id: "database-row", persisted_at: "2026-07-10T00:02:00.000Z" } as typeof base.records[number];
  assert.equal(hashSnapshotStorageRecord(base.records[0]), hashSnapshotStorageRecord(withPhysical));

  const withRuntime = { ...base.records[0], rawProviderPayload: { leaked: true } } as typeof base.records[number];
  assert.throws(() => hashSnapshotStorageRecord(withRuntime), /not part of the canonical/);
});

test("Supabase adapter produces exact enriched RPC payload shape without mutating input", () => {
  const base = mapping();
  const before = structuredClone(base);
  const payload = buildSupabaseSnapshotPersistencePayload(base);

  assert.deepEqual(base, before);
  assert.deepEqual(Object.keys(payload).sort(), ["contractVersion", "discoveryId", "idempotencyKey", "mappingHash", "records", "snapshotId"].sort());
  assert.equal(payload.mappingHash, hashSnapshotStorageMapping(base));
  assert.equal(payload.records.length, base.records.length);
  assert.equal(payload.records.every((record) => /^sha256:[0-9a-f]{64}$/.test(record.contentHash)), true);
  assert.equal(payload.records.find((record) => record.kind === "snapshot_processing_history")?.historyKey.includes("validated"), true);
});

test("Supabase adapter accepts mapper output and rejects unknown record kinds", () => {
  const base = mapping();
  assert.doesNotThrow(() => buildSupabaseSnapshotPersistencePayload(base));
  const invalid = { ...base, records: Object.freeze([{ ...base.records[0], kind: "unknown_kind" }, ...base.records.slice(1)] as typeof base.records) };
  assert.throws(() => buildSupabaseSnapshotPersistencePayload(invalid), /Unknown Snapshot storage record kind|canonical/);
});

test("static SQL migration guards Snapshot RPC contract blockers", () => {
  const sql = readFileSync("supabase/migrations/20260710000000_create_snapshot_persistence_schema.sql", "utf8");
  assert.match(sql, /record ->> 'kind' not in \('snapshot_identity','snapshot_section','snapshot_evidence','snapshot_evidence_support','snapshot_provenance_source','snapshot_evidence_lineage','snapshot_engine_attribution','snapshot_processing_history','snapshot_validation'\)/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended/);
  assert.doesNotMatch(sql, /ON CONFLICT DO UPDATE/i);
  assert.doesNotMatch(sql, /root_content_hash/);
  assert.match(sql, /record ->> 'contentHash'/);
  assert.match(sql, /snapshot_evidence_supports_owned_evidence_fk/);
  assert.match(sql, /snapshot_evidence_lineage_owned_evidence_fk/);
  assert.match(sql, /revoke all on function public\.write_snapshot_mapping\(jsonb\) from public, anon, authenticated/);
});

test("Supabase RPC response mapping covers inserted, replayed_identical, rejected_conflict, and failed", async () => {
  const { mapSupabaseSnapshotWriteResponse } = await import("../lib/intelligence/snapshots/index.ts");
  assert.deepEqual(mapSupabaseSnapshotWriteResponse({ status: "inserted", written: true, snapshot_id: "s", discovery_id: "d", idempotency_key: "k" }).status, "success");
  assert.equal(mapSupabaseSnapshotWriteResponse({ status: "inserted", written: true }).outcome, "inserted");
  assert.equal(mapSupabaseSnapshotWriteResponse({ status: "replayed_identical", written: false }).outcome, "replayed_identical");
  assert.equal(mapSupabaseSnapshotWriteResponse({ status: "rejected_conflict", written: false }).reason, "rejected_conflict");
  assert.equal(mapSupabaseSnapshotWriteResponse({ status: "failed", written: false }).reason, "failed");
});
