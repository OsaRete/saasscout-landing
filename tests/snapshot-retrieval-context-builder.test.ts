import test from "node:test";
import assert from "node:assert/strict";
import { buildSnapshotHistoricalContext } from "../lib/intelligence/snapshots/retrieval/index.ts";
import type { SnapshotRetrievalResult } from "../lib/intelligence/snapshots/retrieval/index.ts";

const result = (id: string): SnapshotRetrievalResult => ({
  snapshotId: id, discoveryId: `discovery-${id}`, contractVersion: "1", createdAt: "2026-07-10T00:00:00.000Z", lifecycleState: "persisted", ownership: { userId: "user", discoveryId: `discovery-${id}`, scope: "user" },
  title: "  Title   text ", summary: " Summary\n text ", opportunitySummary: " Opportunity   text ", relatedNiches: [" Niche  One "], affectedMarket: " Agencies ", confidence: 0.7, evidenceCount: 9, sourceTypes: ["forum", "forum", "review"],
  claimSnippets: [" a ".repeat(200), " second\nclaim ", " third ", " fourth "], score: 0.5, scoreBreakdown: { queryTextMatch: 0, nicheOverlap: 0, clusterOverlap: 0, evidenceStrength: 0, snapshotConfidence: 0.7, provenanceDiversity: 0, freshness: 0 }, explanations: [" Explanation  one "]
});

test("context output is deterministic, redacted, normalized, limited, and immutable", () => {
  const results = Array.from({ length: 12 }, (_, i) => result(String(i)));
  const before = JSON.stringify(results);
  const contexts = buildSnapshotHistoricalContext(results, 99);
  assert.deepEqual(contexts, buildSnapshotHistoricalContext(results, 99));
  assert.equal(contexts.length, 10);
  assert.equal(contexts[0]?.title, "Title text");
  assert.equal(contexts[0]?.claimSnippets.length, 3);
  assert.ok((contexts[0]?.claimSnippets[0]?.length ?? 0) <= 220);
  assert.deepEqual(contexts[0]?.sourceTypes, ["forum", "review"]);
  assert.deepEqual(contexts[0]?.retrievalExplanations, ["Explanation one"]);
  assert.equal(JSON.stringify(results), before);
  assert.equal("ownership" in (contexts[0] as object), false);
  assert.equal("scoreBreakdown" in (contexts[0] as object), false);
});
