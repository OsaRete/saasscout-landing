import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  persistProblemObservations,
  problemObservationToRow,
  type ProblemObservationPersistenceClient,
  type ProblemObservationRow,
} from "../lib/knowledge/observation-store.ts";
import { buildProblemObservation, type ProblemObservationInput } from "../lib/knowledge/problem-observations.ts";

const input = (overrides: Partial<ProblemObservationInput> = {}): ProblemObservationInput => ({
  title: "Manual client onboarding is slow",
  observedAt: "2026-01-15T12:00:00.000Z",
  source: {
    sourceType: "discovery",
    sourceName: "SaaSScout Discovery",
    sourceRank: 1,
    sourceId: "problem_1",
    sourceTable: "discovered_problems",
  },
  provenance: {
    sourceTable: "discovered_problems",
    sourceId: "problem_1",
    userId: "user_1",
  },
  evidenceSummary: "Aggregate evidence mentions repeated manual onboarding follow-up.",
  affectedNiches: "Agencies | Consultants",
  problemCluster: "client_onboarding",
  scores: {
    pain: 8,
    revenue: 7,
    urgency: 6,
    trend: 5,
    buyingSignal: 8,
    frequency: 7,
    sourceQuality: 8,
    opportunity: 82,
    confidence: 8,
  },
  ...overrides,
});

function clientMock({ inserted = 1, error = null }: { inserted?: number; error?: unknown } = {}) {
  const calls: Array<{ table: string; rows: ProblemObservationRow[]; options: { onConflict: string; ignoreDuplicates: boolean }; columns: string }> = [];
  const client: ProblemObservationPersistenceClient = {
    from(table) {
      assert.equal(table, "problem_observations");
      return {
        upsert(rows, options) {
          return {
            async select(columns) {
              calls.push({ table, rows, options, columns });
              return {
                data: error ? null : rows.slice(0, inserted).map((row) => ({ observation_fingerprint: row.observation_fingerprint })),
                error,
              };
            },
          };
        },
      };
    },
  };

  return { client, calls };
}

describe("problem observation store", () => {
  it("maps observations to problem_observations rows without canonical table fields", () => {
    const row = problemObservationToRow(buildProblemObservation(input()));

    assert.equal(row.problem_title, "Manual client onboarding is slow");
    assert.equal(row.normalized_problem_title, "manual client onboarding is slow");
    assert.equal(row.source_table, "discovered_problems");
    assert.equal(row.source_row_id, "problem_1");
    assert.deepEqual(row.affected_niches, ["agencies", "consultants"]);
    assert.equal("canonical_problem_id" in row, false);
  });

  it("attempts a conflict-safe problem_observations write", async () => {
    const { client, calls } = clientMock({ inserted: 1 });

    const result = await persistProblemObservations(client, [input()]);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].table, "problem_observations");
    assert.deepEqual(calls[0].options, { onConflict: "observation_fingerprint", ignoreDuplicates: true });
    assert.equal(calls[0].columns, "observation_fingerprint");
    assert.equal(result.diagnostics.attempted_observation_count, 1);
    assert.equal(result.diagnostics.inserted_count, 1);
    assert.equal(result.diagnostics.failed_count, 0);
  });

  it("treats duplicate observation_fingerprint skips as non-failing", async () => {
    const { client } = clientMock({ inserted: 0 });

    const result = await persistProblemObservations(client, [input()]);

    assert.equal(result.diagnostics.inserted_count, 0);
    assert.equal(result.diagnostics.skipped_count, 1);
    assert.equal(result.diagnostics.failed_count, 0);
    assert.deepEqual(result.diagnostics.persistence_errors, []);
  });

  it("captures Supabase errors with safe aggregate diagnostics", async () => {
    const { client } = clientMock({ error: { message: "database unavailable" } });

    const result = await persistProblemObservations(client, [input()]);

    assert.equal(result.diagnostics.attempted_observation_count, 1);
    assert.equal(result.diagnostics.inserted_count, 0);
    assert.equal(result.diagnostics.failed_count, 1);
    assert.deepEqual(result.diagnostics.persistence_errors, ["database unavailable"]);
    assert.equal(JSON.stringify(result.diagnostics).includes("Aggregate evidence mentions"), false);
    assert.equal(JSON.stringify(result.diagnostics).includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  });

  it("captures validation failures without attempting a database write", async () => {
    const { client, calls } = clientMock();

    const result = await persistProblemObservations(client, [input({ observedAt: "not-a-date" })]);

    assert.equal(calls.length, 0);
    assert.equal(result.diagnostics.attempted_observation_count, 1);
    assert.equal(result.diagnostics.inserted_count, 0);
    assert.equal(result.diagnostics.skipped_count, 1);
    assert.equal(result.diagnostics.failed_count, 1);
    assert.match(result.diagnostics.warnings[0], /validation failed/);
  });
});
