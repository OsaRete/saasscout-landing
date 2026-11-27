import assert from "node:assert/strict";
import test from "node:test";
import {
  assessProblemEvolution,
  getProblemEvolutionObservations,
  getRecentProblemEvolutionAssessments,
  type KnowledgeEvolutionSupabaseClient,
} from "../lib/knowledge/evolution/repository.ts";

type Operation = { table: string; method: string; args: unknown[] };
type TableResult = { data?: Record<string, unknown>[] | null; error?: unknown };

class MockQueryBuilder implements PromiseLike<TableResult> {
  private table: string;
  private result: TableResult;
  private operations: Operation[];

  constructor(table: string, result: TableResult, operations: Operation[]) {
    this.table = table;
    this.result = result;
    this.operations = operations;
  }

  select(columns: string) {
    this.operations.push({ table: this.table, method: "select", args: [columns] });
    return this;
  }

  eq(column: string, value: unknown) {
    this.operations.push({ table: this.table, method: "eq", args: [column, value] });
    return this;
  }

  ilike(column: string, pattern: string) {
    this.operations.push({ table: this.table, method: "ilike", args: [column, pattern] });
    return this;
  }

  gte(column: string, value: unknown) {
    this.operations.push({ table: this.table, method: "gte", args: [column, value] });
    return this;
  }

  order(column: string, options: { ascending: boolean }) {
    this.operations.push({ table: this.table, method: "order", args: [column, options] });
    return this;
  }

  limit(count: number) {
    this.operations.push({ table: this.table, method: "limit", args: [count] });
    return Promise.resolve(this.result);
  }

  then<TResult1 = TableResult, TResult2 = never>(
    onfulfilled?: ((value: TableResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function createMockClient(results: Record<string, TableResult>) {
  const operations: Operation[] = [];
  const client: KnowledgeEvolutionSupabaseClient = {
    from(table) {
      operations.push({ table, method: "from", args: [table] });
      return new MockQueryBuilder(table, results[table] || { data: [] }, operations) as never;
    },
  };
  return { client, operations };
}

const ownerId = "user-1";
const ownedRun = { run_id: "run-a", weekly_intelligence_runs: { id: "run-a", user_id: ownerId, is_global: false } };

test("Evolution reads only proven owner history and adapts it with lineage", async () => {
  const { client, operations } = createMockClient({
    problem_intelligence: {
      data: [{ id: "pi-1", problem_title: "Manual reporting", avg_pain_score: 8, intelligence_score: 80, prepared_count: 1 }],
    },
    weekly_detected_problems: {
      data: [
        { ...ownedRun, id: "wdp-1", problem_title: "Manual reporting", pain_score: 7, trend_score: 8, source_evidence: "Operators complain weekly." },
        { ...ownedRun, weekly_intelligence_runs: { ...ownedRun.weekly_intelligence_runs, is_global: true }, id: "global", problem_title: "Global marker" },
      ],
    },
    weekly_sources: {
      data: [{ ...ownedRun, id: "ws-1", problem_cluster: "Manual reporting", source_title: "Reporting thread", signal_score: 9, source_url: "https://example.com" }],
    },
    discovered_problems: {
      data: [
        { id: "dp-1", problem_title: "Manual reporting", opportunity_score: 8, discovery_id: "disc-1", user_id: ownerId },
        { id: "dp-2", problem_title: "Foreign marker", user_id: "user-2" },
      ],
    },
  });

  const result = await getProblemEvolutionObservations(client, {
    ownerId,
    problemTitle: "Manual reporting",
    since: "2026-01-01T00:00:00.000Z",
    limit: 10,
  });

  assert.equal(result.observations.length, 3);
  assert.equal(result.diagnostics.totalRowsRead, 3);
  assert.deepEqual(result.diagnostics.failedTables, []);
  assert.deepEqual(result.observations.map((item) => item.provenance?.source_table), ["weekly_detected_problems", "weekly_sources", "discovered_problems"]);
  assert.ok(result.observations.every((item) => item.provenance?.user_id === ownerId));
  assert.equal(result.observations[1].source_quality_score, 9);
  assert.ok(operations.every((operation) => operation.table !== "problem_intelligence"));
  assert.ok(operations.some((operation) => operation.method === "eq" && operation.args[0] === "weekly_intelligence_runs.is_global" && operation.args[1] === false));
  assert.ok(operations.some((operation) => operation.method === "ilike" && operation.args[0] === "problem_title"));
  assert.ok(operations.every((operation) => !["insert", "update", "delete", "upsert"].includes(operation.method)));
});

test("assessProblemEvolution produces classifier assessment from repository observations", async () => {
  const { client } = createMockClient({
    weekly_detected_problems: { data: [{ ...ownedRun, problem_title: "Lead follow-up", pain_score: 8, source_evidence: "Repeated complaints" }] },
    weekly_sources: { data: [] },
    discovered_problems: { data: [{ user_id: ownerId, problem_title: "Lead follow-up", pain_score: 9, evidence_count: 3, source_count: 2 }] },
  });

  const result = await assessProblemEvolution(client, { ownerId, includeWeeklySources: true, includeDiscoveredProblems: true });

  assert.equal(result.assessment.diagnostics.observationCount, 2);
  assert.ok(["recurring", "validated", "new", "unknown"].includes(result.assessment.lifecycleState));
  assert.ok(result.assessment.scores.confidenceScore > 0);
});

test("repository returns partial diagnostics and warnings for partial failures", async () => {
  const { client } = createMockClient({
    weekly_detected_problems: { error: new Error("weekly table unavailable") },
    weekly_sources: { error: new Error("sources unavailable") },
    discovered_problems: { data: [{ user_id: ownerId, problem_title: "Spreadsheet workflows", pain_score: 6 }] },
  });

  const result = await getRecentProblemEvolutionAssessments(client, { ownerId });

  assert.equal(result.assessments.length, 1);
  assert.deepEqual(result.diagnostics.failedTables, ["weekly_detected_problems", "weekly_sources"]);
  assert.equal(result.warnings.length, 2);
});

test("repository throws only when all source reads fail", async () => {
  const { client } = createMockClient({
    weekly_detected_problems: { error: new Error("failed") },
    weekly_sources: { error: new Error("failed") },
    discovered_problems: { error: new Error("failed") },
  });

  await assert.rejects(() => getProblemEvolutionObservations(client, { ownerId }), /could not read any Data Moat source/);
});

test("Evolution fails closed when there is no owner", async () => {
  const { client, operations } = createMockClient({});
  await assert.rejects(() => getProblemEvolutionObservations(client, { ownerId: "" }), /requires an authenticated owner/);
  assert.deepEqual(operations, []);
});
