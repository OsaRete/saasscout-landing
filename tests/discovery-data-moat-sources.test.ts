import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { collectDataMoatSources } from "../lib/knowledge/discovery-data-moat-sources.ts";

type QueryCall = {
  table: string;
  select?: string;
  order?: { column: string; ascending: boolean };
  limit?: number;
};

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

    await collectDataMoatSources(client);

    assert.deepEqual(calls, [
      {
        table: "problem_intelligence",
        select: "*",
        order: { column: "intelligence_score", ascending: false },
        limit: 15,
      },
      {
        table: "weekly_detected_problems",
        select: "*",
        order: { column: "created_at", ascending: false },
        limit: 15,
      },
      {
        table: "weekly_sources",
        select: "*",
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
          problem_summary: "Agencies spend hours preparing reports.",
          source_evidence: "Repeated weekly mentions.",
          trend_score: 7,
        },
      ],
      weekly_sources: [
        {
          source_title: "Agency operators complain about reporting",
          source_url: "https://example.com/reporting",
          source_snippet: "Manual reporting is painful.",
          signal_score: 42,
          category: "Operations",
        },
      ],
    });

    const sources = await collectDataMoatSources(client);

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
        problem_title: `Weekly Problem ${index + 1}`,
        trend_score: index + 1,
      })),
      weekly_sources: Array.from({ length: 20 }, (_, index) => ({
        source_title: `Weekly Source ${index + 1}`,
        signal_score: index + 1,
      })),
    });

    const sources = await collectDataMoatSources(client);

    assert.equal(sources.length, 30);
    assert.equal(sources.at(-1)?.title, "Weekly Problem: Weekly Problem 15");
  });
});
