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

function identityWithVersionsValue(value: unknown): SnapshotStorageMapping["records"][number] {
  const identity = mapping().records.find((record) => record.kind === "snapshot_identity");
  assert.ok(identity);
  if (!identity || identity.kind !== "snapshot_identity") assert.fail("expected identity record");

  return {
    ...identity,
    versions: {
      ...identity.versions,
      canonicalTestValue: value,
    },
  } as typeof identity;
}

test("canonical storage hashing is deterministic and order-independent by storageKey", () => {
  const base = mapping();
  const reordered = { ...base, records: Object.freeze([...base.records].reverse()) };
  assert.equal(hashSnapshotStorageMapping(base), hashSnapshotStorageMapping(base));
  assert.equal(hashSnapshotStorageMapping(base), hashSnapshotStorageMapping(reordered));
  assert.match(hashSnapshotStorageMapping(base), /^sha256:[0-9a-f]{64}$/);
});

test("canonical storage hashing accepts supported primitive, array, and plain-object values", () => {
  const supportedValues = [
    null,
    0,
    42,
    0.125,
    -7,
    true,
    false,
    "2026-07-10T00:01:00.000Z",
    ["alpha", 1, false, null, { nested: "value" }],
    { z: "last", a: { nested: ["first", 2] } },
  ];

  for (const value of supportedValues) {
    assert.match(hashSnapshotStorageRecord(identityWithVersionsValue(value)), /^sha256:[0-9a-f]{64}$/);
  }
});

test("canonical storage hashing rejects ambiguous unsupported runtime values", () => {
  class CustomSnapshotValue {
    readonly value = "custom";
  }
  const customPrototype = Object.create({ inherited: "unsupported" }) as Record<string, unknown>;
  customPrototype.value = "custom-prototype";
  const unsupportedValues: readonly [string, unknown, RegExp][] = [
    ["NaN", Number.NaN, /Non-finite numbers/],
    ["Infinity", Infinity, /Non-finite numbers/],
    ["-Infinity", -Infinity, /Non-finite numbers/],
    ["Date", new Date("2026-07-10T00:00:00.000Z"), /Date objects are not valid/],
    ["invalid Date", new Date("not-a-date"), /Date objects are not valid/],
    ["Map", new Map([["key", "value"]]), /Unsupported non-plain object/],
    ["Set", new Set(["value"]), /Unsupported non-plain object/],
    ["RegExp", /snapshot/u, /Unsupported non-plain object/],
    ["URL", new URL("https://example.com"), /Unsupported non-plain object/],
    ["Error", new Error("snapshot"), /Unsupported non-plain object/],
    ["custom class", new CustomSnapshotValue(), /Unsupported non-plain object/],
    ["function", () => "unsupported", /Unsupported Snapshot storage hash value type/],
    ["symbol", Symbol("snapshot"), /Unsupported Snapshot storage hash value type/],
    ["bigint", BigInt(1), /Unsupported Snapshot storage hash value type/],
    ["custom prototype", customPrototype, /Unsupported non-plain object/],
  ];

  for (const [label, value, message] of unsupportedValues) {
    assert.throws(() => hashSnapshotStorageRecord(identityWithVersionsValue(value)), message, label);
  }
});

test("canonical storage hashing omits undefined object properties but rejects undefined array elements", () => {
  const omittedUndefined = identityWithVersionsValue({ stable: "value", optional: undefined });
  const omittedUndefinedEquivalent = identityWithVersionsValue({ stable: "value" });
  assert.equal(hashSnapshotStorageRecord(omittedUndefined), hashSnapshotStorageRecord(omittedUndefinedEquivalent));

  const arrayUndefined = identityWithVersionsValue(["stable", undefined]);
  assert.throws(() => hashSnapshotStorageRecord(arrayUndefined), /Undefined is not a valid canonical Snapshot storage value/);
});

test("canonical storage hashing is independent of object key order and uses lexical record ordering", () => {
  const left = identityWithVersionsValue({ zebra: 1, Alpha: 2, alpha: { beta: true, Beta: false } });
  const right = identityWithVersionsValue({ alpha: { Beta: false, beta: true }, zebra: 1, Alpha: 2 });
  assert.equal(hashSnapshotStorageRecord(left), hashSnapshotStorageRecord(right));

  const base = mapping();
  const lexicalOrder = {
    ...base,
    records: Object.freeze([...base.records].sort((leftRecord, rightRecord) => (leftRecord.storageKey < rightRecord.storageKey ? -1 : leftRecord.storageKey > rightRecord.storageKey ? 1 : 0))),
  };
  const reverseOrder = { ...base, records: Object.freeze([...lexicalOrder.records].reverse()) };
  assert.equal(hashSnapshotStorageMapping(lexicalOrder), hashSnapshotStorageMapping(reverseOrder));
});

test("canonical storage hashing implementation does not depend on localeCompare", () => {
  const hashSource = readFileSync("lib/intelligence/snapshots/storage-hash.ts", "utf8");
  const mapperSource = readFileSync("lib/intelligence/snapshots/storage-mapper.ts", "utf8");
  assert.doesNotMatch(hashSource, /localeCompare/);
  assert.doesNotMatch(mapperSource, /localeCompare/);
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
  assert.match(sql, /r\.record_json ->> 'kind' not in \('snapshot_identity','snapshot_section','snapshot_evidence','snapshot_evidence_support','snapshot_provenance_source','snapshot_evidence_lineage','snapshot_engine_attribution','snapshot_processing_history','snapshot_validation'\)/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended/);
  assert.doesNotMatch(sql, /ON CONFLICT DO UPDATE/i);
  assert.doesNotMatch(sql, /root_content_hash/);
  assert.doesNotMatch(sql, /\n\s*record jsonb;/);
  assert.doesNotMatch(sql, /as\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(record\)/i);
  assert.doesNotMatch(sql, /\brecord\s*(?:->>|->|#>>|#>)/);
  assert.match(sql, /jsonb_array_elements\(records\) as r\(record_json\)/);
  assert.match(sql, /r\.record_json ->> 'contentHash'/);
  assert.match(sql, /mapped_record ->> 'storageKey'/);
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
  assert.throws(() => mapSupabaseSnapshotWriteResponse({ status: "unexpected", written: false } as never), /Invalid Supabase Snapshot RPC response status/);
  assert.throws(() => mapSupabaseSnapshotWriteResponse({ written: false } as never), /Invalid Supabase Snapshot RPC response status/);
  assert.throws(() => mapSupabaseSnapshotWriteResponse({ status: "inserted", written: false }), /inserted responses must have written=true/);
  assert.throws(() => mapSupabaseSnapshotWriteResponse({ status: "replayed_identical", written: true }), /replayed_identical responses must have written=false/);
  assert.throws(() => mapSupabaseSnapshotWriteResponse({ status: "rejected_conflict", written: true }), /rejected_conflict responses must have written=false/);
});
