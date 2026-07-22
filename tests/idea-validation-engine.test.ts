import assert from "node:assert/strict";
import test from "node:test";
import { aggregateUserDataMoat } from "../lib/data-moat/aggregation.ts";
import { buildIdeaValidationDataMoatContext, stripIdeaValidationDiagnostics, validateIdea, validateIdeaAgainstDataMoatContext, validateIdeaFromAggregation, validateIdeasAgainstDataMoatContext } from "../lib/idea-validation/engine.ts";
import type { DataMoatAggregationClient } from "../lib/data-moat/aggregation.ts";

type Row = Record<string, unknown>;
function clientWith(tables: Record<string, Row[]>) {
  const writes: string[] = [];
  const reads: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const client: DataMoatAggregationClient & { writes: string[]; reads: typeof reads } = { writes, reads, from(table: string) {
    const state = { filters: [] as Array<[string, unknown]>, limit: Infinity, orderColumn: "", ascending: true };
    const builder = { select() { return builder; }, eq(column: string, value: unknown) { state.filters.push([column, value]); return builder; }, in() { return builder; }, order(column: string, options?: { ascending?: boolean }) { state.orderColumn = column; state.ascending = options?.ascending ?? true; return builder; }, limit(count: number) { state.limit = count; return builder; }, insert() { writes.push(`${table}.insert`); return builder; }, update() { writes.push(`${table}.update`); return builder; }, upsert() { writes.push(`${table}.upsert`); return builder; }, delete() { writes.push(`${table}.delete`); return builder; }, then(resolve: (value: { data: Row[] | null; error: unknown }) => void) { reads.push({ table, filters: state.filters }); let rows = [...(tables[table] || [])]; for (const [column, value] of state.filters) rows = rows.filter((row) => row[column] === value); if (state.orderColumn) rows.sort((a, b) => String(a[state.orderColumn] || "").localeCompare(String(b[state.orderColumn] || "")) * (state.ascending ? 1 : -1)); return Promise.resolve(resolve({ data: rows.slice(0, state.limit), error: null })); } };
    return builder as never;
  } };
  return client;
}
const idea = { title: "AI invoice reconciliation", problem: "finance teams waste time matching invoices" };
const now = () => Date.parse("2026-07-21T00:00:00.000Z");
const supportingTables = {
  scan: [{ id: "scan-1", user_id: "user-1", status: "completed", market: "finance", evidence: "Finance teams waste time matching invoices for invoice reconciliation", created_at: "2026-07-01T00:00:00.000Z" }],
  opportunities: [{ id: "opp-1", user_id: "user-1", title: "AI invoice reconciliation", summary: "Automate matching invoices", score: 85, created_at: "2026-07-02T00:00:00.000Z" }],
  opportunity_discoveries: [{ id: "disc-1", user_id: "user-1", status: "completed", summary: "Invoice reconciliation pain in finance teams", created_at: "2026-07-03T00:00:00.000Z" }],
  discovered_problems: [{ id: "prob-1", user_id: "user-1", discovery_id: "disc-1", status: "accepted", problem_title: "Invoice reconciliation wastes finance time", problem_summary: "Teams need AI invoice matching", opportunity_score: 88, created_at: "2026-07-04T00:00:00.000Z" }],
  saved_ideas: [{ id: "save-1", user_id: "user-1", opportunity_id: "opp-1", created_at: "2026-07-05T00:00:00.000Z" }],
  weekly_intelligence_runs: [{ id: "week-1", user_id: "user-1", status: "completed", summary: "Invoice reconciliation remains a recurring finance team problem", period_end: "2026-07-06T00:00:00.000Z", created_at: "2026-07-06T00:00:00.000Z" }],
  snapshot_identities: [], discovery_actions: [{ id: "act-1", user_id: "user-1", action_type: "accepted", problem_id: "prob-1", created_at: "2026-07-07T00:00:00.000Z" }], problem_intelligence: [{ id: "pi-1", problem_title: "Shared invoice", intelligence_score: 99, last_seen_at: "2026-07-08T00:00:00.000Z" }],
};

test("validation uses aggregated evidence and excludes another user's evidence", async () => {
  const client = clientWith({ ...supportingTables, scan: [...supportingTables.scan, { id: "scan-other", user_id: "user-2", status: "completed", market: "finance", evidence: "AI invoice reconciliation", created_at: "2026-07-09T00:00:00.000Z" }] });
  const result = await validateIdea(client, { userId: "user-1", idea, now });
  assert.equal(client.reads.some((read) => read.table === "scan" && read.filters.some(([c, v]) => c === "user_id" && v === "user-1")), true);
  assert.equal(result.supportingSignals.some((signal) => signal.itemId === "scan-other"), false);
});

test("contradictory evidence lowers confidence", async () => {
  const limitedTables = { ...supportingTables, opportunities: [], opportunity_discoveries: [], saved_ideas: [], weekly_intelligence_runs: [], discovery_actions: [] };
  const positive = await validateIdea(clientWith(limitedTables), { userId: "user-1", idea, now });
  const contradicted = await validateIdea(clientWith({ ...limitedTables, discovered_problems: [...supportingTables.discovered_problems, { id: "prob-bad", user_id: "user-1", discovery_id: "disc-1", status: "accepted", problem_title: "AI invoice reconciliation has no demand", problem_summary: "Customers rejected it as not viable", created_at: "2026-07-08T00:00:00.000Z" }] }), { userId: "user-1", idea, now });
  assert.ok(contradicted.confidence < positive.confidence);
  assert.ok(contradicted.contradictorySignals.length > 0);
});

test("multiple supporting signals increase confidence", async () => {
  const empty = await validateIdea(clientWith({ scan: [], opportunities: [], opportunity_discoveries: [], discovered_problems: [], saved_ideas: [], weekly_intelligence_runs: [], snapshot_identities: [], discovery_actions: [], problem_intelligence: [] }), { userId: "user-1", idea, now });
  const supported = await validateIdea(clientWith(supportingTables), { userId: "user-1", idea, now });
  assert.ok(supported.confidence > empty.confidence);
  assert.ok(supported.supportingSignals.length > 1);
});

test("deterministic output for identical evidence", async () => {
  const first = await validateIdea(clientWith(supportingTables), { userId: "user-1", idea, now });
  const second = await validateIdea(clientWith(supportingTables), { userId: "user-1", idea, now });
  assert.deepEqual(first, second);
});

test("empty evidence produces controlled output", async () => {
  const result = await validateIdea(clientWith({}), { userId: "user-1", idea, now });
  assert.equal(result.status, "insufficient_evidence");
  assert.equal(result.confidence, 0);
  assert.equal(result.recommendation, "collect_more_evidence");
});

test("validation is read-only and never modifies Problem Intelligence", async () => {
  const client = clientWith(supportingTables);
  await validateIdea(client, { userId: "user-1", idea, now });
  assert.deepEqual(client.writes, []);
  assert.equal(client.reads.some((read) => read.table === "problem_intelligence"), false);
});

test("diagnostics remain internal when stripped for public response", async () => {
  const result = await validateIdea(clientWith(supportingTables), { userId: "user-1", idea, now });
  const publicResult = stripIdeaValidationDiagnostics(result);
  assert.equal("diagnostics" in publicResult, false);
});


test("shared context validator does not aggregate or read Data Moat sources", async () => {
  const client = clientWith(supportingTables);
  const aggregation = await aggregateUserDataMoat(client, "user-1", { includeSharedContext: false, now });
  const readCountAfterAggregation = client.reads.length;
  const context = buildIdeaValidationDataMoatContext(aggregation);
  const result = validateIdeaAgainstDataMoatContext({ userId: "user-1", idea, dataMoatContext: context, now });
  assert.ok(result.supportingSignals.length > 0);
  assert.equal(client.reads.length, readCountAfterAggregation);
});

test("single idea convenience wrapper aggregates exactly once", async () => {
  const client = clientWith(supportingTables);
  await validateIdea(client, { userId: "user-1", idea, now, includeSharedContext: false });
  assert.equal(client.reads.length, 8);
});

test("one shared aggregation validates five ideas without scaling Data Moat reads", async () => {
  const client = clientWith(supportingTables);
  const aggregation = await aggregateUserDataMoat(client, "user-1", { includeSharedContext: false, now });
  const context = buildIdeaValidationDataMoatContext(aggregation);
  const inputs = Array.from({ length: 5 }, (_, index) => ({ userId: "user-1", idea: { ...idea, title: `${idea.title} ${index}` }, now }));
  const results = validateIdeasAgainstDataMoatContext(inputs, context);
  assert.equal(results.length, 5);
  assert.equal(client.reads.length, 8);
});

test("maximum sized shared-context batch performs one aggregation read set", async () => {
  const client = clientWith(supportingTables);
  const aggregation = await aggregateUserDataMoat(client, "user-1", { includeSharedContext: false, now });
  const context = buildIdeaValidationDataMoatContext(aggregation);
  const inputs = Array.from({ length: 30 }, (_, index) => ({ userId: "user-1", idea: { ...idea, title: `${idea.title} ${index}` }, now }));
  validateIdeasAgainstDataMoatContext(inputs, context);
  assert.equal(client.reads.length, 8);
});

test("context validation preserves confidence and signals from previous aggregation-based implementation", async () => {
  const aggregation = await aggregateUserDataMoat(clientWith(supportingTables), "user-1", { includeSharedContext: false, now });
  const contextResult = validateIdeaAgainstDataMoatContext({ userId: "user-1", idea, dataMoatContext: buildIdeaValidationDataMoatContext(aggregation), now });
  const aggregationResult = validateIdeaFromAggregation({ userId: "user-1", idea, aggregation, now });
  assert.equal(contextResult.confidence, aggregationResult.confidence);
  assert.deepEqual(contextResult.supportingSignals, aggregationResult.supportingSignals);
  assert.deepEqual(contextResult.contradictorySignals, aggregationResult.contradictorySignals);
});

test("shared context is not mutated between validations", async () => {
  const aggregation = await aggregateUserDataMoat(clientWith(supportingTables), "user-1", { includeSharedContext: false, now });
  const context = buildIdeaValidationDataMoatContext(aggregation);
  const before = JSON.stringify(context);
  const first = validateIdeaAgainstDataMoatContext({ userId: "user-1", idea, dataMoatContext: context, now });
  const second = validateIdeaAgainstDataMoatContext({ userId: "user-1", idea: { title: "unrelated payroll tool" }, dataMoatContext: context, now });
  assert.equal(JSON.stringify(context), before);
  assert.notDeepEqual(first, second);
});
