import assert from "node:assert/strict";
import test from "node:test";
import { aggregateUserDataMoat, type DataMoatAggregationClient } from "../lib/data-moat/aggregation.ts";

type Row = Record<string, unknown>;

function clientWith(tables: Record<string, Row[]>, failures: string[] = []) {
  const writes: string[] = [];
  const reads: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const client: DataMoatAggregationClient & { writes: string[]; reads: typeof reads } = {
    writes,
    reads,
    from(table: string) {
      const state = { filters: [] as Array<[string, unknown]>, inFilters: [] as Array<[string, unknown[]]>, limit: Infinity, orderColumn: "", ascending: true };
      const builder = {
        select() { return builder; },
        eq(column: string, value: unknown) { state.filters.push([column, value]); return builder; },
        in(column: string, values: unknown[]) { state.inFilters.push([column, values]); return builder; },
        order(column: string, options?: { ascending?: boolean }) { state.orderColumn = column; state.ascending = options?.ascending ?? true; return builder; },
        limit(count: number) { state.limit = count; return builder; },
        insert() { writes.push(`${table}.insert`); return builder; },
        update() { writes.push(`${table}.update`); return builder; },
        upsert() { writes.push(`${table}.upsert`); return builder; },
        delete() { writes.push(`${table}.delete`); return builder; },
        then(resolve: (value: { data: Row[] | null; error: unknown }) => void) {
          reads.push({ table, filters: state.filters });
          if (failures.includes(table)) return Promise.resolve(resolve({ data: null, error: new Error("unavailable") }));
          let rows = [...(tables[table] || [])];
          for (const [column, value] of state.filters) rows = rows.filter((row) => row[column] === value);
          for (const [column, values] of state.inFilters) rows = rows.filter((row) => values.includes(row[column]));
          if (state.orderColumn) rows.sort((a, b) => String(a[state.orderColumn] || "").localeCompare(String(b[state.orderColumn] || "")) * (state.ascending ? 1 : -1));
          rows = rows.slice(0, state.limit);
          return Promise.resolve(resolve({ data: rows, error: null }));
        },
      };
      return builder as never;
    },
  };
  return client;
}

const baseTables = {
  scan: [
    { id: "scan-b", user_id: "user-1", status: "completed", market: "B", evidence: "Beta", created_at: "2026-07-02T00:00:00.000Z" },
    { id: "scan-a", user_id: "user-1", status: "completed", market: "A", evidence: "Alpha", created_at: "2026-07-02T00:00:00.000Z" },
    { id: "scan-other", user_id: "user-2", status: "completed", market: "Other", created_at: "2026-07-03T00:00:00.000Z" },
    { id: "scan-open", user_id: "user-1", status: "processing", market: "Open", created_at: "2026-07-04T00:00:00.000Z" },
  ],
  opportunities: [{ id: "opp-1", user_id: "user-1", title: "Opportunity", created_at: "2026-07-01T00:00:00.000Z" }],
  opportunity_discoveries: [{ id: "disc-1", user_id: "user-1", status: "completed", summary: "Discovery", created_at: "2026-07-05T00:00:00.000Z" }],
  discovered_problems: [
    { id: "prob-1", user_id: "user-1", discovery_id: "disc-1", status: "accepted", problem_title: "Accepted", created_at: "2026-07-06T00:00:00.000Z" },
    { id: "prob-other", user_id: "user-2", discovery_id: "disc-2", status: "accepted", problem_title: "Other", created_at: "2026-07-06T00:00:00.000Z" },
    { id: "prob-pending", user_id: "user-1", discovery_id: "disc-1", status: "pending", problem_title: "Pending", created_at: "2026-07-06T00:00:00.000Z" },
  ],
  saved_ideas: [{ id: "save-1", user_id: "user-1", opportunity_id: "opp-1", created_at: "2026-07-07T00:00:00.000Z" }],
  weekly_intelligence_runs: [{ id: "week-1", user_id: "user-1", status: "completed", summary: "Weekly", period_end: "2026-07-08T00:00:00.000Z", created_at: "2026-07-08T00:00:00.000Z" }],
  snapshot_identities: [{ id: "snap-ident-1", snapshot_id: "snap-1", owner_id: "user-1", lifecycle_state: "persisted", created_at: "2026-07-09T00:00:00.000Z" }],
  discovery_actions: [{ id: "act-1", user_id: "user-1", action_type: "accepted", discovery_id: "disc-1", problem_id: "prob-1", created_at: "2026-07-10T00:00:00.000Z" }],
  problem_intelligence: [{ id: "pi-1", problem_title: "Shared", intelligence_score: 99, last_seen_at: "2026-07-11T00:00:00.000Z" }],
};

test("aggregates only authenticated user data and excludes another user's records", async () => {
  const result = await aggregateUserDataMoat(clientWith(baseTables), "user-1", { now: () => 10 });
  assert.equal(result.items.some((item) => item.id.includes("other")), false);
  assert.equal(result.bySource.completed_scans.length, 2);
  assert.equal(result.bySource.accepted_discover_problems.length, 1);
  assert.equal(result.bySource.weekly_reports.length, 1);
});

test("keeps optional shared context supplementary", async () => {
  const withShared = await aggregateUserDataMoat(clientWith(baseTables), "user-1", { now: () => 10 });
  assert.equal(withShared.items.some((item) => item.kind === "shared_problem_intelligence"), false);
  assert.equal(withShared.sharedContext.length, 1);
  const withoutShared = await aggregateUserDataMoat(clientWith(baseTables), "user-1", { includeSharedContext: false, now: () => 10 });
  assert.equal(withoutShared.sharedContext.length, 0);
});

test("normalization and ordering are deterministic", async () => {
  const result = await aggregateUserDataMoat(clientWith(baseTables), "user-1", { now: () => 10 });
  assert.deepEqual(result.bySource.completed_scans.map((item) => item.id), ["scan-a", "scan-b"]);
  assert.deepEqual(result.items.map((item) => item.id).slice(0, 3), ["act-1", "snap-ident-1", "week-1"]);
  assert.equal(Object.keys(result.items[0].metadata).join(","), "status,score,sourceCount,problemCluster,painScore,revenueScore,urgencyScore,buyingSignalScore,frequencyScore,sourceQualityScore,opportunityId,actionType,problemId,periodStart,periodEnd");
});

test("missing sources do not fail aggregation and diagnostics remain returned for server callers", async () => {
  const result = await aggregateUserDataMoat(clientWith(baseTables, ["snapshot_identities"]), "user-1", { now: () => 10 });
  assert.equal(result.bySource.snapshots.length, 0);
  assert.deepEqual(result.diagnostics.skippedSources, [{ source: "snapshots", reason: "query_error" }]);
  assert.equal(result.diagnostics.sourcesQueried.includes("snapshots"), true);
});

test("aggregation is read-only and performs no Problem Intelligence writes", async () => {
  const client = clientWith(baseTables);
  await aggregateUserDataMoat(client, "user-1", { now: () => 10 });
  assert.deepEqual(client.writes, []);
  assert.equal(client.reads.some((read) => read.table === "problem_intelligence"), true);
});

test("existing workflow compatible weekly evidence shapes can be derived", async () => {
  const result = await aggregateUserDataMoat(clientWith(baseTables), "user-1", { now: () => 10 });
  const weeklyCompatible = result.items.filter((item) => ["scan", "discover_run", "saved_idea", "user_activity"].includes(item.kind));
  assert.deepEqual(weeklyCompatible.map((item) => item.kind), ["user_activity", "saved_idea", "discover_run", "scan", "scan"]);
});
