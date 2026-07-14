import test from "node:test";
import assert from "node:assert/strict";
import { summarizeSnapshotRetrievalCalibration } from "../lib/intelligence/snapshots/retrieval/calibration-summary.ts";
import type { SnapshotRetrievalShadowMetric } from "../lib/intelligence/snapshots/retrieval/index.ts";

test("calibration summary aggregates mixed metrics deterministically", () => {
  const metrics: readonly SnapshotRetrievalShadowMetric[] = Object.freeze([
    { status: "shadow_success", candidatesRead: 10, resultsReturned: 2, topScores: [0.8], qualityClassification: "strongly_related", durationMs: 100, duplicateCandidateCount: 0, warningsCount: 0 },
    { status: "shadow_success", candidatesRead: 0, resultsReturned: 0, topScores: [], qualityClassification: "empty", durationMs: 50, duplicateCandidateCount: 0, warningsCount: 1 },
    { status: "error", candidatesRead: 5, resultsReturned: 1, topScores: [0.2], qualityClassification: "not_relevant", durationMs: 300, duplicateCandidateCount: 2, warningsCount: 1 },
  ]);
  const summary = summarizeSnapshotRetrievalCalibration(metrics);
  assert.deepEqual(summary, {
    executionCount: 3,
    successCount: 2,
    emptyCount: 1,
    errorCount: 1,
    averageCandidatesRead: 5,
    averageResultsReturned: 1,
    averageTopScore: 0.5,
    medianTopScore: 0.5,
    p95DurationMs: 300,
    classificationCounts: { strongly_related: 1, partially_related: 0, weakly_related: 0, not_relevant: 1, empty: 1 },
    zeroCandidateRate: 0.333333,
    nonRelevantTopResultRate: 0.333333,
    duplicateRate: 0.333333,
    warningRate: 0.666667,
  });
  assert.deepEqual(summary, summarizeSnapshotRetrievalCalibration(metrics));
});
