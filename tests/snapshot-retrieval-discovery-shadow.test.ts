import test from "node:test";
import assert from "node:assert/strict";

import { parseSnapshotRetrievalMode } from "../lib/intelligence/snapshots/retrieval/config.ts";
import { buildDiscoverOpportunitiesRetrievalQuery } from "../lib/intelligence/snapshots/retrieval/discover-opportunities-query-adapter.ts";
import { runDiscoverOpportunitiesSnapshotRetrievalShadow } from "../lib/intelligence/snapshots/retrieval/discover-opportunities-shadow-runner.ts";
import { readFileSync } from "node:fs";
import type { SnapshotRetrievalOutcome } from "../lib/intelligence/snapshots/retrieval/index.ts";

test("configuration parser accepts only disabled and shadow", () => {
  assert.equal(parseSnapshotRetrievalMode(undefined), "disabled");
  assert.equal(parseSnapshotRetrievalMode(""), "disabled");
  assert.equal(parseSnapshotRetrievalMode("true"), "disabled");
  assert.equal(parseSnapshotRetrievalMode("influence"), "disabled");
  assert.equal(parseSnapshotRetrievalMode("disabled"), "disabled");
  assert.equal(parseSnapshotRetrievalMode("shadow"), "shadow");
});

test("discover opportunities retrieval query adapter is deterministic and bounded", () => {
  const input = Object.freeze({
    userId: "user-123",
    queryText: "  Agency onboarding workflow  ",
    referenceTimestamp: "2026-07-13T00:00:00.000Z",
    currentDiscoveryId: "discovery-current",
    niches: Object.freeze(["Agencies", "Agencies", "  "]),
    clusters: Object.freeze([]),
    keywords: Object.freeze(["workflow"]),
  });
  const first = buildDiscoverOpportunitiesRetrievalQuery(input);
  const second = buildDiscoverOpportunitiesRetrievalQuery(input);

  assert.deepEqual(first, second);
  assert.equal(first.userId, "user-123");
  assert.equal(first.rawQueryText, "Agency onboarding workflow");
  assert.equal(first.referenceTimestamp, "2026-07-13T00:00:00.000Z");
  assert.equal(first.maxCandidates, 50);
  assert.equal(first.resultLimit, 5);
  assert.equal(first.excludeDiscoveryId, "discovery-current");
  assert.deepEqual(first.niches, ["Agencies"]);
  assert.equal(first.clusters, undefined);
  assert.deepEqual(first.keywords, ["workflow"]);
  assert.deepEqual(input.niches, ["Agencies", "Agencies", "  "]);
});

function outcome(overrides: Partial<SnapshotRetrievalOutcome> = {}): SnapshotRetrievalOutcome {
  return {
    status: "shadow_success",
    results: [],
    historicalContext: [],
    diagnostics: {
      mode: "shadow",
      ownershipScope: "user",
      queryFingerprint: "fnv1a32:test",
      candidateCount: 0,
      rankedResultCount: 0,
      contextCount: 0,
      repositoryCalled: true,
    },
    ...overrides,
  };
}

test("disabled mode performs zero repository or executor calls", async () => {
  let repositoryCalls = 0;
  let executorCalls = 0;
  const result = await runDiscoverOpportunitiesSnapshotRetrievalShadow({
    userId: "user-123",
    queryText: "agency workflow",
    referenceTimestamp: "2026-07-13T00:00:00.000Z",
    mode: "disabled",
    repositoryFactory: () => {
      repositoryCalls += 1;
      return { async findCandidates() { return []; } };
    },
    executor: async () => {
      executorCalls += 1;
      return outcome();
    },
  });

  assert.equal(result, null);
  assert.equal(repositoryCalls, 0);
  assert.equal(executorCalls, 0);
});

test("shadow mode invokes retrieval once with authenticated user and logs safe metrics", async () => {
  const infoLogs: string[] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => { infoLogs.push(JSON.stringify(args)); };
  try {
    let repositoryCalls = 0;
    let executorCalls = 0;
    let userId: string | undefined;
    const result = await runDiscoverOpportunitiesSnapshotRetrievalShadow({
      userId: "user-123",
      queryText: "secret raw agency workflow",
      referenceTimestamp: "2026-07-13T00:00:00.000Z",
      mode: "shadow",
      repositoryFactory: () => {
        repositoryCalls += 1;
        return { async findCandidates() { return []; } };
      },
      executor: async ({ query }) => {
        executorCalls += 1;
        userId = query.userId;
        return outcome({
          results: [{ score: 0.91 } as never],
          historicalContext: [{ title: "historical secret content" } as never],
          diagnostics: { ...outcome().diagnostics, candidateCount: 3, rankedResultCount: 1, contextCount: 1 },
        });
      },
    });

    assert.equal(repositoryCalls, 1);
    assert.equal(executorCalls, 1);
    assert.equal(userId, "user-123");
    assert.equal(result?.status, "shadow_success");
    const serialized = infoLogs.join("\n");
    assert.match(serialized, /snapshot_retrieval_shadow_result/);
    assert.match(serialized, /fnv1a32:test/);
    assert.doesNotMatch(serialized, /secret raw agency workflow/);
    assert.doesNotMatch(serialized, /historical secret content/);
  } finally {
    console.info = originalInfo;
  }
});

test("shadow empty and controlled failures are non-disruptive", async () => {
  const empty = await runDiscoverOpportunitiesSnapshotRetrievalShadow({
    userId: "user-123",
    queryText: "agency workflow",
    referenceTimestamp: "2026-07-13T00:00:00.000Z",
    mode: "shadow",
    executor: async () => outcome(),
    repositoryFactory: () => ({ async findCandidates() { return []; } }),
  });
  assert.equal(empty?.status, "shadow_success");

  const failed = await runDiscoverOpportunitiesSnapshotRetrievalShadow({
    userId: "user-123",
    queryText: "agency workflow",
    referenceTimestamp: "2026-07-13T00:00:00.000Z",
    mode: "shadow",
    executor: async () => { throw new Error("service role secret should not leak"); },
    repositoryFactory: () => ({ async findCandidates() { return []; } }),
  });
  assert.equal(failed?.status, "error");
  assert.equal(failed?.historicalContext.length, 0);
});


test("workflow integration keeps prompts, public response, and persistence free of retrieval context", () => {
  const source = readFileSync("lib/intelligence/discover-opportunities-workflow.ts", "utf8");
  const analysisCall = source.match(/const analysis = await analyzeSignals\(\{[\s\S]*?\}\);/)?.[0] ?? "";
  const snapshotInputCall = source.match(/const discoverySnapshotInput = buildDiscoverOpportunitiesSnapshotInput\(\{[\s\S]*?\}\);/)?.[0] ?? "";
  const returnBlock = source.slice(source.indexOf("return {\n    success: true"));

  assert.match(source, /await retrievalPromise;\n\n  const analysis = await analyzeSignals/);
  assert.doesNotMatch(analysisCall, /retrieval|historicalContext|SnapshotRetrieval/i);
  assert.doesNotMatch(snapshotInputCall, /retrieval|historicalContext|SnapshotRetrieval/i);
  assert.doesNotMatch(returnBlock, /retrieval|historicalContext|SnapshotRetrieval/i);
});

test("server-only retrieval repository is not imported by client components or browser-safe barrels", () => {
  const workflowSource = readFileSync("lib/intelligence/discover-opportunities-workflow.ts", "utf8");
  const runnerSource = readFileSync("lib/intelligence/snapshots/retrieval/discover-opportunities-shadow-runner.ts", "utf8");
  const retrievalBarrel = readFileSync("lib/intelligence/snapshots/retrieval/index.ts", "utf8");

  assert.match(workflowSource, /discover-opportunities-shadow-runner/);
  assert.match(runnerSource, /supabase-repository/);
  assert.equal(retrievalBarrel.includes("supabase-repository"), false);
  assert.equal(readFileSync("app/discover/page.tsx", "utf8").includes("supabase-repository"), false);
});
