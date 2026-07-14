import test from "node:test";
import assert from "node:assert/strict";
import { calculateSnapshotRetrievalScoreDistribution, classifySnapshotRetrievalQuality, getSnapshotRetrievalTopResultBreakdown, summarizeSnapshotRetrievalDuplicates } from "../lib/intelligence/snapshots/retrieval/quality-diagnostics.ts";
import { fingerprintSnapshotRetrievalExecution } from "../lib/intelligence/snapshots/retrieval/server-retrieval-executor.ts";
import type { SnapshotRetrievalCandidate, SnapshotRetrievalResult } from "../lib/intelligence/snapshots/retrieval/index.ts";

function result(score: number, factors: Partial<SnapshotRetrievalResult["scoreBreakdown"]> = {}): SnapshotRetrievalResult {
  return { score, scoreBreakdown: { queryTextMatch: 0, nicheOverlap: 0, clusterOverlap: 0, evidenceStrength: 0, snapshotConfidence: 0, provenanceDiversity: 0, freshness: 0, ...factors } } as SnapshotRetrievalResult;
}

test("quality classification covers relevance levels and evidence cannot create thematic relevance", () => {
  assert.equal(classifySnapshotRetrievalQuality(result(0.6, { queryTextMatch: 0.5 })), "strongly_related");
  assert.equal(classifySnapshotRetrievalQuality(result(0.35, { nicheOverlap: 0.1 })), "partially_related");
  assert.equal(classifySnapshotRetrievalQuality(result(0.01, { clusterOverlap: 0.01 })), "weakly_related");
  assert.equal(classifySnapshotRetrievalQuality(result(0.9, { evidenceStrength: 1, snapshotConfidence: 1, freshness: 1 })), "not_relevant");
  assert.equal(classifySnapshotRetrievalQuality(undefined), "empty");
  assert.equal(classifySnapshotRetrievalQuality(result(0.599999, { queryTextMatch: 0.5 })), "partially_related");
  assert.equal(classifySnapshotRetrievalQuality(result(0.6, { queryTextMatch: 0.499999 })), "partially_related");
  assert.equal(classifySnapshotRetrievalQuality(result(0.349999, { queryTextMatch: 0.1 })), "weakly_related");
});

test("diagnostics clamp unsafe factor values and do not mutate inputs", () => {
  const input = Object.freeze(result(2, { queryTextMatch: 2, evidenceStrength: -1, snapshotConfidence: Number.NaN, freshness: 1 }));
  const first = getSnapshotRetrievalTopResultBreakdown(input);
  const second = getSnapshotRetrievalTopResultBreakdown(input);
  assert.deepEqual(first, second);
  assert.equal(first?.total, 1);
  assert.equal(first?.queryTextMatch, 1);
  assert.equal(first?.evidenceStrength, 0);
  assert.equal(first?.snapshotConfidence, 0);
  assert.deepEqual(input.scoreBreakdown.queryTextMatch, 2);
});

test("duplicate diagnostics count groups deterministically without mutation", () => {
  const candidates = Object.freeze([{ snapshotId: "a" }, { snapshotId: "a" }, { snapshotId: "b" }, { snapshotId: "c" }, { snapshotId: "c" }, { snapshotId: "c" }] as readonly Pick<SnapshotRetrievalCandidate, "snapshotId">[]);
  assert.deepEqual(summarizeSnapshotRetrievalDuplicates(candidates), { candidatesRead: 6, uniqueSnapshotCount: 3, duplicateCandidateCount: 3, duplicateSnapshotIdCount: 2 });
  assert.deepEqual(summarizeSnapshotRetrievalDuplicates([{ snapshotId: "a" }, { snapshotId: "b" }] as never), { candidatesRead: 2, uniqueSnapshotCount: 2, duplicateCandidateCount: 0, duplicateSnapshotIdCount: 0 });
  assert.equal(candidates.length, 6);
});

test("score distribution handles empty, median, p95, zero, near-zero, and stable rounding", () => {
  assert.deepEqual(calculateSnapshotRetrievalScoreDistribution([]), { count: 0, minScore: 0, maxScore: 0, averageScore: 0, medianScore: 0, p95Score: 0, zeroScoreCount: 0, nearZeroScoreCount: 0, thematicRelevantCount: 0, nonRelevantQualityLiftCount: 0 });
  assert.equal(calculateSnapshotRetrievalScoreDistribution([result(0.2)]).p95Score, 0.2);
  assert.equal(calculateSnapshotRetrievalScoreDistribution([result(0.1), result(0.3), result(0.2)]).medianScore, 0.2);
  assert.equal(calculateSnapshotRetrievalScoreDistribution([result(0.1), result(0.4)]).medianScore, 0.25);
  const distribution = calculateSnapshotRetrievalScoreDistribution([result(0), result(0.01), result(0.333333333), result(0.9, { queryTextMatch: 0.1 }), result(0.8, { evidenceStrength: 1 })]);
  assert.equal(distribution.zeroScoreCount, 1);
  assert.equal(distribution.nearZeroScoreCount, 1);
  assert.equal(distribution.averageScore, 0.408667);
  assert.equal(distribution.p95Score, 0.9);
  assert.equal(distribution.thematicRelevantCount, 1);
  assert.equal(distribution.nonRelevantQualityLiftCount, 1);
});

test("top result breakdown exposes only approved aggregate fields", () => {
  const breakdown = getSnapshotRetrievalTopResultBreakdown(result(0.6, { queryTextMatch: 0.5, evidenceStrength: 0.7 }));
  assert.deepEqual(Object.keys(breakdown ?? {}).sort(), ["clusterOverlap", "evidenceStrength", "freshness", "hasThematicRelevance", "nicheOverlap", "provenanceDiversity", "qualityClassification", "qualityScoreLift", "queryTextMatch", "snapshotConfidence", "total"].sort());
  assert.equal(JSON.stringify(breakdown).includes("snapshotId"), false);
  assert.equal(JSON.stringify(breakdown).includes("claim"), false);
  assert.equal(JSON.stringify(breakdown).includes("source"), false);
});

test("execution fingerprint is deterministic, changes with inputs, and omits raw material", () => {
  const rawUser = "user-secret-123";
  const rawDiscovery = "discovery-secret-456";
  const first = fingerprintSnapshotRetrievalExecution({ queryFingerprint: "fnv1a32:abc", referenceTimestamp: "2026-07-13T00:00:00.000Z", userId: rawUser, discoveryId: rawDiscovery });
  assert.equal(first, fingerprintSnapshotRetrievalExecution({ queryFingerprint: "fnv1a32:abc", referenceTimestamp: "2026-07-13T00:00:00.000Z", userId: rawUser, discoveryId: rawDiscovery }));
  assert.notEqual(first, fingerprintSnapshotRetrievalExecution({ queryFingerprint: "fnv1a32:def", referenceTimestamp: "2026-07-13T00:00:00.000Z", userId: rawUser, discoveryId: rawDiscovery }));
  assert.equal(first.includes(rawUser), false);
  assert.equal(first.includes(rawDiscovery), false);
  assert.match(first, /^sha256:[0-9a-f]{32}$/);
});
