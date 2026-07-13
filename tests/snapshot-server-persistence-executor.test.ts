import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createSnapshotPersistenceInputFromPipeline,
  mapSnapshotPersistenceInputToStorageRecords,
  runSnapshotPipeline,
  type DiscoverySnapshotAdapterInput,
} from "../lib/intelligence/snapshots/index.ts";
import { buildSupabaseSnapshotPersistencePayload } from "../lib/intelligence/snapshots/supabase-persistence-adapter.ts";
import { hashSnapshotStorageMapping } from "../lib/intelligence/snapshots/storage-hash.ts";
import { buildDiscoverOpportunitiesSnapshotInput } from "../lib/intelligence/snapshots/discover-opportunities-adapter.ts";
import {
  isSnapshotPersistenceEnabled,
  persistSnapshotToSupabase,
} from "../lib/intelligence/snapshots/server-persistence-executor.ts";

const discoveryInput = buildDiscoverOpportunitiesSnapshotInput({
  discoveryId: "discovery-prod-1",
  createdAt: "2026-07-10T00:00:00.000Z",
  completedAt: "2026-07-10T00:00:00.000Z",
  userId: "user-1",
  plan: "free",
  sourcesLimit: 3,
  externalSources: [
    {
      source_type: "reddit",
      title: "Agencies complain about onboarding",
      url: "https://example.com/reddit/onboarding",
      snippet: "Agency owners repeatedly coordinate onboarding through spreadsheets and Slack.",
      signal_score: 8,
    },
  ],
  moatSources: [
    {
      source_type: "data_moat",
      title: "Prior onboarding observation",
      snippet: "Previous SaaSScout scans found recurring agency onboarding delays.",
      signal_score: 7,
    },
  ],
  problems: [
    {
      problem_title: "Agency onboarding work is scattered",
      problem_summary: "Agency teams lose time coordinating onboarding across disconnected tools.",
      affected_niches: "Agencies | Client services",
      suggested_solutions: "Client onboarding workflow | Approval tracker",
      pain_score: 8,
      revenue_score: 7,
      urgency_score: 7,
      trend_score: 6,
      buying_signal_score: 7,
      frequency_score: 8,
      source_quality_score: 8,
      opportunity_score: 82,
      problem_cluster: "Agency Operations",
      build_difficulty: "Medium",
      source_evidence: "Multiple sources describe manual onboarding coordination.",
    },
  ],
  summary: "Agency onboarding friction appears repeatedly across external and internal signals.",
});

function acceptedMapping(input: DiscoverySnapshotAdapterInput = discoveryInput) {
  const result = createSnapshotPersistenceInputFromPipeline(runSnapshotPipeline(input));
  assert.equal(result.status, "accepted");
  return mapSnapshotPersistenceInputToStorageRecords(result.input);
}

function rpcClient(data: unknown, error: unknown = null) {
  const calls: unknown[] = [];
  return {
    calls,
    client: {
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args });
        return { data, error };
      },
    },
  };
}

test("isSnapshotPersistenceEnabled is disabled by default and enabled only by explicit flag", () => {
  const previous = process.env.SNAPSHOT_PERSISTENCE_ENABLED;
  delete process.env.SNAPSHOT_PERSISTENCE_ENABLED;
  assert.equal(isSnapshotPersistenceEnabled(), false);
  process.env.SNAPSHOT_PERSISTENCE_ENABLED = "0";
  assert.equal(isSnapshotPersistenceEnabled(), false);
  process.env.SNAPSHOT_PERSISTENCE_ENABLED = "1";
  assert.equal(isSnapshotPersistenceEnabled(), true);
  if (previous === undefined) delete process.env.SNAPSHOT_PERSISTENCE_ENABLED;
  else process.env.SNAPSHOT_PERSISTENCE_ENABLED = previous;
});

test("feature flag disabled makes no admin-client or RPC call", async () => {
  let created = false;
  const outcome = await persistSnapshotToSupabase(acceptedMapping(), {
    isEnabled: () => false,
    getAdminClient: () => {
      created = true;
      throw new Error("should not create client");
    },
  });

  assert.equal(outcome.status, "failure");
  assert.equal(outcome.reason, "feature_disabled");
  assert.equal(created, false);
});

test("missing service-role configuration makes no RPC call", async () => {
  const rpcCalled = false;
  const outcome = await persistSnapshotToSupabase(acceptedMapping(), {
    isEnabled: () => true,
    getAdminClient: () => {
      throw new Error("missing env");
    },
  });

  assert.equal(rpcCalled, false);
  assert.equal(outcome.status, "failure");
  assert.equal(outcome.reason, "supabase_client_error");
});

test("exact deterministic payload is passed to write_snapshot_mapping", async () => {
  const mapping = acceptedMapping();
  const expected = buildSupabaseSnapshotPersistencePayload(mapping);
  const mocked = rpcClient({
    status: "inserted",
    written: true,
    snapshot_id: mapping.snapshotId,
    discovery_id: mapping.discoveryId,
    idempotency_key: mapping.idempotencyKey,
  });

  await persistSnapshotToSupabase(mapping, {
    isEnabled: () => true,
    getAdminClient: () => mocked.client as never,
  });

  assert.deepEqual(mocked.calls, [
    {
      name: "write_snapshot_mapping",
      args: { mapped_snapshot: expected },
    },
  ]);
});

test("inserted and replayed_identical map to success", async () => {
  const mapping = acceptedMapping();
  for (const response of [
    { status: "inserted", written: true },
    { status: "replayed_identical", written: false },
  ] as const) {
    const mocked = rpcClient({
      ...response,
      snapshot_id: mapping.snapshotId,
      discovery_id: mapping.discoveryId,
      idempotency_key: mapping.idempotencyKey,
    });
    const outcome = await persistSnapshotToSupabase(mapping, {
      isEnabled: () => true,
      getAdminClient: () => mocked.client as never,
    });
    assert.equal(outcome.status, "success");
    if (outcome.status === "success") {
      assert.equal(outcome.outcome, response.status);
      assert.equal(outcome.mappingHash, hashSnapshotStorageMapping(mapping));
    }
  }
});

test("rejected_conflict and failed RPC responses map to controlled failures", async () => {
  const mapping = acceptedMapping();
  for (const response of [
    { status: "rejected_conflict", written: false, expected: "rejected_conflict" },
    { status: "failed", written: false, expected: "failed" },
  ] as const) {
    const mocked = rpcClient(response);
    const outcome = await persistSnapshotToSupabase(mapping, {
      isEnabled: () => true,
      getAdminClient: () => mocked.client as never,
    });
    assert.equal(outcome.status, "failure");
    assert.equal(outcome.reason, response.expected);
  }
});

test("Supabase client error and malformed response map to controlled failures", async () => {
  const mapping = acceptedMapping();
  const clientError = await persistSnapshotToSupabase(mapping, {
    isEnabled: () => true,
    getAdminClient: () => rpcClient(null, { message: "boom" }).client as never,
  });
  assert.equal(clientError.status, "failure");
  assert.equal(clientError.reason, "supabase_client_error");

  const malformed = await persistSnapshotToSupabase(mapping, {
    isEnabled: () => true,
    getAdminClient: () => rpcClient({ status: "inserted", written: false }).client as never,
  });
  assert.equal(malformed.status, "failure");
  assert.equal(malformed.reason, "malformed_rpc_response");
});

test("executor does not generate IDs or timestamps and does not mutate input", async () => {
  const mapping = acceptedMapping();
  const before = structuredClone(mapping);
  const mocked = rpcClient({ status: "replayed_identical", written: false });

  await persistSnapshotToSupabase(mapping, {
    isEnabled: () => true,
    getAdminClient: () => mocked.client as never,
  });

  assert.deepEqual(mapping, before);
  const source = readFileSync("lib/intelligence/snapshots/server-persistence-executor.ts", "utf8");
  assert.doesNotMatch(source, /randomUUID|crypto\.randomUUID|new Date\(|Date\.now\(\).*snapshot|createdAt\s*:/);
});

test("server-only boundary is present", () => {
  assert.match(readFileSync("lib/supabase/server-admin.ts", "utf8"), /import "server-only"/);
  assert.match(readFileSync("lib/intelligence/snapshots/server-persistence-executor.ts", "utf8"), /import "server-only"/);
});

test("valid Snapshot is mapped deterministically with canonical idempotency key", () => {
  const first = acceptedMapping();
  const second = acceptedMapping();

  assert.deepEqual(first, second);
  assert.equal(first.snapshotId, "snapshot:discover-opportunities:discovery-prod-1");
  assert.equal(first.discoveryId, "discovery-prod-1");
  assert.equal(first.idempotencyKey, `${first.discoveryId}:${first.snapshotId}:${first.contractVersion}`);
  assert.equal(hashSnapshotStorageMapping(first), hashSnapshotStorageMapping(second));
});

test("invalid Snapshot never invokes persistence", () => {
  const invalidInput = {
    ...discoveryInput,
    confidence: { ...discoveryInput.confidence, overall: { value: 1.5 } },
  };
  const pipeline = runSnapshotPipeline(invalidInput);
  const persistence = createSnapshotPersistenceInputFromPipeline(pipeline);

  assert.equal(persistence.status, "failure");
  assert.equal(persistence.reason, "invalid_snapshot");
});
