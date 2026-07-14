import type { SnapshotRetrievalQualityClassification } from "./quality-diagnostics.ts";

export type SnapshotRetrievalShadowMetric = Readonly<{
  status: "shadow_success" | "disabled" | "unsupported_mode" | "error";
  candidatesRead: number;
  resultsReturned: number;
  topScores: readonly number[];
  qualityClassification: SnapshotRetrievalQualityClassification;
  durationMs: number;
  duplicateCandidateCount: number;
  warningsCount: number;
}>;

export type SnapshotRetrievalCalibrationSummary = Readonly<{
  executionCount: number;
  successCount: number;
  emptyCount: number;
  errorCount: number;
  averageCandidatesRead: number;
  averageResultsReturned: number;
  averageTopScore: number;
  medianTopScore: number;
  p95DurationMs: number;
  classificationCounts: Readonly<Record<SnapshotRetrievalQualityClassification, number>>;
  zeroCandidateRate: number;
  nonRelevantTopResultRate: number;
  duplicateRate: number;
  warningRate: number;
}>;

function roundMetric(value: number): number {
  return Number((Number.isFinite(value) ? value : 0).toFixed(6));
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : sorted[middle] ?? 0;
}

function nearestRankP95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1));
  return sorted[index] ?? 0;
}

export function summarizeSnapshotRetrievalCalibration(metrics: readonly SnapshotRetrievalShadowMetric[]): SnapshotRetrievalCalibrationSummary {
  const executionCount = metrics.length;
  const divisor = executionCount === 0 ? 1 : executionCount;
  const topScores = metrics.map((metric) => metric.topScores[0]).filter((score): score is number => Number.isFinite(score));
  const classificationCounts: Record<SnapshotRetrievalQualityClassification, number> = {
    strongly_related: 0,
    partially_related: 0,
    weakly_related: 0,
    not_relevant: 0,
    empty: 0,
  };
  for (const metric of metrics) classificationCounts[metric.qualityClassification] += 1;
  return Object.freeze({
    executionCount,
    successCount: metrics.filter((metric) => metric.status === "shadow_success").length,
    emptyCount: metrics.filter((metric) => metric.qualityClassification === "empty" || metric.resultsReturned === 0).length,
    errorCount: metrics.filter((metric) => metric.status === "error" || metric.status === "unsupported_mode").length,
    averageCandidatesRead: roundMetric(average(metrics.map((metric) => metric.candidatesRead))),
    averageResultsReturned: roundMetric(average(metrics.map((metric) => metric.resultsReturned))),
    averageTopScore: roundMetric(average(topScores)),
    medianTopScore: roundMetric(median(topScores)),
    p95DurationMs: roundMetric(nearestRankP95(metrics.map((metric) => metric.durationMs))),
    classificationCounts: Object.freeze(classificationCounts),
    zeroCandidateRate: roundMetric(metrics.filter((metric) => metric.candidatesRead === 0).length / divisor),
    nonRelevantTopResultRate: roundMetric(metrics.filter((metric) => metric.resultsReturned > 0 && metric.qualityClassification === "not_relevant").length / divisor),
    duplicateRate: roundMetric(metrics.filter((metric) => metric.duplicateCandidateCount > 0).length / divisor),
    warningRate: roundMetric(metrics.filter((metric) => metric.warningsCount > 0).length / divisor),
  });
}
