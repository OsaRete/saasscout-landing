import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { collectDataMoatSources } from "../lib/knowledge/discovery-data-moat-sources.ts";

type QueryCall = {
  table: string;
  select?: string;
  order?: { column: string; ascending: boolean };
  limit?: number;
  eq?: { column: string; value: string };
};

const ownerA = "00000000-0000-4000-8000-000000000001";
const ownerB = "00000000-0000-4000-8000-000000000002";
const ownedRun = { run_id: "run-a", weekly_intelligence_runs: { id: "run-a", user_id: ownerA } };

// Deliberately returns rows without filtering, to exercise the defensive
// projection check independently of the database-side join assertions below.
function createMockClient(dataByTable: Record<string, Record<string, unknown>[]>) {
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
          eq(column: string, value: string) {
            call.eq = { column, value };
            return this;
          },
          order(column: string, options: { ascending: boolean }) {
            call.order = { column, ascending: options.ascending };
            return this;
          },
          async limit(count: number) {
            call.limit = count;
            return { data: dataByTable[table] || null };
          },
        };
      },
    },
  };
}

describe("collectDataMoatSources", () => {
  it("preserves Data Moat table reads, ordering and limits", async () => {
    const { client, calls } = createMockClient({});

    await collectDataMoatSources(ownerA, client);

    assert.deepEqual(calls, [
      {
        table: "problem_intelligence",
        select: "*",
        order: { column: "intelligence_score", ascending: false },
        limit: 15,
      },
      {
        table: "weekly_detected_problems",
        select: "*,weekly_intelligence_runs!inner(id,user_id)",
        eq: { column: "weekly_intelligence_runs.user_id", value: ownerA },
        order: { column: "created_at", ascending: false },
        limit: 15,
      },
      {
        table: "weekly_sources",
        select: "*,weekly_intelligence_runs!inner(id,user_id)",
        eq: { column: "weekly_intelligence_runs.user_id", value: ownerA },
        order: { column: "created_at", ascending: false },
        limit: 20,
      },
    ]);
  });

  it("preserves source shape, source order, source ranks and scoring", async () => {
    const { client } = createMockClient({
      problem_intelligence: [
        {
          problem_title: "Manual CRM cleanup",
          intelligence_score: 91,
          prepared_count: 3,
          converted_count: 2,
        },
      ],
      weekly_detected_problems: [
        {
          problem_title: "Slow client reporting",
          ...ownedRun,
          problem_summary: "Agencies spend hours preparing reports.",
          source_evidence: "Repeated weekly mentions.",
          trend_score: 7,
        },
      ],
      weekly_sources: [
        {
          source_title: "Agency operators complain about reporting",
          ...ownedRun,
          source_url: "https://example.com/reporting",
          source_snippet: "Manual reporting is painful.",
          signal_score: 42,
          category: "Operations",
        },
      ],
    });

    const sources = await collectDataMoatSources(ownerA, client);

    assert.deepEqual(sources, [
      {
        title: "Data Moat Problem: Manual CRM cleanup",
        url: null,
        snippet: "Known problem. Intelligence score: 91. Prepared: 3. Converted: 2.",
        source_type: "data_moat",
        source_rank: 1,
        signal_score: 91,
        category: "Data Moat",
      },
      {
        title: "Weekly Problem: Slow client reporting",
        url: null,
        snippet: "Agencies spend hours preparing reports. Evidence: Repeated weekly mentions.",
        source_type: "data_moat",
        source_rank: 2,
        signal_score: 70,
        category: "Weekly Intelligence",
      },
      {
        title: "Agency operators complain about reporting",
        url: "https://example.com/reporting",
        snippet: "Manual reporting is painful.",
        source_type: "data_moat",
        source_rank: 3,
        signal_score: 42,
        category: "Operations",
      },
    ]);
  });

  it("preserves the final cap of 30 sources", async () => {
    const { client } = createMockClient({
      problem_intelligence: Array.from({ length: 15 }, (_, index) => ({
        problem_title: `Problem ${index + 1}`,
        intelligence_score: index + 1,
      })),
      weekly_detected_problems: Array.from({ length: 15 }, (_, index) => ({
        ...ownedRun,
        problem_title: `Weekly Problem ${index + 1}`,
        trend_score: index + 1,
      })),
      weekly_sources: Array.from({ length: 20 }, (_, index) => ({
        ...ownedRun,
        source_title: `Weekly Source ${index + 1}`,
        signal_score: index + 1,
      })),
    });

    const sources = await collectDataMoatSources(ownerA, client);

    assert.equal(sources.length, 30);
    assert.equal(sources.at(-1)?.title, "Weekly Problem: Weekly Problem 15");
  });

  it("rejects missing owner before constructing a client or reading any table", async () => {
    const { client, calls } = createMockClient({});
    for (const owner of [undefined, null, "", "   ", 42]) {
      await assert.rejects(collectDataMoatSources(owner as string, client), /Authenticated owner/);
    }
    assert.deepEqual(calls, []);
  });

  it("retains shared aggregates when the caller has no owned Weekly context", async () => {
    const { client } = createMockClient({
      problem_intelligence: [{ problem_title: "Shared context", intelligence_score: 91 }],
      weekly_detected_problems: [{ run_id: "run-b", weekly_intelligence_runs: { id: "run-b", user_id: ownerB }, problem_title: "B private problem" }],
      weekly_sources: [{ run_id: "run-b", weekly_intelligence_runs: { id: "run-b", user_id: ownerB }, source_title: "B private source" }],
    });
    const sources = await collectDataMoatSources(ownerA, client);
    assert.equal(sources.length, 1);
    assert.equal(sources[0].title, "Data Moat Problem: Shared context");
    assert.equal(sources[0].signal_score, 91);
  });

  it("excludes foreign, ownerless, orphaned and mismatched parent/child records", async () => {
    const invalidRuns = [
      { run_id: "run-b", weekly_intelligence_runs: { id: "run-b", user_id: ownerB } },
      { run_id: "run-global", weekly_intelligence_runs: { id: "run-global", user_id: null, is_global: true } },
      { run_id: null, weekly_intelligence_runs: null },
      { run_id: "run-b", weekly_intelligence_runs: ownedRun.weekly_intelligence_runs },
      { run_id: "run-a", weekly_intelligence_runs: [{ id: "run-a", user_id: ownerA }] },
      { run_id: "run-a" },
    ];
    const { client } = createMockClient({
      problem_intelligence: [{ problem_title: "Authorized shared aggregate", intelligence_score: 80 }],
      weekly_detected_problems: [
        { ...ownedRun, problem_title: "A private problem" },
        ...invalidRuns.map((run) => ({ ...run, problem_title: "UNAUTHORIZED problem" })),
      ],
      weekly_sources: [
        { ...ownedRun, source_title: "A private source" },
        ...invalidRuns.map((run) => ({ ...run, source_title: "UNAUTHORIZED source" })),
      ],
    });
    const sources = await collectDataMoatSources(ownerA, client);
    assert.deepEqual(sources.map((source) => source.title), [
      "Data Moat Problem: Authorized shared aggregate", "Weekly Problem: A private problem", "A private source",
    ]);
    assert.deepEqual(sources.map((source) => source.source_rank), [1, 2, 3]);
    assert.doesNotMatch(JSON.stringify(sources), /UNAUTHORIZED|weekly_intelligence_runs|run_id|user_id/);
  });
});
