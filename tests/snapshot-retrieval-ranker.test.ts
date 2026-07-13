import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSnapshotRetrievalQuery, tokenizeDeterministically, rankSnapshotRetrievalCandidates, SNAPSHOT_RETRIEVAL_WEIGHT_SUM, calculateSnapshotRetrievalBreakdown } from "../lib/intelligence/snapshots/retrieval/index.ts";
import type { SnapshotRetrievalCandidate, SnapshotRetrievalQuery } from "../lib/intelligence/snapshots/retrieval/index.ts";

const query: SnapshotRetrievalQuery = { rawQueryText: " Agency   onboarding workflow ", userId: "user-1", niches: ["Client Onboarding", "client onboarding"], clusters: ["Agencies"], keywords: ["workflow"], maxCandidates: 50, resultLimit: 5, referenceTimestamp: "2026-07-13T00:00:00.000Z" };
const candidate = (overrides: Partial<SnapshotRetrievalCandidate> = {}): SnapshotRetrievalCandidate => ({
  snapshotId: "snapshot-a", discoveryId: "discovery-a", contractVersion: "1.0", createdAt: "2026-07-10T00:00:00.000Z", lifecycleState: "persisted",
  ownership: { userId: "user-1", organizationId: null, discoveryId: "discovery-a", scope: "user" },
  problem: { title: "Agency onboarding workflow gaps", summary: "Onboarding is scattered", affectedMarket: "Agencies", relatedNiches: ["Client onboarding"] },
  opportunity: { summary: "Build a focused onboarding workflow." },
  confidence: { overall: 0.8 },
  evidenceSignals: [{ claimSnippet: "Agency onboarding workflow is manual.", confidence: 0.8, supportingTargetCount: 2, sourceType: "forum" }],
  sourceTypes: ["forum", "review"],
  ...overrides,
});

test("weights sum to 1", () => assert.equal(SNAPSHOT_RETRIEVAL_WEIGHT_SUM, 1));
test("normalization and tokenization are deterministic", () => {
  assert.deepEqual(tokenizeDeterministically("  Alpha alpha\nBETA!!  "), ["alpha", "beta"]);
  assert.deepEqual(normalizeSnapshotRetrievalQuery(query), normalizeSnapshotRetrievalQuery({ ...query }));
});
test("factors clamp to 0-1 and expected overlaps/fallbacks apply", () => {
  const b = calculateSnapshotRetrievalBreakdown(normalizeSnapshotRetrievalQuery(query), candidate({ confidence: undefined, evidenceSignals: [{ claimSnippet: "x", confidence: 2, supportingTargetCount: 99 }], sourceTypes: ["a", "b", "c", "d", "e"] }));
  for (const value of Object.values(b)) assert.ok(value >= 0 && value <= 1);
  assert.equal(b.snapshotConfidence, 0.5);
  assert.equal(b.provenanceDiversity, 1);
  assert.ok(b.queryTextMatch > 0);
  assert.ok(b.nicheOverlap > 0);
  assert.ok(b.clusterOverlap > 0);
  assert.ok(b.evidenceStrength > 0);
});
test("freshness uses explicit reference time and invalid timestamp fallback", () => {
  const normal = calculateSnapshotRetrievalBreakdown(normalizeSnapshotRetrievalQuery(query), candidate()).freshness;
  const invalid = calculateSnapshotRetrievalBreakdown(normalizeSnapshotRetrievalQuery(query), candidate({ createdAt: "invalid" })).freshness;
  assert.ok(normal > 0);
  assert.equal(invalid, 0);
});
test("ranking is deterministic, caps candidates, respects result limit, and does not mutate input", () => {
  const candidates = [candidate({ snapshotId: "snapshot-c" }), candidate({ snapshotId: "snapshot-b" }), candidate({ snapshotId: "snapshot-a" })];
  const before = JSON.stringify(candidates);
  const q = { ...query, resultLimit: 2, maxCandidates: 1000 };
  assert.deepEqual(rankSnapshotRetrievalCandidates(q, candidates), rankSnapshotRetrievalCandidates(q, candidates));
  assert.equal(rankSnapshotRetrievalCandidates(q, candidates).length, 2);
  assert.equal(JSON.stringify(candidates), before);
});
test("tie-break rules order total score, query text, evidence, createdAt, then snapshotId", () => {
  const base = candidate();
  assert.equal(rankSnapshotRetrievalCandidates(query, [candidate({ snapshotId: "low", confidence: { overall: 0.1 } }), candidate({ snapshotId: "high", confidence: { overall: 1 } })])[0]?.snapshotId, "high");
  assert.equal(rankSnapshotRetrievalCandidates(query, [candidate({ snapshotId: "less-text", problem: { ...base.problem, title: "unrelated", summary: "unrelated" }, opportunity: { summary: "unrelated" }, evidenceSignals: [{ claimSnippet: "unrelated", confidence: 0.8, supportingTargetCount: 2 }] }), candidate({ snapshotId: "more-text" })])[0]?.snapshotId, "more-text");
  assert.equal(rankSnapshotRetrievalCandidates({ ...query, rawQueryText: "zzz", niches: [], clusters: [] }, [candidate({ snapshotId: "less-evidence", evidenceSignals: [{ claimSnippet: "x", confidence: 0.5, supportingTargetCount: 0 }], sourceTypes: [] }), candidate({ snapshotId: "more-evidence", evidenceSignals: [{ claimSnippet: "x", confidence: 1, supportingTargetCount: 3 }], sourceTypes: [] })])[0]?.snapshotId, "more-evidence");
  assert.equal(rankSnapshotRetrievalCandidates({ ...query, rawQueryText: "zzz", niches: [], clusters: [] }, [candidate({ snapshotId: "old", createdAt: "2026-01-01T00:00:00.000Z" }), candidate({ snapshotId: "new", createdAt: "2026-07-12T00:00:00.000Z" })])[0]?.snapshotId, "new");
  assert.equal(rankSnapshotRetrievalCandidates(query, [candidate({ snapshotId: "b" }), candidate({ snapshotId: "a" })])[0]?.snapshotId, "a");
});
test("empty and invalid lifecycle candidates return empty", () => {
  assert.deepEqual(rankSnapshotRetrievalCandidates(query, []), []);
  assert.deepEqual(rankSnapshotRetrievalCandidates(query, [candidate({ lifecycleState: "created" as never })]), []);
});
