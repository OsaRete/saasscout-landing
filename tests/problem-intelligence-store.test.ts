import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import { updateGeneratedWeeklyProblemIntelligence, updateProblemIntelligence, updateWeeklyProblemIntelligence } from "../lib/knowledge/problem-intelligence-store.ts";

type QueryCall = {
  table: string;
  select?: string;
  eq?: { column: string; value: unknown };
  insert?: unknown[];
  update?: Record<string, unknown>;
  maybeSingle?: boolean;
};

const problem = {
  problem_title: "Manual client onboarding",
  pain_score: 8,
  revenue_score: 7,
  urgency_score: 6,
  buying_signal_score: 9,
  frequency_score: 5,
  source_quality_score: 8,
  opportunity_score: 82,
};

function createMockClient(existingProblem: Record<string, unknown> | null) {
  const calls: QueryCall[] = [];

  return {
    calls,
    client: {
      from(table: string) {
        const call: QueryCall = { table };
        calls.push(call);

        return {
          select(columns: string) {
            call.select = columns;
            return this;
          },
          eq(column: string, value: unknown) {
            call.eq = { column, value };
            return this;
          },
          async maybeSingle() {
            call.maybeSingle = true;
            return { data: existingProblem, error: null };
          },
          async insert(values: unknown[]) {
            call.insert = values;
            return { error: null };
          },
          update(values: Record<string, unknown>) {
            call.update = values;
            return this;
          },
        };
      },
    },
  };
}

describe("updateProblemIntelligence", () => {
  it("preserves exact-title lookup and insert semantics for new problems", async () => {
    const { client, calls } = createMockClient(null);

    await updateProblemIntelligence(problem, client);

    assert.deepEqual(calls[0], {
      table: "problem_intelligence",
      select: "*",
      eq: { column: "problem_title", value: "Manual client onboarding" },
      maybeSingle: true,
    });
    assert.deepEqual(calls[1], {
      table: "problem_intelligence",
      insert: [
        {
          problem_title: "Manual client onboarding",
          prepared_count: 0,
          converted_count: 0,
          avg_pain_score: 8,
          avg_revenue_score: 7,
          avg_urgency_score: 6,
          avg_buying_signal_score: 9,
          avg_frequency_score: 5,
          avg_source_quality_score: 8,
          avg_opportunity_score: 82,
          intelligence_score: 82,
        },
      ],
    });
  });

  it("preserves averaging and update semantics for existing problems", async () => {
    const now = mock.method(Date.prototype, "toISOString", () => "2026-06-27T00:00:00.000Z");
    const { client, calls } = createMockClient({ id: "problem-1", intelligence_score: 70 });

    try {
      await updateProblemIntelligence(problem, client);
    } finally {
      now.mock.restore();
    }

    assert.deepEqual(calls[1], {
      table: "problem_intelligence",
      update: {
        avg_pain_score: 8,
        avg_revenue_score: 7,
        avg_urgency_score: 6,
        avg_buying_signal_score: 9,
        avg_frequency_score: 5,
        avg_source_quality_score: 8,
        avg_opportunity_score: 82,
        intelligence_score: 76,
        updated_at: "2026-06-27T00:00:00.000Z",
      },
      eq: { column: "id", value: "problem-1" },
    });
  });

  it("preserves the default intelligence score fallback", async () => {
    const { client, calls } = createMockClient(null);

    await updateProblemIntelligence({ ...problem, opportunity_score: 0 }, client);

    assert.equal((calls[1].insert as Record<string, unknown>[])[0].intelligence_score, 70);
  });

  it("preserves weekly-intelligence-style insert semantics, last_seen_at, and problem_intelligence-only writes", async () => {
    const now = mock.method(Date.prototype, "toISOString", () => "2026-06-27T00:00:00.000Z");
    const { client, calls } = createMockClient(null);

    try {
      await updateWeeklyProblemIntelligence({ ...problem, opportunity_score: 8.2, trend_score: 7 }, client);
    } finally {
      now.mock.restore();
    }

    assert.deepEqual(calls.map((call) => call.table), ["problem_intelligence", "problem_intelligence"]);
    assert.deepEqual(calls[0].eq, { column: "problem_title", value: "Manual client onboarding" });
    assert.deepEqual(calls[1].insert, [
      {
        problem_title: "Manual client onboarding",
        prepared_count: 0,
        converted_count: 0,
        avg_pain_score: 8,
        avg_revenue_score: 7,
        avg_urgency_score: 6,
        avg_buying_signal_score: 9,
        avg_frequency_score: 5,
        avg_source_quality_score: 8,
        avg_opportunity_score: 8.2,
        intelligence_score: 82,
        last_seen_at: "2026-06-27T00:00:00.000Z",
      },
    ]);
  });

  it("preserves weekly-intelligence-style update semantics and does not touch feedback counters", async () => {
    const now = mock.method(Date.prototype, "toISOString", () => "2026-06-27T00:00:00.000Z");
    const { client, calls } = createMockClient({
      id: "problem-1",
      avg_opportunity_score: 6.2,
      prepared_count: 4,
      converted_count: 2,
    });

    try {
      await updateWeeklyProblemIntelligence({ ...problem, opportunity_score: 8.2, trend_score: 7 }, client);
    } finally {
      now.mock.restore();
    }

    assert.deepEqual(calls.map((call) => call.table), ["problem_intelligence", "problem_intelligence"]);
    assert.equal(calls[0].eq?.value, "Manual client onboarding");
    assert.deepEqual(calls[1].update, {
      avg_pain_score: 8,
      avg_revenue_score: 7,
      avg_urgency_score: 6,
      avg_buying_signal_score: 9,
      avg_frequency_score: 5,
      avg_source_quality_score: 8,
      avg_opportunity_score: 7.2,
      intelligence_score: 72,
      updated_at: "2026-06-27T00:00:00.000Z",
      last_seen_at: "2026-06-27T00:00:00.000Z",
    });
    assert.equal("prepared_count" in calls[1].update!, false);
    assert.equal("converted_count" in calls[1].update!, false);
  });

  it("preserves generate-weekly-report-style insert semantics without last_seen_at", async () => {
    const { client, calls } = createMockClient(null);

    await updateGeneratedWeeklyProblemIntelligence({ ...problem, trend_score: 5 }, client);

    assert.deepEqual(calls.map((call) => call.table), ["problem_intelligence", "problem_intelligence"]);
    assert.deepEqual(calls[1].insert, [
      {
        problem_title: "Manual client onboarding",
        prepared_count: 0,
        converted_count: 0,
        avg_pain_score: 8,
        avg_revenue_score: 7,
        avg_urgency_score: 6,
        intelligence_score: 67,
      },
    ]);
  });

  it("preserves generate-weekly-report-style update semantics and exact-title lookup without semantic deduplication", async () => {
    const now = mock.method(Date.prototype, "toISOString", () => "2026-06-27T00:00:00.000Z");
    const { client, calls } = createMockClient({ id: "problem-1", intelligence_score: 70 });

    try {
      await updateGeneratedWeeklyProblemIntelligence({ ...problem, problem_title: "Manual client onboarding!", trend_score: 5 }, client);
    } finally {
      now.mock.restore();
    }

    assert.deepEqual(calls[0].eq, { column: "problem_title", value: "Manual client onboarding!" });
    assert.deepEqual(calls[1].update, {
      avg_pain_score: 8,
      avg_revenue_score: 7,
      avg_urgency_score: 6,
      intelligence_score: 68.5,
      updated_at: "2026-06-27T00:00:00.000Z",
    });
    assert.equal("last_seen_at" in calls[1].update!, false);
    assert.equal("prepared_count" in calls[1].update!, false);
    assert.equal("converted_count" in calls[1].update!, false);
  });
});
