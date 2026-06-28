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

test("getProblemEvolutionObservations reads Data Moat tables and adapts rows", async () => {
  const { client, operations } = createMockClient({
    problem_intelligence: {
      data: [{ id: "pi-1", problem_title: "Manual reporting", avg_pain_score: 8, intelligence_score: 80, prepared_count: 1 }],
    },
    weekly_detected_problems: {
      data: [{ id: "wdp-1", problem_title: "Manual reporting", pain_score: 7, trend_score: 8, source_evidence: "Operators complain weekly." }],
    },
    weekly_sources: {
      data: [{ id: "ws-1", problem_cluster: "Manual reporting", source_title: "Reporting thread", signal_score: 9, source_url: "https://example.com" }],
    },
    discovered_problems: {
      data: [{ id: "dp-1", problem_title: "Manual reporting", opportunity_score: 8, discovery_id: "disc-1", user_id: "user-1" }],
    },
  });

  const result = await getProblemEvolutionObservations(client, {
    problemTitle: "Manual reporting",
    since: "2026-01-01T00:00:00.000Z",
    limit: 10,
  });

  assert.equal(result.observations.length, 4);
  assert.equal(result.diagnostics.totalRowsRead, 4);
  assert.deepEqual(result.diagnostics.failedTables, []);
  assert.equal(result.observations[0].provenance?.source_table, "problem_intelligence");
  assert.equal(result.observations[1].provenance?.source_table, "weekly_detected_problems");
  assert.equal(result.observations[2].provenance?.source_table, "weekly_sources");
  assert.equal(result.observations[3].provenance?.source_table, "discovered_problems");
  assert.equal(result.observations[2].source_quality_score, 9);
  assert.ok(operations.some((operation) => operation.method === "ilike" && operation.args[0] === "problem_title"));
  assert.ok(operations.every((operation) => !["insert", "update", "delete", "upsert"].includes(operation.method)));
});

test("assessProblemEvolution produces classifier assessment from repository observations", async () => {
  const { client } = createMockClient({
    problem_intelligence: { data: [{ problem_title: "Lead follow-up", avg_pain_score: 9, evidence_count: 3, source_count: 2 }] },
    weekly_detected_problems: { data: [{ problem_title: "Lead follow-up", pain_score: 8, source_evidence: "Repeated complaints" }] },
    weekly_sources: { data: [] },
    discovered_problems: { data: [] },
  });

  const result = await assessProblemEvolution(client, { includeWeeklySources: true, includeDiscoveredProblems: true });

  assert.equal(result.assessment.diagnostics.observationCount, 2);
  assert.ok(["recurring", "validated", "new", "unknown"].includes(result.assessment.lifecycleState));
  assert.ok(result.assessment.scores.confidenceScore > 0);
});

test("repository returns partial diagnostics and warnings for partial failures", async () => {
  const { client } = createMockClient({
    problem_intelligence: { data: [{ problem_title: "Spreadsheet workflows", avg_pain_score: 6 }] },
    weekly_detected_problems: { error: new Error("weekly table unavailable") },
    weekly_sources: { error: new Error("sources unavailable") },
    discovered_problems: { data: [] },
  });

  const result = await getRecentProblemEvolutionAssessments(client);

  assert.equal(result.assessments.length, 1);
  assert.deepEqual(result.diagnostics.failedTables, ["weekly_detected_problems", "weekly_sources"]);
  assert.equal(result.warnings.length, 2);
});

test("repository throws only when all source reads fail", async () => {
  const { client } = createMockClient({
    problem_intelligence: { error: new Error("failed") },
    weekly_detected_problems: { error: new Error("failed") },
    weekly_sources: { error: new Error("failed") },
    discovered_problems: { error: new Error("failed") },
  });

  await assert.rejects(() => getProblemEvolutionObservations(client), /could not read any Data Moat source/);
});
