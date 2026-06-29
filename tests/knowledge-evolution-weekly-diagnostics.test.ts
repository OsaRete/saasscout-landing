import assert from "node:assert/strict";
import test from "node:test";

import { runKnowledgeEvolutionWeeklyDiagnostics } from "../lib/knowledge/evolution/weekly-diagnostics.ts";
import type { EvolutionSourceTable, RowLike } from "../lib/knowledge/evolution/index.ts";

function clientFor(tables: Partial<Record<EvolutionSourceTable, RowLike[] | Error>>) {
  const calls: EvolutionSourceTable[] = [];
  return {
    calls,
    client: {
      from(table: EvolutionSourceTable) {
        calls.push(table);
        const value = tables[table] || [];
        const builder = {
          select() { return builder; },
          ilike() { return builder; },
          gte() { return builder; },
          order() { return builder; },
          async limit() {
            if (value instanceof Error) return { data: null, error: value };
            return { data: value, error: null };
          },
          then(resolve: (value: { data: RowLike[] | null; error: Error | null }) => void) {
            if (value instanceof Error) return Promise.resolve(resolve({ data: null, error: value }));
            return Promise.resolve(resolve({ data: value, error: null }));
          },
        };
        return builder;
      },
    },
  };
}

function silenceConsole() {
  const info = console.info;
  const warn = console.warn;
  const infos: unknown[][] = [];
  const warns: unknown[][] = [];
  console.info = (...args: unknown[]) => { infos.push(args); };
  console.warn = (...args: unknown[]) => { warns.push(args); };
  return {
    infos,
    warns,
    restore() {
      console.info = info;
      console.warn = warn;
    },
  };
}

test("weekly diagnostics disabled means caller can skip repository execution", () => {
  const previous = process.env.KNOWLEDGE_EVOLUTION_DIAGNOSTICS;
  delete process.env.KNOWLEDGE_EVOLUTION_DIAGNOSTICS;
  const { calls } = clientFor({ weekly_detected_problems: [{ problem_title: "Skipped" }] });

  if (process.env.KNOWLEDGE_EVOLUTION_DIAGNOSTICS === "1") {
    throw new Error("Flag should be disabled for this test.");
  }

  assert.deepEqual(calls, []);
  process.env.KNOWLEDGE_EVOLUTION_DIAGNOSTICS = previous;
});

test("weekly diagnostics enabled assesses detected problems without changing API-shaped output", async () => {
  const logger = silenceConsole();
  try {
    const apiOutput = { success: true, problems: [{ id: "weekly-p1" }] };
    const { client, calls } = clientFor({
      weekly_detected_problems: [{ problem_title: "Client reporting bottlenecks", created_at: "2026-06-01", pain_score: 8, source_evidence: "weekly evidence" }],
      weekly_sources: [{ problem_title: "Client reporting bottlenecks", created_at: "2026-06-01", source_quality_score: 7, source_type: "x" }],
    });

    const result = await runKnowledgeEvolutionWeeklyDiagnostics({
      client,
      problems: [{ problem_title: "Client reporting bottlenecks" }],
    });

    assert.equal(result.assessed_problem_count, 1);
    assert.equal(result.problems[0].problem_title, "Client reporting bottlenecks");
    assert.equal(typeof result.problems[0].recurrence_score, "number");
    assert.equal(calls.includes("discovered_problems"), false);
    assert.deepEqual(apiOutput, { success: true, problems: [{ id: "weekly-p1" }] });
  } finally {
    logger.restore();
  }
});

test("weekly repository failures are logged safely and do not throw", async () => {
  const logger = silenceConsole();
  try {
    const { client } = clientFor({
      problem_intelligence: new Error("database offline"),
      weekly_detected_problems: new Error("database offline"),
      weekly_sources: new Error("database offline"),
    });

    const result = await runKnowledgeEvolutionWeeklyDiagnostics({
      client,
      problems: [{ problem_title: "Offline weekly assessment" }],
    });

    assert.equal(result.assessed_problem_count, 0);
    assert.equal(result.failed_problem_count, 1);
    assert.equal(logger.warns.length, 1);
  } finally {
    logger.restore();
  }
});

test("weekly diagnostics reports multiple detected problems and partial assessments", async () => {
  const logger = silenceConsole();
  try {
    const { client } = clientFor({
      problem_intelligence: new Error("one source unavailable"),
      weekly_detected_problems: [
        { problem_title: "Client reporting bottlenecks", created_at: "2026-06-01", pain_score: 8, source_evidence: "agency evidence" },
        { problem_title: "Spreadsheet onboarding gaps", created_at: "2026-06-02", pain_score: 7, source_evidence: "operator evidence" },
      ],
    });

    const result = await runKnowledgeEvolutionWeeklyDiagnostics({
      client,
      problems: [
        { problem_title: "Client reporting bottlenecks" },
        { problem_title: "Spreadsheet onboarding gaps" },
      ],
    });

    assert.equal(result.assessed_problem_count, 2);
    assert.equal(result.failed_problem_count, 0);
    assert.equal(result.problems.length, 2);
    assert.ok(result.warnings.some((warning) => warning.includes("problem_intelligence read failed")));
  } finally {
    logger.restore();
  }
});
