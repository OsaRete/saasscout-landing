import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createSupabaseSnapshotRetrievalRepository, type SupabaseSnapshotRetrievalClient } from "../lib/intelligence/snapshots/retrieval/supabase-repository.ts";
import type { SnapshotRetrievalQuery } from "../lib/intelligence/snapshots/retrieval/index.ts";

type Row = Record<string, unknown>;
type Op = { table: string; op: string; column?: string; value?: unknown };

const baseQuery: SnapshotRetrievalQuery = { rawQueryText: "agency onboarding", userId: "user-1", referenceTimestamp: "2026-07-13T00:00:00.000Z", maxCandidates: 50 };
const fixtures = () => ({
  opportunity_discoveries: [{ id: "disc-1", user_id: "user-1" }, { id: "disc-2", user_id: "user-2" }],
  snapshot_identities: [
    { id: "ident-1", snapshot_id: "snap-1", discovery_id: "disc-1", contract_version: "1", lifecycle_state: "persisted", created_at: "2026-07-10T00:00:00.000Z" },
    { id: "ident-other", snapshot_id: "snap-other", discovery_id: "disc-2", contract_version: "1", lifecycle_state: "persisted", created_at: "2026-07-11T00:00:00.000Z" },
    { id: "ident-invalid", snapshot_id: "snap-invalid", discovery_id: "disc-1", contract_version: "1", lifecycle_state: "rejected", created_at: "2026-07-12T00:00:00.000Z" },
    { id: "ident-old", snapshot_id: "snap-old", discovery_id: "disc-1", contract_version: "1", lifecycle_state: "persisted", created_at: "2025-01-01T00:00:00.000Z" },
    { id: "ident-malformed", snapshot_id: "snap-malformed", discovery_id: "disc-1", contract_version: "1", lifecycle_state: "persisted", created_at: "2026-07-09T00:00:00.000Z" },
  ],
  snapshot_sections: [
    { snapshot_identity_id: "ident-1", section_type: "problem_intelligence", payload: { title: "Agency onboarding gaps", summary: "Manual client onboarding", affectedMarket: "Agencies", affectedAudience: "operators" } },
    { snapshot_identity_id: "ident-1", section_type: "opportunity_intelligence", payload: { summary: "Build onboarding workflow", opportunityScore: 0.9, validationIndicators: ["pain"] } },
    { snapshot_identity_id: "ident-1", section_type: "confidence", payload: { overall: 1.7, evidence: -1, opportunity: 0.8, market: 0.7 } },
    { snapshot_identity_id: "ident-malformed", section_type: "problem_intelligence", payload: { summary: "Missing title", relatedNiches: ["x"] } },
    { snapshot_identity_id: "ident-malformed", section_type: "opportunity_intelligence", payload: { summary: "Bad" } },
    { snapshot_identity_id: "ident-malformed", section_type: "confidence", payload: { overall: 0.4 } },
  ],
  snapshot_evidence: Array.from({ length: 7 }, (_, i) => ({ snapshot_identity_id: "ident-1", evidence_id: `ev-${i}`, relationship: i % 2 ? "supports_problem" : "supports_opportunity", claim: `Claim ${i} `.repeat(80), confidence: { value: i === 0 ? 2 : 0.5 } })),
  snapshot_evidence_supports: [{ snapshot_identity_id: "ident-1", evidence_id: "ev-0", target_section: "problem_intelligence" }, { snapshot_identity_id: "ident-1", evidence_id: "ev-0", target_section: "opportunity_intelligence" }],
  snapshot_provenance_sources: [{ snapshot_identity_id: "ident-1", source_type: "forum", source: { secret: "not returned" } }, { snapshot_identity_id: "ident-1", source_type: "review" }, { snapshot_identity_id: "ident-1", source_type: null }],
});

function mockClient(seed = fixtures()): SupabaseSnapshotRetrievalClient & { ops: Op[]; writes: string[] } {
  const ops: Op[] = [];
  const writes: string[] = [];
  const client = {
    ops,
    writes,
    from(table: string) {
      ops.push({ table, op: "from" });
      let rows: Row[] = structuredClone((seed as Record<string, Row[]>)[table] ?? []);
      const builder = {
        select(value: string) { ops.push({ table, op: "select", value }); return builder; },
        eq(column: string, value: unknown) { ops.push({ table, op: "eq", column, value }); rows = rows.filter((r) => r[column] === value); return builder; },
        in(column: string, values: readonly unknown[]) { ops.push({ table, op: "in", column, value: values }); rows = rows.filter((r) => values.includes(r[column])); return builder; },
        gte(column: string, value: string) { ops.push({ table, op: "gte", column, value }); rows = rows.filter((r) => String(r[column]) >= value); return builder; },
        lte(column: string, value: string) { ops.push({ table, op: "lte", column, value }); rows = rows.filter((r) => String(r[column]) <= value); return builder; },
        order(column: string, options?: { ascending?: boolean }) { ops.push({ table, op: "order", column, value: options }); rows.sort((a, b) => options?.ascending === false ? String(b[column]).localeCompare(String(a[column])) : String(a[column]).localeCompare(String(b[column]))); return builder; },
        limit(count: number) { ops.push({ table, op: "limit", value: count }); rows = rows.slice(0, count); return builder; },
        then(resolve: (value: { data: Row[]; error: null }) => void) { resolve({ data: structuredClone(rows), error: null }); },
        insert() { writes.push("insert"); return builder; }, update() { writes.push("update"); return builder; }, delete() { writes.push("delete"); return builder; }, upsert() { writes.push("upsert"); return builder; }, rpc() { writes.push("rpc"); return builder; },
      };
      return builder;
    },
  };
  return client as unknown as SupabaseSnapshotRetrievalClient & { ops: Op[]; writes: string[] };
}

test("enforces user ownership through opportunity_discoveries and excludes other users", async () => {
  const client = mockClient();
  const results = await createSupabaseSnapshotRetrievalRepository({ client }).findCandidates(baseQuery);
  assert.deepEqual(results.map((r) => r.snapshotId), ["snap-1"]);
  assert.equal(results[0]?.ownership.userId, undefined);
  assert.equal(JSON.stringify(results).includes("user-1"), false);
  assert.ok(client.ops.some((op) => op.table === "opportunity_discoveries" && op.op === "eq" && op.column === "user_id" && op.value === "user-1"));
});

test("discoveryId still requires matching user ownership and nonexistent discovery returns empty", async () => {
  const repo = createSupabaseSnapshotRetrievalRepository({ client: mockClient() });
  assert.deepEqual(await repo.findCandidates({ ...baseQuery, userId: "user-1", discoveryId: "disc-2" }), []);
  assert.deepEqual(await repo.findCandidates({ ...baseQuery, userId: "user-1", discoveryId: "missing" }), []);
});

test("missing user scope and organization scope are controlled rejections", async () => {
  const repo = createSupabaseSnapshotRetrievalRepository({ client: mockClient() });
  await assert.rejects(() => repo.findCandidates({ ...baseQuery, userId: undefined }), /USER_SCOPE_REQUIRED/);
  await assert.rejects(() => repo.findCandidates({ ...baseQuery, organizationId: "org-1" }), /ORGANIZATION_SCOPE_UNSUPPORTED/);
});

test("eligibility enforces lifecycle, required sections, date window, cap, and deterministic ordering", async () => {
  const many = fixtures();
  for (let i = 0; i < 120; i += 1) {
    many.opportunity_discoveries.push({ id: `disc-many-${i}`, user_id: "user-1" });
    many.snapshot_identities.push({ id: `ident-many-${i}`, snapshot_id: `snap-many-${String(i).padStart(3, "0")}`, discovery_id: `disc-many-${i}`, contract_version: "1", lifecycle_state: "persisted", created_at: "2026-07-01T00:00:00.000Z" });
  }
  const client = mockClient(many);
  const results = await createSupabaseSnapshotRetrievalRepository({ client }).findCandidates({ ...baseQuery, maxCandidates: 500 });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.snapshotId, "snap-1");
  assert.ok(client.ops.some((op) => op.table === "snapshot_identities" && op.op === "limit" && op.value === 100));
  assert.ok(client.ops.some((op) => op.table === "snapshot_identities" && op.op === "in" && op.column === "lifecycle_state"));
  assert.ok(client.ops.some((op) => op.table === "snapshot_identities" && op.op === "gte" && op.column === "created_at"));
});

test("maps JSONB safely, clamps confidence, falls back relatedNiches, caps snippets, and omits raw payloads", async () => {
  const result = (await createSupabaseSnapshotRetrievalRepository({ client: mockClient() }).findCandidates(baseQuery))[0];
  assert.equal(result?.problem.title, "Agency onboarding gaps");
  assert.deepEqual(result?.problem.relatedNiches, []);
  assert.equal(result?.confidence?.overall, 1);
  assert.equal(result?.evidenceSignals.length, 5);
  assert.ok((result?.evidenceSignals[0]?.claimSnippet.length ?? 0) <= 240);
  assert.equal(result?.evidenceSignals[0]?.confidence, 1);
  assert.equal(result?.evidenceSignals[0]?.supportingTargetCount, 2);
  assert.deepEqual(result?.sourceTypes, ["forum", "review"]);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(JSON.stringify(result).includes("not returned"), false);
});

test("does not mutate input database rows and batches child table queries without N+1 writes or RPC", async () => {
  const seed = fixtures();
  const before = JSON.stringify(seed);
  const client = mockClient(seed);
  await createSupabaseSnapshotRetrievalRepository({ client }).findCandidates(baseQuery);
  assert.equal(JSON.stringify(seed), before);
  for (const table of ["snapshot_sections", "snapshot_evidence", "snapshot_evidence_supports", "snapshot_provenance_sources"]) {
    assert.equal(client.ops.filter((op) => op.table === table && op.op === "from").length, 1);
    assert.ok(client.ops.some((op) => op.table === table && op.op === "in" && op.column === "snapshot_identity_id"));
  }
  assert.deepEqual(client.writes, []);
  assert.equal(client.ops.some((op) => ["insert", "update", "delete", "upsert", "rpc"].includes(op.op)), false);
});

test("security source boundaries are server-only and not browser-barreled", () => {
  const source = fs.readFileSync("lib/intelligence/snapshots/retrieval/supabase-repository.ts", "utf8");
  const retrievalBarrel = fs.readFileSync("lib/intelligence/snapshots/retrieval/index.ts", "utf8");
  const snapshotBarrel = fs.readFileSync("lib/intelligence/snapshots/index.ts", "utf8");
  assert.match(source, /import "server-only"/);
  assert.equal(source.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  assert.equal(source.includes("console.log"), false);
  assert.equal(retrievalBarrel.includes("supabase-repository"), false);
  assert.equal(snapshotBarrel.includes("supabase-repository"), false);
});
